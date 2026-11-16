import { prisma } from "@/lib/db";
import { D, money, toNumberForChart } from "@/lib/money";
import {
  addDaysISO,
  getIndiaMonthRange,
  getIndiaTodayISO,
  getIndiaWeekRange,
  indiaDayRangeUTC,
  isoToUtcMidnight,
  lastNDaysIndia,
} from "@/lib/dates";
import { collectedByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export async function getDashboardData() {
  await syncInstallmentStatuses();
  const today = getIndiaTodayISO();
  const trendDays = lastNDaysIndia(14);
  const trendStart = indiaDayRangeUTC(trendDays[0]).start;
  const todayRange = indiaDayRangeUTC(today);
  const weekRange = getIndiaWeekRange();
  const monthRange = getIndiaMonthRange();
  const upcomingEnd = isoToUtcMidnight(addDaysISO(today, 7));

  const [
    activeLoanCount,
    activeCustomerGroups,
    activeSums,
    activeCollectedSum,
    lifetimeCollectedSum,
    todayCollected,
    weekCollected,
    monthCollected,
    dueTodayAgg,
    overdueAgg,
    statusGroups,
    recentPayments,
    trendPayments,
    upcomingAgg,
    dueTodayRows,
    upcomingRows,
  ] = await Promise.all([
    prisma.loan.count({ where: { status: "ACTIVE" } }),
    prisma.loan.groupBy({ by: ["customerId"], where: { status: "ACTIVE" } }),
    prisma.loan.aggregate({
      where: { status: "ACTIVE" },
      _sum: { totalRepayment: true, netDisbursed: true, nominalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "POSTED", loan: { status: "ACTIVE" } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({ where: { status: "POSTED" }, _sum: { amount: true } }),
    prisma.payment.aggregate({
      where: { status: "POSTED", paidAt: { gte: todayRange.start, lt: todayRange.end } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "POSTED", paidAt: { gte: weekRange.start, lt: weekRange.end } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "POSTED", paidAt: { gte: monthRange.start, lt: monthRange.end } },
      _sum: { amount: true },
    }),
    prisma.installment.aggregate({
      where: { status: "DUE_TODAY", loan: { status: "ACTIVE" } },
      _sum: { scheduledAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
    prisma.installment.aggregate({
      where: { status: "OVERDUE", loan: { status: "ACTIVE" } },
      _sum: { scheduledAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
    prisma.loan.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.findMany({
      where: { status: "POSTED" },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true } },
        loan: { select: { id: true, reference: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "POSTED", paidAt: { gte: trendStart } },
      select: { amount: true, paidAt: true },
    }),
    prisma.installment.aggregate({
      where: {
        loan: { status: "ACTIVE" },
        dueDate: { gt: isoToUtcMidnight(today), lte: upcomingEnd },
        status: { in: ["UPCOMING", "PARTIALLY_PAID", "DUE_TODAY"] },
      },
      _sum: { scheduledAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
    prisma.installment.findMany({
      where: { status: "DUE_TODAY", loan: { status: "ACTIVE" } },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
      take: 6,
      include: {
        loan: {
          include: { customer: { select: { id: true, fullName: true, mobile: true } } },
        },
      },
    }),
    prisma.installment.findMany({
      where: {
        loan: { status: "ACTIVE" },
        dueDate: { gt: isoToUtcMidnight(today), lte: upcomingEnd },
        status: { in: ["UPCOMING", "PARTIALLY_PAID", "DUE_TODAY"] },
      },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
      take: 6,
      include: {
        loan: {
          include: { customer: { select: { id: true, fullName: true, mobile: true } } },
        },
      },
    }),
  ]);

  const activeRepayment = money(activeSums._sum.totalRepayment ?? 0);
  const activeDisbursed = money(activeSums._sum.netDisbursed ?? 0);
  const activeNominal = money(activeSums._sum.nominalAmount ?? 0);
  const activeCollected = money(activeCollectedSum._sum.amount ?? 0);
  const lifetimeCollected = money(lifetimeCollectedSum._sum.amount ?? 0);
  const expectedGrossMargin = money(D(activeRepayment).minus(D(activeDisbursed)));

  const upcomingLoanIds = Array.from(new Set([...dueTodayRows, ...upcomingRows].map((row) => row.loanId)));
  const upcomingCollected = await collectedByLoan(upcomingLoanIds);

  const dueTodayOutstanding = money(
    D(dueTodayAgg._sum.scheduledAmount ?? 0).minus(D(dueTodayAgg._sum.paidAmount ?? 0)),
  );
  const overdueOutstanding = money(
    D(overdueAgg._sum.scheduledAmount ?? 0).minus(D(overdueAgg._sum.paidAmount ?? 0)),
  );
  const upcomingOutstanding = money(
    D(upcomingAgg._sum.scheduledAmount ?? 0).minus(D(upcomingAgg._sum.paidAmount ?? 0)),
  );

  const trendMap = new Map<string, number>();
  for (const day of trendDays) trendMap.set(day, 0);
  for (const payment of trendPayments) {
    const key = getIndiaTodayISO(payment.paidAt);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + Number(payment.amount.toString()));
  }

  const statusCounts: Record<string, number> = {};
  for (const group of statusGroups) statusCounts[group.status] = group._count._all;

  const activeFrequencyGroups = await prisma.loan.groupBy({
    by: ["frequency"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
    _sum: { totalRepayment: true },
  });

  return {
    today,
    stats: {
      activeCustomers: activeCustomerGroups.length,
      activeLoans: activeLoanCount,
      activeNominalAmount: activeNominal,
      activeContractualRepayment: activeRepayment,
      activeNetDisbursed: activeDisbursed,
      activeCollected,
      lifetimeCollected,
      activeOutstanding: outstandingFrom(activeRepayment, activeCollected),
      expectedGrossMargin,
      dueTodayCount: dueTodayAgg._count._all,
      dueTodayOutstanding: D(dueTodayOutstanding).lt(0) ? "0.00" : dueTodayOutstanding,
      overdueCount: overdueAgg._count._all,
      overdueOutstanding: D(overdueOutstanding).lt(0) ? "0.00" : overdueOutstanding,
      upcomingCount: upcomingAgg._count._all,
      upcomingOutstanding: D(upcomingOutstanding).lt(0) ? "0.00" : upcomingOutstanding,
      collectedToday: money(todayCollected._sum.amount ?? 0),
      collectedWeek: money(weekCollected._sum.amount ?? 0),
      collectedMonth: money(monthCollected._sum.amount ?? 0),
    },
    trend: trendDays.map((day) => ({
      date: day,
      amount: Number((trendMap.get(day) ?? 0).toFixed(2)),
    })),
    statusCounts,
    frequencyBreakdown: activeFrequencyGroups.map((group) => ({
      frequency: group.frequency,
      count: group._count._all,
      totalRepayment: money(group._sum.totalRepayment ?? 0),
    })),
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: money(payment.amount),
      paidAt: payment.paidAt.toISOString(),
      mode: payment.mode,
      customer: payment.customer,
      loan: payment.loan,
    })),
    dueToday: dueTodayRows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      outstanding: money(D(row.scheduledAmount).minus(D(row.paidAmount))),
      status: row.status,
      loan: { id: row.loan.id, reference: row.loan.reference },
      customer: row.loan.customer,
      loanBalance: outstandingFrom(row.loan.totalRepayment, upcomingCollected.get(row.loanId) ?? "0"),
    })),
    upcoming: upcomingRows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      outstanding: money(D(row.scheduledAmount).minus(D(row.paidAmount))),
      status: row.status,
      loan: { id: row.loan.id, reference: row.loan.reference },
      customer: row.loan.customer,
      loanBalance: outstandingFrom(row.loan.totalRepayment, upcomingCollected.get(row.loanId) ?? "0"),
    })),
    chartMargin: {
      expectedMargin: Number(expectedGrossMargin),
      netDisbursed: Number(activeDisbursed),
      lifetimeCollected: Number(lifetimeCollected),
      contractualRepayment: Number(activeRepayment),
    },
    totalsForCharts: {
      activeRepayment: toNumberForChart(activeRepayment),
      activeDisbursed: toNumberForChart(activeDisbursed),
      activeCollected: toNumberForChart(activeCollected),
      lifetimeCollected: toNumberForChart(lifetimeCollected),
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
