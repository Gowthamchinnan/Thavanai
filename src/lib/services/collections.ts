import { prisma } from "@/lib/db";
import type { InstallmentStatus, LoanFrequency } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { getIndiaTodayISO, isoToUtcMidnight, isValidISODate, daysBetweenISO } from "@/lib/dates";
import { collectedByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export type CollectionScope = "today" | "overdue" | "upcoming" | "all";

export interface CollectionListParams {
  scope: CollectionScope;
  q?: string;
  frequency?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listCollections(params: CollectionListParams) {
  const today = getIndiaTodayISO();
  await syncInstallmentStatuses(today);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const todayDate = isoToUtcMidnight(today);

  const loanFilter: Prisma.LoanWhereInput = {};
  if (params.scope !== "all") loanFilter.status = "ACTIVE";
  if (params.frequency && params.frequency !== "ALL") {
    loanFilter.frequency = params.frequency as LoanFrequency;
  }

  const where: Prisma.InstallmentWhereInput = {};
  if (Object.keys(loanFilter).length) where.loan = loanFilter;

  const dueDateFilter: Prisma.DateTimeFilter = {};
  if (params.scope === "today") where.status = "DUE_TODAY";
  else if (params.scope === "overdue") where.status = "OVERDUE";
  else if (params.scope === "upcoming") {
    where.status = { in: ["UPCOMING", "PARTIALLY_PAID"] };
    dueDateFilter.gt = todayDate;
  } else if (params.status && params.status !== "ALL") {
    where.status = params.status as InstallmentStatus;
  }

  if (params.from && isValidISODate(params.from)) {
    dueDateFilter.gte = isoToUtcMidnight(params.from);
  }
  if (params.to && isValidISODate(params.to)) {
    dueDateFilter.lte = isoToUtcMidnight(params.to);
  }
  if (Object.keys(dueDateFilter).length) where.dueDate = dueDateFilter;

  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { loan: { reference: { contains: q, mode: "insensitive" } } },
      { loan: { customer: { fullName: { contains: q, mode: "insensitive" } } } },
      { loan: { customer: { mobile: { contains: q } } } },
      { loan: { customer: { code: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [total, installments, aggregate] = await Promise.all([
    prisma.installment.count({ where }),
    prisma.installment.findMany({
      where,
      include: {
        loan: {
          include: { customer: { select: { id: true, fullName: true, mobile: true, code: true } } },
        },
      },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.installment.aggregate({ where, _sum: { scheduledAmount: true, paidAmount: true } }),
  ]);

  const loanIds = Array.from(new Set(installments.map((i) => i.loanId)));
  const collected = await collectedByLoan(loanIds);

  const items = installments.map((installment) => {
    const dueDate = installment.dueDate.toISOString().slice(0, 10);
    const collectedForLoan = collected.get(installment.loanId) ?? "0";
    return {
      id: installment.id,
      sequence: installment.sequence,
      dueDate,
      scheduledAmount: money(installment.scheduledAmount),
      paidAmount: money(installment.paidAmount),
      outstandingAmount: money(D(installment.scheduledAmount).minus(D(installment.paidAmount))),
      status: installment.status,
      overdueDays: installment.status === "OVERDUE" ? daysBetweenISO(dueDate, today) : 0,
      loan: {
        id: installment.loan.id,
        reference: installment.loan.reference,
        status: installment.loan.status,
        frequency: installment.loan.frequency,
        totalRepayment: money(installment.loan.totalRepayment),
        installmentCount: installment.loan.installmentCount,
      },
      customer: installment.loan.customer,
      loanBalance: outstandingFrom(installment.loan.totalRepayment, collectedForLoan),
    };
  });

  const scheduled = money(aggregate._sum.scheduledAmount ?? 0);
  const paid = money(aggregate._sum.paidAmount ?? 0);
  const outstandingTotal = D(scheduled).minus(D(paid));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    today,
    summary: {
      outstanding: outstandingTotal.lt(0) ? "0.00" : money(outstandingTotal),
      scheduledTotal: scheduled,
      count: total,
    },
  };
}

export function collectionTotals(rows: { outstandingAmount: string }[]): string {
  return money(sumMoney(rows.map((r) => r.outstandingAmount)));
}
