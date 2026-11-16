import { prisma } from "@/lib/db";
import { Prisma, type Customer, type Loan } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { normalizeMobile } from "@/lib/whatsapp";
import { formatCustomerCode, temporaryReference } from "@/lib/references";
import { writeAudit } from "@/lib/audit";
import type { CustomerInput } from "@/lib/validation";
import { collectedByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";
import { getIndiaTodayISO } from "@/lib/dates";

export interface CustomerListParams {
  q?: string;
  status?: "active" | "archived" | "all";
  page?: number;
  pageSize?: number;
}

export interface CustomerListRow {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
  alternateMobile: string | null;
  address: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  totalLoans: number;
  activeLoans: number;
  outstanding: string;
}

export async function listCustomers(params: CustomerListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const where: Prisma.CustomerWhereInput = {};
  if (params.status === "archived") where.archivedAt = { not: null };
  else if (params.status !== "all") where.archivedAt = null;
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      { code: { contains: q, mode: "insensitive" } },
      { alternateMobile: { contains: q } },
    ];
  }

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const ids = customers.map((c) => c.id);
  const loans = ids.length
    ? await prisma.loan.findMany({
        where: { customerId: { in: ids } },
        select: { id: true, customerId: true, status: true, totalRepayment: true },
      })
    : [];
  const collected = await collectedByLoan(loans.map((l) => l.id));

  const items: CustomerListRow[] = customers.map((customer) => {
    const customerLoans = loans.filter((l) => l.customerId === customer.id);
    const activeLoans = customerLoans.filter((l) => l.status === "ACTIVE");
    const outstanding = sumMoney(
      activeLoans.map((l) => outstandingFrom(l.totalRepayment, collected.get(l.id) ?? "0")),
    );
    return {
      id: customer.id,
      code: customer.code,
      fullName: customer.fullName,
      mobile: customer.mobile,
      alternateMobile: customer.alternateMobile,
      address: customer.address,
      archivedAt: customer.archivedAt,
      createdAt: customer.createdAt,
      totalLoans: customerLoans.length,
      activeLoans: activeLoans.length,
      outstanding: money(outstanding),
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function searchCustomers(q: string, limit = 20) {
  const where: Prisma.CustomerWhereInput = { archivedAt: null };
  if (q.trim()) {
    const term = q.trim();
    where.OR = [
      { fullName: { contains: term, mode: "insensitive" } },
      { mobile: { contains: term } },
      { code: { contains: term, mode: "insensitive" } },
    ];
  }
  return prisma.customer.findMany({
    where,
    orderBy: { fullName: "asc" },
    take: limit,
    select: { id: true, code: true, fullName: true, mobile: true },
  });
}

export async function createCustomer(input: CustomerInput, adminId: string, ipAddress?: string | null): Promise<Customer> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) throw new Error("Invalid mobile number");
  const alternateMobile = input.alternateMobile ? normalizeMobile(input.alternateMobile) : null;

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        code: temporaryReference("CUS"),
        fullName: input.fullName.trim(),
        mobile,
        alternateMobile,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    const updated = await tx.customer.update({
      where: { id: created.id },
      data: { code: formatCustomerCode(created.seq) },
    });
    await writeAudit(tx, {
      actorId: adminId,
      action: "CUSTOMER_CREATED",
      entityType: "Customer",
      entityId: updated.id,
      summary: `Customer ${updated.code} (${updated.fullName}) created`,
      metadata: { mobile: updated.mobile },
      ipAddress,
    });
    return updated;
  });

  return customer;
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
  adminId: string,
  ipAddress?: string | null,
): Promise<Customer> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) throw new Error("Invalid mobile number");
  const alternateMobile = input.alternateMobile ? normalizeMobile(input.alternateMobile) : null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({ where: { id } });
    if (!existing) throw new Error("Customer not found");
    const updated = await tx.customer.update({
      where: { id },
      data: {
        fullName: input.fullName.trim(),
        mobile,
        alternateMobile,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    await writeAudit(tx, {
      actorId: adminId,
      action: "CUSTOMER_UPDATED",
      entityType: "Customer",
      entityId: id,
      summary: `Customer ${updated.code} (${updated.fullName}) updated`,
      metadata: { before: { fullName: existing.fullName, mobile: existing.mobile }, after: { fullName: updated.fullName, mobile: updated.mobile } },
      ipAddress,
    });
    return updated;
  });
}

export async function setCustomerArchived(
  id: string,
  archived: boolean,
  adminId: string,
  ipAddress?: string | null,
): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { loans: { select: { status: true } } },
  });
  if (!customer) throw new Error("Customer not found");
  if (archived && customer.loans.some((l) => l.status === "ACTIVE" || l.status === "DRAFT")) {
    throw new Error("Cannot archive a customer with active or draft loans. Complete or cancel those loans first.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, {
      actorId: adminId,
      action: archived ? "CUSTOMER_ARCHIVED" : "CUSTOMER_UNARCHIVED",
      entityType: "Customer",
      entityId: id,
      summary: `Customer ${customer.code} ${archived ? "archived" : "restored"}`,
      ipAddress,
    });
  });
}

export interface CustomerLoanSummary {
  id: string;
  reference: string;
  status: Loan["status"];
  frequency: Loan["frequency"];
  nominalAmount: string;
  netDisbursed: string;
  totalRepayment: string;
  installmentAmount: string;
  installmentCount: number;
  startDate: string;
  collected: string;
  outstanding: string;
  nextDueDate: string | null;
  nextDueAmount: string | null;
  overdueAmount: string;
  overdueCount: number;
}

export async function getCustomerDetail(id: string) {
  await syncInstallmentStatuses();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      loans: {
        orderBy: { createdAt: "desc" },
        include: { installments: { orderBy: { sequence: "asc" } } },
      },
    },
  });
  if (!customer) return null;

  const loanIds = customer.loans.map((l) => l.id);
  const collected = await collectedByLoan(loanIds);
  const today = getIndiaTodayISO();

  const loans: CustomerLoanSummary[] = customer.loans.map((loan) => {
    const paid = collected.get(loan.id) ?? "0";
    const openInstallments = loan.installments.filter((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
    const overdue = openInstallments.filter((i) => i.dueDate.toISOString().slice(0, 10) < today);
    const next = openInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    return {
      id: loan.id,
      reference: loan.reference,
      status: loan.status,
      frequency: loan.frequency,
      nominalAmount: money(loan.nominalAmount),
      netDisbursed: money(loan.netDisbursed),
      totalRepayment: money(loan.totalRepayment),
      installmentAmount: money(loan.installmentAmount),
      installmentCount: loan.installmentCount,
      startDate: loan.startDate.toISOString().slice(0, 10),
      collected: paid,
      outstanding: outstandingFrom(loan.totalRepayment, paid),
      nextDueDate: next ? next.dueDate.toISOString().slice(0, 10) : null,
      nextDueAmount: next ? money(D(next.scheduledAmount).minus(D(next.paidAmount))) : null,
      overdueAmount: money(sumMoney(overdue.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))))),
      overdueCount: overdue.length,
    };
  });

  const activeLoans = loans.filter((l) => l.status === "ACTIVE");
  const aggregateOutstanding = money(sumMoney(activeLoans.map((l) => l.outstanding)));
  const aggregateOverdue = money(sumMoney(activeLoans.map((l) => l.overdueAmount)));

  const payments = await prisma.payment.findMany({
    where: { customerId: id },
    orderBy: { paidAt: "desc" },
    take: 100,
    include: { loan: { select: { reference: true } }, createdBy: { select: { name: true } } },
  });

  return {
    customer,
    loans,
    payments,
    stats: {
      totalLoans: loans.length,
      activeLoans: activeLoans.length,
      aggregateOutstanding,
      aggregateOverdue,
      lifetimeCollected: money(sumMoney(
        customer.loans.map((l) => collected.get(l.id) ?? "0"),
      )),
    },
  };
}
