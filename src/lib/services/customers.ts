import { prisma } from "@/lib/db";
import { Prisma, type Customer, type LoanCategory, type LoanStatus, type LoanFrequency } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { normalizeMobile } from "@/lib/whatsapp";
import { formatCustomerCode, temporaryReference } from "@/lib/references";
import { writeAudit } from "@/lib/audit";
import type { CustomerInput } from "@/lib/validation";
import { paymentBreakdownByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";
import { getIndiaTodayISO } from "@/lib/dates";
import { createLoan } from "@/lib/services/loans";

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
        include: {
          installments: true,
          interestPeriods: true,
        },
      })
    : [];

  const breakdowns = await paymentBreakdownByLoan(loans.map((l) => l.id));
  const today = getIndiaTodayISO();

  const items: CustomerListRow[] = customers.map((customer) => {
    const customerLoans = loans.filter((l) => l.customerId === customer.id);
    const activeLoans = customerLoans.filter((l) => l.status === "ACTIVE");

    let totalCustomerOutstanding = D(0);
    for (const loan of activeLoans) {
      const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
      if (loan.category === "THAVANAI") {
        totalCustomerOutstanding = totalCustomerOutstanding.plus(
          D(outstandingFrom(loan.totalRepayment, b.totalAmount)),
        );
      } else {
        const principalRemaining = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
        const accrued = sumMoney(
          loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
        );
        const pendingInterest = accrued.minus(D(b.interestAmount)).clamp(0, Infinity);
        totalCustomerOutstanding = totalCustomerOutstanding.plus(principalRemaining).plus(pendingInterest);
      }
    }

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
      outstanding: money(totalCustomerOutstanding),
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

export async function createCustomer(
  input: CustomerInput,
  adminId: string,
  ipAddress?: string | null,
): Promise<Customer> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) throw new Error("Invalid mobile number");
  const alternateMobile = input.alternateMobile ? normalizeMobile(input.alternateMobile) : null;

  // Backend duplicate protection: check if same mobile customer was created within 15 seconds
  const recentDuplicate = await prisma.customer.findFirst({
    where: {
      mobile,
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
  });
  if (recentDuplicate) {
    return recentDuplicate;
  }

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

  // Optionally create first loan immediately if requested
  if (input.createInitialLoan && input.initialNominalAmount && Number(input.initialNominalAmount) > 0) {
    const today = getIndiaTodayISO();
    try {
      await createLoan(
        {
          customerId: customer.id,
          category: input.initialLoanCategory || "THAVANAI",
          nominalAmount: input.initialNominalAmount,
          deductionAmount: input.initialDeductionAmount || "0",
          totalRepayment: input.initialTotalRepayment || input.initialNominalAmount,
          installmentAmount: input.initialInstallmentAmount || input.initialNominalAmount,
          frequency: input.initialFrequency || "WEEKLY",
          firstDueDate: today,
          startDate: today,
          interestRate: input.initialInterestRate || "0",
          interestType: input.initialInterestType || "FLAT_SIMPLE",
          activate: true,
        },
        adminId,
        ipAddress,
      );
    } catch {
      // Customer is created; initial loan creation failure does not revert customer
    }
  }

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
  category: LoanCategory;
  status: LoanStatus;
  frequency: LoanFrequency;
  nominalAmount: string;
  deductionAmount: string;
  netDisbursed: string;
  totalRepayment: string;
  installmentAmount: string;
  installmentCount: number;
  interestRate: string | null;
  interestType: string | null;
  collectionDay: number | null;
  startDate: string;
  collected: string;
  principalPaid: string;
  interestPaid: string;
  outstanding: string;
  outstandingPrincipal: string;
  pendingInterest: string;
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
        include: {
          installments: { orderBy: { sequence: "asc" } },
          interestPeriods: { orderBy: { sequence: "asc" } },
        },
      },
    },
  });
  if (!customer) return null;

  const loanIds = customer.loans.map((l) => l.id);
  const breakdowns = await paymentBreakdownByLoan(loanIds);
  const today = getIndiaTodayISO();

  const loans: CustomerLoanSummary[] = customer.loans.map((loan) => {
    const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };

    if (loan.category === "THAVANAI") {
      const openInstallments = loan.installments.filter((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
      const overdue = openInstallments.filter((i) => i.dueDate.toISOString().slice(0, 10) < today);
      const next = openInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
      const outstanding = outstandingFrom(loan.totalRepayment, b.totalAmount);

      return {
        id: loan.id,
        reference: loan.reference,
        category: loan.category,
        status: loan.status,
        frequency: loan.frequency,
        nominalAmount: money(loan.nominalAmount),
        deductionAmount: money(loan.deductionAmount),
        netDisbursed: money(loan.netDisbursed),
        totalRepayment: money(loan.totalRepayment),
        installmentAmount: money(loan.installmentAmount),
        installmentCount: loan.installmentCount,
        interestRate: null,
        interestType: null,
        collectionDay: null,
        startDate: loan.startDate.toISOString().slice(0, 10),
        collected: b.totalAmount,
        principalPaid: b.totalAmount,
        interestPaid: "0.00",
        outstanding,
        outstandingPrincipal: outstanding,
        pendingInterest: "0.00",
        nextDueDate: next ? next.dueDate.toISOString().slice(0, 10) : null,
        nextDueAmount: next ? money(D(next.scheduledAmount).minus(D(next.paidAmount))) : null,
        overdueAmount: money(sumMoney(overdue.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))))),
        overdueCount: overdue.length,
      };
    }

    // MONTHLY_VATTI or WEEKLY_RUN_VATI
    const principalRemaining = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
    const accruedPeriods = loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today);
    const accruedInterest = sumMoney(accruedPeriods.map((p) => p.scheduledAmount));
    const pendingInterest = accruedInterest.minus(D(b.interestAmount)).clamp(0, Infinity);
    const totalOutstanding = principalRemaining.plus(pendingInterest);

    const openPeriods = loan.interestPeriods.filter((p) => D(p.paidAmount).lt(D(p.scheduledAmount)));
    const overduePeriods = openPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) < today);
    const next = openPeriods.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

    return {
      id: loan.id,
      reference: loan.reference,
      category: loan.category,
      status: loan.status,
      frequency: loan.frequency,
      nominalAmount: money(loan.nominalAmount),
      deductionAmount: money(loan.deductionAmount),
      netDisbursed: money(loan.netDisbursed),
      totalRepayment: money(loan.nominalAmount),
      installmentAmount: "0.00",
      installmentCount: loan.installmentCount,
      interestRate: loan.interestRate ? loan.interestRate.toString() : null,
      interestType: loan.interestType,
      collectionDay: loan.collectionDay,
      startDate: loan.startDate.toISOString().slice(0, 10),
      collected: b.totalAmount,
      principalPaid: b.principalAmount,
      interestPaid: b.interestAmount,
      outstanding: money(totalOutstanding),
      outstandingPrincipal: money(principalRemaining),
      pendingInterest: money(pendingInterest),
      nextDueDate: next ? next.dueDate.toISOString().slice(0, 10) : null,
      nextDueAmount: next ? money(D(next.scheduledAmount).minus(D(next.paidAmount))) : null,
      overdueAmount: money(sumMoney(overduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))))),
      overdueCount: overduePeriods.length,
    };
  });

  const activeLoans = loans.filter((l) => l.status === "ACTIVE");

  // Detailed totals across active loans
  const totalPrincipalDisbursed = money(sumMoney(loans.map((l) => l.nominalAmount)));
  const totalCollected = money(sumMoney(loans.map((l) => l.collected)));
  const outstandingPrincipal = money(sumMoney(activeLoans.map((l) => l.outstandingPrincipal)));
  const outstandingInterest = money(sumMoney(activeLoans.map((l) => l.pendingInterest)));
  const totalOutstandingBalance = money(sumMoney(activeLoans.map((l) => l.outstanding)));
  const totalOverdue = money(sumMoney(activeLoans.map((l) => l.overdueAmount)));

  const payments = await prisma.payment.findMany({
    where: { customerId: id },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      loan: { select: { reference: true, category: true } },
      createdBy: { select: { name: true } },
      reversal: true,
    },
  });

  return {
    customer,
    loans,
    thavanaiLoans: loans.filter((l) => l.category === "THAVANAI"),
    monthlyVattiLoans: loans.filter((l) => l.category === "MONTHLY_VATTI"),
    weeklyRunVatiLoans: loans.filter((l) => l.category === "WEEKLY_RUN_VATI"),
    payments,
    stats: {
      totalLoans: loans.length,
      activeLoans: activeLoans.length,
      totalPrincipalDisbursed,
      totalCollected,
      outstandingPrincipal,
      outstandingInterest,
      totalOutstandingBalance,
      totalOverdue,
    },
  };
}
