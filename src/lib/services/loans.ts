import { prisma } from "@/lib/db";
import type { Loan, LoanFrequency, LoanStatus, Prisma } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { computeInstallmentStatus, installmentOutstanding } from "@/lib/installments";
import { buildSchedule } from "@/lib/schedule";
import { formatLoanReference, temporaryReference } from "@/lib/references";
import { getIndiaTodayISO, isoToUtcMidnight, type ISODate } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";
import type { LoanInput } from "@/lib/validation";
import { collectedByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

function parseProvidedCount(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function scheduleForLoanInput(input: LoanInput) {
  return buildSchedule({
    firstDueDate: input.firstDueDate,
    frequency: input.frequency,
    installmentAmount: input.installmentAmount,
    totalRepayment: input.totalRepayment,
    installmentCount: parseProvidedCount(input.installmentCount),
  });
}

export async function createLoan(input: LoanInput, adminId: string, ipAddress?: string | null): Promise<Loan> {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ServiceError("Customer not found.");
  if (customer.archivedAt) throw new ServiceError("Cannot create a loan for an archived customer.");

  const schedule = scheduleForLoanInput(input);
  if (!schedule.ok) throw new ServiceError(schedule.errors[0] ?? "The installment schedule is invalid.");
  if (input.activate && !schedule.ok) throw new ServiceError("The loan cannot be activated until the schedule is valid.");

  const nominal = D(input.nominalAmount);
  const deduction = D(input.deductionAmount);
  const net = nominal.minus(deduction);
  const today = getIndiaTodayISO();
  const year = Number(input.startDate.slice(0, 4));

  return prisma.$transaction(async (tx) => {
    const created = await tx.loan.create({
      data: {
        reference: temporaryReference("LN"),
        customerId: input.customerId,
        nominalAmount: money(nominal),
        deductionAmount: money(deduction),
        netDisbursed: money(net),
        totalRepayment: money(input.totalRepayment),
        installmentAmount: money(input.installmentAmount),
        installmentCount: schedule.installmentCount,
        frequency: input.frequency,
        startDate: isoToUtcMidnight(input.startDate),
        firstDueDate: isoToUtcMidnight(input.firstDueDate),
        disbursementDate: isoToUtcMidnight(input.disbursementDate || input.startDate),
        status: input.activate ? "ACTIVE" : "DRAFT",
        notes: input.notes?.trim() || null,
        terms: input.terms?.trim() || null,
        createdById: adminId,
        activatedAt: input.activate ? new Date() : null,
      },
    });

    const updated = await tx.loan.update({
      where: { id: created.id },
      data: { reference: formatLoanReference(created.seq, year) },
    });

    if (input.activate) {
      await tx.installment.createMany({
        data: schedule.rows.map((row) => ({
          loanId: created.id,
          sequence: row.sequence,
          dueDate: isoToUtcMidnight(row.dueDate),
          scheduledAmount: row.scheduledAmount,
          paidAmount: "0.00",
          status: computeInstallmentStatus({
            dueDate: row.dueDate,
            scheduledAmount: row.scheduledAmount,
            paidAmount: "0",
            today,
          }),
        })),
      });
    }

    await writeAudit(tx, {
      actorId: adminId,
      action: input.activate ? "LOAN_CREATED_ACTIVE" : "LOAN_CREATED_DRAFT",
      entityType: "Loan",
      entityId: created.id,
      summary: `Loan ${updated.reference} for ${customer.fullName}: ${money(net)} disbursed, ${money(input.totalRepayment)} repayment`,
      metadata: {
        nominalAmount: money(nominal),
        deductionAmount: money(deduction),
        netDisbursed: money(net),
        totalRepayment: money(input.totalRepayment),
        installmentCount: schedule.installmentCount,
        frequency: input.frequency,
      },
      ipAddress,
    });

    return updated;
  });
}

export async function activateLoan(id: string, adminId: string, ipAddress?: string | null): Promise<Loan> {
  const today = getIndiaTodayISO();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT "id", "status"::text AS "status" FROM "Loan" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked[0]) throw new ServiceError("Loan not found.");
    if (locked[0].status !== "DRAFT") throw new ServiceError("Only draft loans can be activated.");

    const loan = await tx.loan.findUnique({ where: { id }, include: { customer: true } });
    if (!loan) throw new ServiceError("Loan not found.");

    const schedule = buildSchedule({
      firstDueDate: loan.firstDueDate.toISOString().slice(0, 10),
      frequency: loan.frequency,
      installmentAmount: loan.installmentAmount.toString(),
      totalRepayment: loan.totalRepayment.toString(),
      installmentCount: loan.installmentCount,
    });
    if (!schedule.ok) throw new ServiceError(schedule.errors[0] ?? "The installment schedule is invalid.");

    await tx.installment.deleteMany({ where: { loanId: id } });
    await tx.installment.createMany({
      data: schedule.rows.map((row) => ({
        loanId: id,
        sequence: row.sequence,
        dueDate: isoToUtcMidnight(row.dueDate),
        scheduledAmount: row.scheduledAmount,
        paidAmount: "0.00",
        status: computeInstallmentStatus({
          dueDate: row.dueDate,
          scheduledAmount: row.scheduledAmount,
          paidAmount: "0",
          today,
        }),
      })),
    });

    const updated = await tx.loan.update({
      where: { id },
      data: { status: "ACTIVE", activatedAt: new Date(), closedAt: null, installmentCount: schedule.installmentCount },
    });

    await writeAudit(tx, {
      actorId: adminId,
      action: "LOAN_ACTIVATED",
      entityType: "Loan",
      entityId: id,
      summary: `Draft loan ${loan.reference} activated with ${schedule.installmentCount} installments`,
      ipAddress,
    });
    return updated;
  });
}

export async function cancelDraftLoan(id: string, adminId: string, ipAddress?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({ where: { id } });
    if (!loan) throw new ServiceError("Loan not found.");
    if (loan.status !== "DRAFT") throw new ServiceError("Only draft loans can be cancelled.");
    await tx.loan.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date() } });
    await writeAudit(tx, {
      actorId: adminId,
      action: "LOAN_CANCELLED",
      entityType: "Loan",
      entityId: id,
      summary: `Draft loan ${loan.reference} cancelled`,
      ipAddress,
    });
  });
}

export async function writeOffLoan(
  id: string,
  reason: string,
  adminId: string,
  ipAddress?: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({ where: { id } });
    if (!loan) throw new ServiceError("Loan not found.");
    if (loan.status !== "ACTIVE") throw new ServiceError("Only active loans can be written off.");
    await tx.loan.update({
      where: { id },
      data: { status: "WRITTEN_OFF", closedAt: new Date(), notes: `${loan.notes ? `${loan.notes}\n` : ""}Written off: ${reason}` },
    });
    await writeAudit(tx, {
      actorId: adminId,
      action: "LOAN_WRITTEN_OFF",
      entityType: "Loan",
      entityId: id,
      summary: `Loan ${loan.reference} written off: ${reason}`,
      metadata: { reason },
      ipAddress,
    });
  });
}

export interface LoanListParams {
  q?: string;
  status?: string;
  frequency?: string;
  page?: number;
  pageSize?: number;
}

export async function listLoans(params: LoanListParams) {
  await syncInstallmentStatuses();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const where: Prisma.LoanWhereInput = {};
  if (params.status && params.status !== "ALL") where.status = params.status as LoanStatus;
  if (params.frequency && params.frequency !== "ALL") where.frequency = params.frequency as LoanFrequency;
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { mobile: { contains: q } } },
      { customer: { code: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, loans, sums, paymentsSum, statusGroups] = await Promise.all([
    prisma.loan.count({ where }),
    prisma.loan.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, code: true } },
        installments: { orderBy: { dueDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.loan.aggregate({ where, _sum: { totalRepayment: true, netDisbursed: true } }),
    prisma.payment.aggregate({ where: { status: "POSTED", loan: where }, _sum: { amount: true } }),
    prisma.loan.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);

  const collected = await collectedByLoan(loans.map((l) => l.id));

  const items = loans.map((loan) => {
    const paid = collected.get(loan.id) ?? "0";
    const next = loan.installments.find((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
    return {
      id: loan.id,
      reference: loan.reference,
      customer: loan.customer,
      status: loan.status,
      frequency: loan.frequency,
      nominalAmount: money(loan.nominalAmount),
      netDisbursed: money(loan.netDisbursed),
      totalRepayment: money(loan.totalRepayment),
      installmentAmount: money(loan.installmentAmount),
      installmentCount: loan.installmentCount,
      startDate: loan.startDate.toISOString().slice(0, 10),
      createdAt: loan.createdAt,
      collected: paid,
      outstanding: outstandingFrom(loan.totalRepayment, paid),
      nextDueDate: next ? next.dueDate.toISOString().slice(0, 10) : null,
      nextDueAmount: next ? installmentOutstanding(next.scheduledAmount, next.paidAmount) : null,
    };
  });

  const totalRepayment = money(sums._sum.totalRepayment ?? 0);
  const totalDisbursed = money(sums._sum.netDisbursed ?? 0);
  const totalCollected = money(paymentsSum._sum.amount ?? 0);
  const statusCounts: Record<string, number> = {};
  for (const group of statusGroups) statusCounts[group.status] = group._count._all;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalRepayment,
      totalDisbursed,
      totalCollected,
      totalOutstanding: outstandingFrom(totalRepayment, totalCollected),
      statusCounts,
    },
  };
}

export async function getLoanDetail(id: string) {
  await syncInstallmentStatuses();
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { name: true } },
      installments: { orderBy: { sequence: "asc" } },
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          reversal: true,
          allocations: { select: { amount: true, installment: { select: { sequence: true } } } },
        },
      },
    },
  });
  if (!loan) return null;

  const posted = loan.payments.filter((p) => p.status === "POSTED");
  const collected = money(sumMoney(posted.map((p) => p.amount)));
  const outstanding = outstandingFrom(loan.totalRepayment, collected);
  const nextInstallment = loan.installments.find((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
  const groMargin = D(loan.totalRepayment).minus(D(loan.netDisbursed));
  const overdueInstallments = loan.installments.filter((i) => i.status === "OVERDUE");
  const overdueAmount = money(
    sumMoney(overdueInstallments.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount)))),
  );

  return {
    loan,
    customer: loan.customer,
    payments: loan.payments,
    installments: loan.installments,
    stats: {
      collected,
      outstanding,
      expectedGrossMargin: money(groMargin),
      overdueAmount,
      overdueCount: overdueInstallments.length,
      paidInstallments: loan.installments.filter((i) => i.status === "PAID").length,
      nextDueDate: nextInstallment ? nextInstallment.dueDate.toISOString().slice(0, 10) : null,
      nextDueAmount: nextInstallment ? installmentOutstanding(nextInstallment.scheduledAmount, nextInstallment.paidAmount) : null,
      nextDueSequence: nextInstallment?.sequence ?? null,
    },
  };
}

export function isoDateOf(value: Date): ISODate {
  return value.toISOString().slice(0, 10);
}
