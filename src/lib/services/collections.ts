import { prisma } from "@/lib/db";
import type { InstallmentStatus, LoanCategory, LoanFrequency } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { getIndiaTodayISO, isoToUtcMidnight, isValidISODate, daysBetweenISO } from "@/lib/dates";
import { paymentBreakdownByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export type CollectionScope = "today" | "overdue" | "upcoming" | "all";

export interface CollectionListParams {
  scope: CollectionScope;
  category?: string;
  q?: string;
  frequency?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CollectionItem {
  id: string;
  sequence: number;
  category: LoanCategory;
  dueDate: string;
  scheduledAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: InstallmentStatus;
  overdueDays: number;
  loan: {
    id: string;
    reference: string;
    status: string;
    frequency: LoanFrequency;
    category: LoanCategory;
    totalRepayment: string;
    installmentCount: number;
  };
  customer: {
    id: string;
    fullName: string;
    mobile: string;
    code: string;
  };
  loanBalance: string;
}

export async function listCollections(params: CollectionListParams) {
  const today = getIndiaTodayISO();
  await syncInstallmentStatuses(today);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const todayDate = isoToUtcMidnight(today);

  const loanFilter: Prisma.LoanWhereInput = {};
  if (params.scope !== "all") loanFilter.status = "ACTIVE";
  if (params.category && params.category !== "ALL") {
    loanFilter.category = params.category as LoanCategory;
  }
  if (params.frequency && params.frequency !== "ALL") {
    loanFilter.frequency = params.frequency as LoanFrequency;
  }

  const dueDateFilter: Prisma.DateTimeFilter = {};
  let statusFilter: InstallmentStatus | Prisma.EnumInstallmentStatusFilter | undefined = undefined;

  if (params.scope === "today") statusFilter = "DUE_TODAY";
  else if (params.scope === "overdue") statusFilter = "OVERDUE";
  else if (params.scope === "upcoming") {
    statusFilter = { in: ["UPCOMING", "PARTIALLY_PAID"] };
    dueDateFilter.gt = todayDate;
  } else if (params.status && params.status !== "ALL") {
    statusFilter = params.status as InstallmentStatus;
  }

  if (params.from && isValidISODate(params.from)) {
    dueDateFilter.gte = isoToUtcMidnight(params.from);
  }
  if (params.to && isValidISODate(params.to)) {
    dueDateFilter.lte = isoToUtcMidnight(params.to);
  }

  const installmentWhere: Prisma.InstallmentWhereInput = {};
  const interestPeriodWhere: Prisma.InterestPeriodWhereInput = {};

  if (Object.keys(loanFilter).length) {
    installmentWhere.loan = loanFilter;
    interestPeriodWhere.loan = loanFilter;
  }
  if (statusFilter) {
    installmentWhere.status = statusFilter;
    interestPeriodWhere.status = statusFilter;
  }
  if (Object.keys(dueDateFilter).length) {
    installmentWhere.dueDate = dueDateFilter;
    interestPeriodWhere.dueDate = dueDateFilter;
  }

  if (params.q?.trim()) {
    const q = params.q.trim();
    const orFilter = [
      { reference: { contains: q, mode: "insensitive" as const } },
      { customer: { fullName: { contains: q, mode: "insensitive" as const } } },
      { customer: { mobile: { contains: q } } },
      { customer: { code: { contains: q, mode: "insensitive" as const } } },
    ];
    installmentWhere.loan = { ...loanFilter, OR: orFilter };
    interestPeriodWhere.loan = { ...loanFilter, OR: orFilter };
  }

  const queryInstallments = !params.category || params.category === "ALL" || params.category === "THAVANAI";
  const queryInterestPeriods =
    !params.category || params.category === "ALL" || params.category === "MONTHLY_VATTI" || params.category === "WEEKLY_RUN_VATI";

  const [
    installmentCount,
    interestPeriodCount,
    installmentRows,
    interestPeriodRows,
    installmentAgg,
    interestPeriodAgg,
  ] = await Promise.all([
    queryInstallments ? prisma.installment.count({ where: installmentWhere }) : 0,
    queryInterestPeriods ? prisma.interestPeriod.count({ where: interestPeriodWhere }) : 0,
    queryInstallments
      ? prisma.installment.findMany({
          where: installmentWhere,
          include: {
            loan: {
              include: { customer: { select: { id: true, fullName: true, mobile: true, code: true } } },
            },
          },
          orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
          take: 200,
        })
      : [],
    queryInterestPeriods
      ? prisma.interestPeriod.findMany({
          where: interestPeriodWhere,
          include: {
            loan: {
              include: { customer: { select: { id: true, fullName: true, mobile: true, code: true } } },
            },
          },
          orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
          take: 200,
        })
      : [],
    queryInstallments ? prisma.installment.aggregate({ where: installmentWhere, _sum: { scheduledAmount: true, paidAmount: true } }) : null,
    queryInterestPeriods ? prisma.interestPeriod.aggregate({ where: interestPeriodWhere, _sum: { scheduledAmount: true, paidAmount: true } }) : null,
  ]);

  const allLoanIds = Array.from(
    new Set([...installmentRows.map((i) => i.loanId), ...interestPeriodRows.map((i) => i.loanId)]),
  );
  const breakdowns = await paymentBreakdownByLoan(allLoanIds);

  const mappedInstallments: CollectionItem[] = installmentRows.map((inst) => {
    const dueDate = inst.dueDate.toISOString().slice(0, 10);
    const b = breakdowns.get(inst.loanId) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
    return {
      id: inst.id,
      sequence: inst.sequence,
      category: inst.loan.category,
      dueDate,
      scheduledAmount: money(inst.scheduledAmount),
      paidAmount: money(inst.paidAmount),
      outstandingAmount: money(D(inst.scheduledAmount).minus(D(inst.paidAmount))),
      status: inst.status,
      overdueDays: inst.status === "OVERDUE" ? daysBetweenISO(dueDate, today) : 0,
      loan: {
        id: inst.loan.id,
        reference: inst.loan.reference,
        status: inst.loan.status,
        frequency: inst.loan.frequency,
        category: inst.loan.category,
        totalRepayment: money(inst.loan.totalRepayment),
        installmentCount: inst.loan.installmentCount,
      },
      customer: inst.loan.customer,
      loanBalance: outstandingFrom(inst.loan.totalRepayment, b.totalAmount),
    };
  });

  const mappedInterestPeriods: CollectionItem[] = interestPeriodRows.map((p) => {
    const dueDate = p.dueDate.toISOString().slice(0, 10);
    const b = breakdowns.get(p.loanId) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
    const principalRem = D(p.loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
    return {
      id: p.id,
      sequence: p.sequence,
      category: p.loan.category,
      dueDate,
      scheduledAmount: money(p.scheduledAmount),
      paidAmount: money(p.paidAmount),
      outstandingAmount: money(D(p.scheduledAmount).minus(D(p.paidAmount))),
      status: p.status,
      overdueDays: p.status === "OVERDUE" ? daysBetweenISO(dueDate, today) : 0,
      loan: {
        id: p.loan.id,
        reference: p.loan.reference,
        status: p.loan.status,
        frequency: p.loan.frequency,
        category: p.loan.category,
        totalRepayment: money(p.loan.nominalAmount),
        installmentCount: p.loan.installmentCount,
      },
      customer: p.loan.customer,
      loanBalance: money(principalRem),
    };
  });

  // Combine and sort by dueDate
  const combined = [...mappedInstallments, ...mappedInterestPeriods].sort((a, b) => {
    const d = a.dueDate.localeCompare(b.dueDate);
    if (d !== 0) return d;
    return a.sequence - b.sequence;
  });

  const total = installmentCount + interestPeriodCount;
  const items = combined.slice((page - 1) * pageSize, page * pageSize);

  const instScheduled = D(installmentAgg?._sum.scheduledAmount ?? 0);
  const instPaid = D(installmentAgg?._sum.paidAmount ?? 0);
  const periodScheduled = D(interestPeriodAgg?._sum.scheduledAmount ?? 0);
  const periodPaid = D(interestPeriodAgg?._sum.paidAmount ?? 0);

  const totalScheduled = instScheduled.plus(periodScheduled);
  const totalPaid = instPaid.plus(periodPaid);
  const outstandingTotal = totalScheduled.minus(totalPaid).clamp(0, Infinity);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    today,
    summary: {
      outstanding: money(outstandingTotal),
      scheduledTotal: money(totalScheduled),
      count: total,
    },
  };
}

export function collectionTotals(rows: { outstandingAmount: string }[]): string {
  return money(sumMoney(rows.map((r) => r.outstandingAmount)));
}
