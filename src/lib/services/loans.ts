import { prisma } from "@/lib/db";
import type { Loan, LoanCategory, LoanFrequency, LoanStatus, Prisma } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { computeInstallmentStatus, installmentOutstanding } from "@/lib/installments";
import { buildSchedule } from "@/lib/schedule";
import { buildMonthlyInterestSchedule, computeInterestPeriodStatus } from "@/lib/vatti-engine";
import { buildWeeklyInterestSchedule } from "@/lib/run-vati-engine";
import { formatLoanReference, temporaryReference } from "@/lib/references";
import { getIndiaTodayISO, isoToUtcMidnight, type ISODate } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";
import type { LoanInput } from "@/lib/validation";
import { paymentBreakdownByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

function parseProvidedCount(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function scheduleForLoanInput(input: LoanInput) {
  if (input.category === "MONTHLY_VATTI") {
    return buildMonthlyInterestSchedule({
      startDate: input.startDate,
      principal: input.nominalAmount,
      rate: input.interestRate || "0",
      method: input.interestType ?? "FLAT_SIMPLE",
      collectionDay: input.collectionDay ? Number(input.collectionDay) : null,
      maturityDate: input.maturityDate || null,
    });
  }
  if (input.category === "WEEKLY_RUN_VATI") {
    return buildWeeklyInterestSchedule({
      startDate: input.startDate,
      principal: input.nominalAmount,
      rate: input.interestRate || "0",
      method: input.interestType ?? "FLAT_SIMPLE",
      collectionDay: input.collectionDay ? Number(input.collectionDay) : null,
      maturityDate: input.maturityDate || null,
    });
  }

  return buildSchedule({
    firstDueDate: input.firstDueDate || input.startDate,
    frequency: input.frequency ?? "WEEKLY",
    installmentAmount: input.installmentAmount || "0",
    totalRepayment: input.totalRepayment || "0",
    installmentCount: parseProvidedCount(input.installmentCount),
  });
}

export async function createLoan(input: LoanInput, adminId: string, ipAddress?: string | null): Promise<Loan> {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ServiceError("Customer not found.");
  if (customer.archivedAt) throw new ServiceError("Cannot create a loan for an archived customer.");

  const nominal = D(input.nominalAmount);
  const deduction = D(input.deductionAmount || "0");
  const net = nominal.minus(deduction);
  const today = getIndiaTodayISO();
  const year = Number(input.startDate.slice(0, 4));
  const category: LoanCategory = input.category ?? "THAVANAI";

  // Backend duplicate protection: check if a matching loan was submitted within the last 15 seconds
  const recentDuplicate = await prisma.loan.findFirst({
    where: {
      customerId: input.customerId,
      category,
      nominalAmount: money(nominal),
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
  });
  if (recentDuplicate) {
    return recentDuplicate;
  }

  return prisma.$transaction(async (tx) => {
    let installmentCount = 0;
    let thavanaiSchedule: ReturnType<typeof buildSchedule> | null = null;
    let vattiSchedule: ReturnType<typeof buildMonthlyInterestSchedule> | null = null;
    let runVatiSchedule: ReturnType<typeof buildWeeklyInterestSchedule> | null = null;

    if (category === "THAVANAI") {
      thavanaiSchedule = buildSchedule({
        firstDueDate: input.firstDueDate || input.startDate,
        frequency: input.frequency ?? "WEEKLY",
        installmentAmount: input.installmentAmount || "0",
        totalRepayment: input.totalRepayment || "0",
        installmentCount: parseProvidedCount(input.installmentCount),
      });
      if (!thavanaiSchedule.ok) throw new ServiceError(thavanaiSchedule.errors[0] ?? "The installment schedule is invalid.");
      installmentCount = thavanaiSchedule.installmentCount;
    } else if (category === "MONTHLY_VATTI") {
      vattiSchedule = buildMonthlyInterestSchedule({
        startDate: input.startDate,
        principal: input.nominalAmount,
        rate: input.interestRate || "0",
        method: input.interestType ?? "FLAT_SIMPLE",
        collectionDay: input.collectionDay ? Number(input.collectionDay) : null,
        maturityDate: input.maturityDate || null,
      });
      if (!vattiSchedule.ok) throw new ServiceError(vattiSchedule.errors[0] ?? "The interest schedule is invalid.");
      installmentCount = vattiSchedule.rows.length;
    } else if (category === "WEEKLY_RUN_VATI") {
      runVatiSchedule = buildWeeklyInterestSchedule({
        startDate: input.startDate,
        principal: input.nominalAmount,
        rate: input.interestRate || "0",
        method: input.interestType ?? "FLAT_SIMPLE",
        collectionDay: input.collectionDay ? Number(input.collectionDay) : null,
        maturityDate: input.maturityDate || null,
      });
      if (!runVatiSchedule.ok) throw new ServiceError(runVatiSchedule.errors[0] ?? "The interest schedule is invalid.");
      installmentCount = runVatiSchedule.rows.length;
    }

    const created = await tx.loan.create({
      data: {
        reference: temporaryReference("LN"),
        customerId: input.customerId,
        category,
        nominalAmount: money(nominal),
        deductionAmount: money(deduction),
        netDisbursed: money(net),
        totalRepayment: category === "THAVANAI" ? money(input.totalRepayment || "0") : money(nominal),
        installmentAmount: category === "THAVANAI" ? money(input.installmentAmount || "0") : "0.00",
        installmentCount,
        frequency: category === "THAVANAI" ? input.frequency : category === "WEEKLY_RUN_VATI" ? "WEEKLY" : "MONTHLY",
        startDate: isoToUtcMidnight(input.startDate),
        firstDueDate: input.firstDueDate ? isoToUtcMidnight(input.firstDueDate) : null,
        disbursementDate: isoToUtcMidnight(input.disbursementDate || input.startDate),
        interestRate: input.interestRate ? D(input.interestRate).toFixed(3) : null,
        interestType: input.interestType ?? "FLAT_SIMPLE",
        collectionDay: input.collectionDay ? Number(input.collectionDay) : null,
        maturityDate: input.maturityDate ? isoToUtcMidnight(input.maturityDate) : null,
        principalRepaymentArrangement: input.principalRepaymentArrangement?.trim() || null,
        unpaidInterestHandling: input.unpaidInterestHandling?.trim() || "PENDING_ACCUMULATION",
        status: input.activate ? "ACTIVE" : "DRAFT",
        notes: input.notes?.trim() || null,
        terms: input.terms?.trim() || null,
        createdById: adminId,
        activatedAt: input.activate ? new Date() : null,
      },
    });

    const updated = await tx.loan.update({
      where: { id: created.id },
      data: { reference: formatLoanReference(created.seq, year, category) },
    });

    if (input.activate) {
      if (category === "THAVANAI" && thavanaiSchedule) {
        await tx.installment.createMany({
          data: thavanaiSchedule.rows.map((row) => ({
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
      } else if (category === "MONTHLY_VATTI" && vattiSchedule) {
        await tx.interestPeriod.createMany({
          data: vattiSchedule.rows.map((row) => ({
            loanId: created.id,
            sequence: row.sequence,
            fromDate: isoToUtcMidnight(row.fromDate),
            dueDate: isoToUtcMidnight(row.dueDate),
            principalBase: row.principalBase,
            interestRate: row.interestRate,
            scheduledAmount: row.scheduledAmount,
            paidAmount: "0.00",
            status: computeInterestPeriodStatus({
              dueDate: row.dueDate,
              scheduledAmount: row.scheduledAmount,
              paidAmount: "0",
              today,
            }),
          })),
        });
      } else if (category === "WEEKLY_RUN_VATI" && runVatiSchedule) {
        await tx.interestPeriod.createMany({
          data: runVatiSchedule.rows.map((row) => ({
            loanId: created.id,
            sequence: row.sequence,
            fromDate: isoToUtcMidnight(row.fromDate),
            dueDate: isoToUtcMidnight(row.dueDate),
            principalBase: row.principalBase,
            interestRate: row.interestRate,
            scheduledAmount: row.scheduledAmount,
            paidAmount: "0.00",
            status: computeInterestPeriodStatus({
              dueDate: row.dueDate,
              scheduledAmount: row.scheduledAmount,
              paidAmount: "0",
              today,
            }),
          })),
        });
      }
    }

    await writeAudit(tx, {
      actorId: adminId,
      action: input.activate ? "LOAN_CREATED_ACTIVE" : "LOAN_CREATED_DRAFT",
      entityType: "Loan",
      entityId: created.id,
      summary: `Loan ${updated.reference} (${category}) for ${customer.fullName}: ₹${money(net)} disbursed`,
      metadata: {
        category,
        nominalAmount: money(nominal),
        deductionAmount: money(deduction),
        netDisbursed: money(net),
        interestRate: input.interestRate,
        interestType: input.interestType,
      },
      ipAddress,
    });

    return updated;
  });
}

export async function activateLoan(id: string, adminId: string, ipAddress?: string | null): Promise<Loan> {
  const today = getIndiaTodayISO();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; status: string; category: string }[]>`
      SELECT "id", "status"::text AS "status", "category"::text AS "category" FROM "Loan" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked[0]) throw new ServiceError("Loan not found.");
    if (locked[0].status !== "DRAFT") throw new ServiceError("Only draft loans can be activated.");

    const loan = await tx.loan.findUnique({ where: { id }, include: { customer: true } });
    if (!loan) throw new ServiceError("Loan not found.");

    if (loan.category === "THAVANAI") {
      const schedule = buildSchedule({
        firstDueDate: loan.firstDueDate ? loan.firstDueDate.toISOString().slice(0, 10) : loan.startDate.toISOString().slice(0, 10),
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
        summary: `Draft Thavanai loan ${loan.reference} activated with ${schedule.installmentCount} installments`,
        ipAddress,
      });
      return updated;
    } else if (loan.category === "MONTHLY_VATTI") {
      const schedule = buildMonthlyInterestSchedule({
        startDate: loan.startDate.toISOString().slice(0, 10),
        principal: loan.nominalAmount.toString(),
        rate: loan.interestRate?.toString() || "0",
        method: loan.interestType ?? "FLAT_SIMPLE",
        collectionDay: loan.collectionDay,
        maturityDate: loan.maturityDate ? loan.maturityDate.toISOString().slice(0, 10) : null,
      });
      if (!schedule.ok) throw new ServiceError(schedule.errors[0] ?? "The interest schedule is invalid.");

      await tx.interestPeriod.deleteMany({ where: { loanId: id } });
      await tx.interestPeriod.createMany({
        data: schedule.rows.map((row) => ({
          loanId: id,
          sequence: row.sequence,
          fromDate: isoToUtcMidnight(row.fromDate),
          dueDate: isoToUtcMidnight(row.dueDate),
          principalBase: row.principalBase,
          interestRate: row.interestRate,
          scheduledAmount: row.scheduledAmount,
          paidAmount: "0.00",
          status: computeInterestPeriodStatus({
            dueDate: row.dueDate,
            scheduledAmount: row.scheduledAmount,
            paidAmount: "0",
            today,
          }),
        })),
      });

      const updated = await tx.loan.update({
        where: { id },
        data: { status: "ACTIVE", activatedAt: new Date(), closedAt: null, installmentCount: schedule.rows.length },
      });

      await writeAudit(tx, {
        actorId: adminId,
        action: "LOAN_ACTIVATED",
        entityType: "Loan",
        entityId: id,
        summary: `Draft Vatti loan ${loan.reference} activated`,
        ipAddress,
      });
      return updated;
    } else {
      // WEEKLY_RUN_VATI
      const schedule = buildWeeklyInterestSchedule({
        startDate: loan.startDate.toISOString().slice(0, 10),
        principal: loan.nominalAmount.toString(),
        rate: loan.interestRate?.toString() || "0",
        method: loan.interestType ?? "FLAT_SIMPLE",
        collectionDay: loan.collectionDay,
        maturityDate: loan.maturityDate ? loan.maturityDate.toISOString().slice(0, 10) : null,
      });
      if (!schedule.ok) throw new ServiceError(schedule.errors[0] ?? "The interest schedule is invalid.");

      await tx.interestPeriod.deleteMany({ where: { loanId: id } });
      await tx.interestPeriod.createMany({
        data: schedule.rows.map((row) => ({
          loanId: id,
          sequence: row.sequence,
          fromDate: isoToUtcMidnight(row.fromDate),
          dueDate: isoToUtcMidnight(row.dueDate),
          principalBase: row.principalBase,
          interestRate: row.interestRate,
          scheduledAmount: row.scheduledAmount,
          paidAmount: "0.00",
          status: computeInterestPeriodStatus({
            dueDate: row.dueDate,
            scheduledAmount: row.scheduledAmount,
            paidAmount: "0",
            today,
          }),
        })),
      });

      const updated = await tx.loan.update({
        where: { id },
        data: { status: "ACTIVE", activatedAt: new Date(), closedAt: null, installmentCount: schedule.rows.length },
      });

      await writeAudit(tx, {
        actorId: adminId,
        action: "LOAN_ACTIVATED",
        entityType: "Loan",
        entityId: id,
        summary: `Draft Run Vati loan ${loan.reference} activated`,
        ipAddress,
      });
      return updated;
    }
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
  category?: string;
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
  if (params.category && params.category !== "ALL") where.category = params.category as LoanCategory;
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
        interestPeriods: { orderBy: { dueDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.loan.aggregate({ where, _sum: { totalRepayment: true, netDisbursed: true, nominalAmount: true } }),
    prisma.payment.aggregate({ where: { status: "POSTED", loan: where }, _sum: { amount: true } }),
    prisma.loan.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);

  const breakdowns = await paymentBreakdownByLoan(loans.map((l) => l.id));

  const items = loans.map((loan) => {
    const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
    const paid = b.totalAmount;
    let outstanding = "0.00";
    let nextDueDate: string | null = null;
    let nextDueAmount: string | null = null;

    if (loan.category === "THAVANAI") {
      outstanding = outstandingFrom(loan.totalRepayment, paid);
      const next = loan.installments.find((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
      nextDueDate = next ? next.dueDate.toISOString().slice(0, 10) : null;
      nextDueAmount = next ? installmentOutstanding(next.scheduledAmount, next.paidAmount) : null;
    } else {
      // Vatti or Run Vati
      const principalRemaining = D(loan.nominalAmount).minus(D(b.principalAmount));
      const accrued = sumMoney(loan.interestPeriods.map((p) => p.scheduledAmount));
      const pendingInterest = accrued.minus(D(b.interestAmount));
      const safePendingInterest = pendingInterest.lt(0) ? D(0) : pendingInterest;
      outstanding = money(principalRemaining.plus(safePendingInterest));

      const nextPeriod = loan.interestPeriods.find((p) => D(p.paidAmount).lt(D(p.scheduledAmount)));
      nextDueDate = nextPeriod ? nextPeriod.dueDate.toISOString().slice(0, 10) : null;
      nextDueAmount = nextPeriod ? money(D(nextPeriod.scheduledAmount).minus(D(nextPeriod.paidAmount))) : null;
    }

    return {
      id: loan.id,
      reference: loan.reference,
      category: loan.category,
      customer: loan.customer,
      status: loan.status,
      frequency: loan.frequency,
      nominalAmount: money(loan.nominalAmount),
      deductionAmount: money(loan.deductionAmount),
      netDisbursed: money(loan.netDisbursed),
      totalRepayment: money(loan.totalRepayment),
      installmentAmount: money(loan.installmentAmount),
      installmentCount: loan.installmentCount,
      interestRate: loan.interestRate ? loan.interestRate.toString() : null,
      interestType: loan.interestType,
      collectionDay: loan.collectionDay,
      startDate: loan.startDate.toISOString().slice(0, 10),
      firstDueDate: loan.firstDueDate ? loan.firstDueDate.toISOString().slice(0, 10) : null,
      createdAt: loan.createdAt,
      collected: paid,
      outstanding,
      nextDueDate,
      nextDueAmount,
    };
  });

  const totalRepayment = money(sums._sum.totalRepayment ?? 0);
  const totalDisbursed = money(sums._sum.netDisbursed ?? 0);
  const totalNominal = money(sums._sum.nominalAmount ?? 0);
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
      totalNominal,
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
      interestPeriods: { orderBy: { sequence: "asc" } },
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          reversal: true,
          allocations: { select: { amount: true, installment: { select: { sequence: true } } } },
          interestAllocations: { select: { amount: true, interestPeriod: { select: { sequence: true } } } },
        },
      },
    },
  });
  if (!loan) return null;

  const today = getIndiaTodayISO();
  const posted = loan.payments.filter((p) => p.status === "POSTED");
  const collected = money(sumMoney(posted.map((p) => p.amount)));
  const principalPaid = money(sumMoney(posted.map((p) => p.principalAmount)));
  const interestPaid = money(sumMoney(posted.map((p) => p.interestAmount)));

  if (loan.category === "THAVANAI") {
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
      interestPeriods: [],
      stats: {
        originalPrincipal: money(loan.nominalAmount),
        deductionAmount: money(loan.deductionAmount),
        netDisbursed: money(loan.netDisbursed),
        collected,
        outstanding,
        principalPaid: collected,
        interestPaid: "0.00",
        outstandingPrincipal: outstanding,
        interestAccrued: "0.00",
        interestPending: "0.00",
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

  // MONTHLY_VATTI or WEEKLY_RUN_VATI
  // 1. Original Principal: loan.nominalAmount
  const originalPrincipal = money(loan.nominalAmount);
  // 2. Upfront Deduction: loan.deductionAmount
  const deductionAmount = money(loan.deductionAmount);
  // 3. Actual Cash Disbursed: loan.netDisbursed = nominal - deduction
  const netDisbursed = money(loan.netDisbursed);
  // 4. Monthly / Weekly Interest Rate:
  const interestRate = loan.interestRate ? loan.interestRate.toString() : "0";
  // 7. Total Principal Repaid: principalPaid
  // 8. Remaining Principal = Original Principal - Total Principal Repaid
  const outstandingPrincipal = money(D(loan.nominalAmount).minus(D(principalPaid)).clamp(0, Infinity));
  
  // Accrued interest up to today
  const accruedPeriods = loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today);
  const interestAccrued = money(sumMoney(accruedPeriods.map((p) => p.scheduledAmount)));
  // 6. Pending Interest: Accrued interest minus interest collected
  const interestPending = money(D(interestAccrued).minus(D(interestPaid)).clamp(0, Infinity));
  // Total Outstanding exposure = remaining principal + pending interest
  const totalOutstanding = money(D(outstandingPrincipal).plus(D(interestPending)));

  const overduePeriods = loan.interestPeriods.filter((p) => p.status === "OVERDUE");
  const overdueAmount = money(sumMoney(overduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount)))));

  const nextPeriod = loan.interestPeriods.find((p) => D(p.paidAmount).lt(D(p.scheduledAmount)));

  return {
    loan,
    customer: loan.customer,
    payments: loan.payments,
    installments: [],
    interestPeriods: loan.interestPeriods,
    stats: {
      originalPrincipal,
      deductionAmount,
      netDisbursed,
      interestRate,
      collected,
      outstanding: totalOutstanding,
      principalPaid,
      interestPaid,
      outstandingPrincipal,
      interestAccrued,
      interestPending,
      expectedGrossMargin: interestAccrued,
      overdueAmount,
      overdueCount: overduePeriods.length,
      paidInstallments: loan.interestPeriods.filter((p) => p.status === "PAID").length,
      nextDueDate: nextPeriod ? nextPeriod.dueDate.toISOString().slice(0, 10) : null,
      nextDueAmount: nextPeriod ? money(D(nextPeriod.scheduledAmount).minus(D(nextPeriod.paidAmount))) : null,
      nextDueSequence: nextPeriod?.sequence ?? null,
    },
  };
}

export function isoDateOf(value: Date): ISODate {
  return value.toISOString().slice(0, 10);
}
