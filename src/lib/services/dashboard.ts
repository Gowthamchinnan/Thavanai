import { prisma } from "@/lib/db";
import { D, money, sumMoney, toNumberForChart } from "@/lib/money";
import {
  addDaysISO,
  getIndiaMonthRange,
  getIndiaTodayISO,
  getIndiaWeekRange,
  indiaDayRangeUTC,
  isoToUtcMidnight,
  lastNDaysIndia,
} from "@/lib/dates";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";

export async function getDashboardData() {
  await syncInstallmentStatuses();
  const today = getIndiaTodayISO();
  const todayDate = isoToUtcMidnight(today);
  const trendDays = lastNDaysIndia(14);
  const trendStart = indiaDayRangeUTC(trendDays[0]).start;
  const todayRange = indiaDayRangeUTC(today);
  const weekRange = getIndiaWeekRange();
  const monthRange = getIndiaMonthRange();
  const upcomingEnd = isoToUtcMidnight(addDaysISO(today, 7));

  // Fetch all active loans with their installments, interest periods, and customer
  const activeLoans = await prisma.loan.findMany({
    where: { status: "ACTIVE" },
    include: {
      customer: { select: { id: true, fullName: true, mobile: true, code: true } },
      installments: true,
      interestPeriods: true,
      payments: {
        where: { status: "POSTED" },
        select: { id: true, amount: true, principalAmount: true, interestAmount: true, paidAt: true },
      },
    },
  });

  const totalUniqueCustomers = new Set(activeLoans.map((l) => l.customerId)).size;

  // Payments aggregates
  const [
    lifetimePaymentsAgg,
    todayPaymentsAgg,
    weekPaymentsAgg,
    monthPaymentsAgg,
    statusGroups,
    recentPaymentsRaw,
    trendPaymentsRaw,
  ] = await Promise.all([
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
    prisma.loan.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.findMany({
      where: { status: "POSTED" },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true } },
        loan: { select: { id: true, reference: true, category: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "POSTED", paidAt: { gte: trendStart } },
      select: { amount: true, paidAt: true },
    }),
  ]);

  // Separate loans by category
  const thavanaiLoans = activeLoans.filter((l) => l.category === "THAVANAI");
  const monthlyVattiLoans = activeLoans.filter((l) => l.category === "MONTHLY_VATTI");
  const weeklyRunVatiLoans = activeLoans.filter((l) => l.category === "WEEKLY_RUN_VATI");

  // --- THAVANAI METRICS ---
  const thavanaiDisbursed = sumMoney(thavanaiLoans.map((l) => l.netDisbursed));
  const thavanaiRepayment = sumMoney(thavanaiLoans.map((l) => l.totalRepayment));
  const thavanaiCollected = sumMoney(thavanaiLoans.flatMap((l) => l.payments.map((p) => p.amount)));
  const thavanaiRemaining = thavanaiRepayment.minus(thavanaiCollected).clamp(0, Infinity);
  const thavanaiGrossMargin = thavanaiRepayment.minus(thavanaiDisbursed);

  const thavanaiInstallments = thavanaiLoans.flatMap((l) => l.installments);
  const thavanaiDueToday = thavanaiInstallments.filter((i) => i.status === "DUE_TODAY");
  const thavanaiDueTodayAmount = sumMoney(thavanaiDueToday.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))));
  const thavanaiOverdue = thavanaiInstallments.filter((i) => i.status === "OVERDUE");
  const thavanaiOverdueAmount = sumMoney(thavanaiOverdue.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))));

  // --- VATTI (MONTHLY) METRICS ---
  const monthlyVattiDisbursed = sumMoney(monthlyVattiLoans.map((l) => l.nominalAmount));
  const monthlyVattiPrincipalPaid = sumMoney(monthlyVattiLoans.flatMap((l) => l.payments.map((p) => p.principalAmount)));
  const monthlyVattiOutstandingPrincipal = monthlyVattiDisbursed.minus(monthlyVattiPrincipalPaid).clamp(0, Infinity);

  const monthlyVattiPeriods = monthlyVattiLoans.flatMap((l) => l.interestPeriods);
  const monthlyVattiAccruedPeriods = monthlyVattiPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today);
  const monthlyVattiInterestAccrued = sumMoney(monthlyVattiAccruedPeriods.map((p) => p.scheduledAmount));
  const monthlyVattiInterestCollected = sumMoney(monthlyVattiLoans.flatMap((l) => l.payments.map((p) => p.interestAmount)));
  const monthlyVattiInterestPending = monthlyVattiInterestAccrued.minus(monthlyVattiInterestCollected).clamp(0, Infinity);
  const monthlyVattiTotalOutstanding = monthlyVattiOutstandingPrincipal.plus(monthlyVattiInterestPending);

  const monthlyVattiOverduePeriods = monthlyVattiPeriods.filter((p) => p.status === "OVERDUE");
  const monthlyVattiOverdueInterest = sumMoney(monthlyVattiOverduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))));

  const monthlyVattiTodayPayments = sumMoney(
    monthlyVattiLoans.flatMap((l) =>
      l.payments.filter((p) => p.paidAt >= todayRange.start && p.paidAt < todayRange.end).map((p) => p.amount),
    ),
  );
  const monthlyVattiMonthPayments = sumMoney(
    monthlyVattiLoans.flatMap((l) =>
      l.payments.filter((p) => p.paidAt >= monthRange.start && p.paidAt < monthRange.end).map((p) => p.amount),
    ),
  );

  // --- RUN VATI (WEEKLY) METRICS ---
  const runVatiDisbursed = sumMoney(weeklyRunVatiLoans.map((l) => l.nominalAmount));
  const runVatiPrincipalPaid = sumMoney(weeklyRunVatiLoans.flatMap((l) => l.payments.map((p) => p.principalAmount)));
  const runVatiOutstandingPrincipal = runVatiDisbursed.minus(runVatiPrincipalPaid).clamp(0, Infinity);

  const runVatiPeriods = weeklyRunVatiLoans.flatMap((l) => l.interestPeriods);
  const runVatiAccruedPeriods = runVatiPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today);
  const runVatiInterestAccrued = sumMoney(runVatiAccruedPeriods.map((p) => p.scheduledAmount));
  const runVatiInterestCollected = sumMoney(weeklyRunVatiLoans.flatMap((l) => l.payments.map((p) => p.interestAmount)));
  const runVatiInterestPending = runVatiInterestAccrued.minus(runVatiInterestCollected).clamp(0, Infinity);
  const runVatiTotalOutstanding = runVatiOutstandingPrincipal.plus(runVatiInterestPending);

  const runVatiOverduePeriods = runVatiPeriods.filter((p) => p.status === "OVERDUE");
  const runVatiOverdueInterest = sumMoney(runVatiOverduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))));

  const runVatiWeekPayments = sumMoney(
    weeklyRunVatiLoans.flatMap((l) =>
      l.payments.filter((p) => p.paidAt >= weekRange.start && p.paidAt < weekRange.end).map((p) => p.amount),
    ),
  );

  // --- CONSOLIDATED OVERALL METRICS ---
  // Consolidated outstanding:
  // Thavanai remaining repayment + Vatti (principal + accrued unpaid interest) + Run Vati (principal + accrued unpaid interest)
  const totalOutstandingReceivables = thavanaiRemaining
    .plus(monthlyVattiTotalOutstanding)
    .plus(runVatiTotalOutstanding);

  const totalOverdueAmount = thavanaiOverdueAmount
    .plus(monthlyVattiOverdueInterest)
    .plus(runVatiOverdueInterest);

  const totalCashDisbursed = thavanaiDisbursed
    .plus(monthlyVattiDisbursed)
    .plus(runVatiDisbursed);

  const totalActiveCollected = thavanaiCollected
    .plus(monthlyVattiPrincipalPaid)
    .plus(monthlyVattiInterestCollected)
    .plus(runVatiPrincipalPaid)
    .plus(runVatiInterestCollected);

  // Trend map
  const trendMap = new Map<string, number>();
  for (const day of trendDays) trendMap.set(day, 0);
  for (const payment of trendPaymentsRaw) {
    const key = getIndiaTodayISO(payment.paidAt);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + Number(payment.amount.toString()));
  }

  const statusCounts: Record<string, number> = {};
  for (const group of statusGroups) statusCounts[group.status] = group._count._all;

  // Due today list (from Thavanai installments + Vatti/Run Vati interest periods)
  const dueTodayItems = [
    ...thavanaiLoans.flatMap((l) =>
      l.installments
        .filter((i) => i.status === "DUE_TODAY")
        .map((i) => ({
          id: i.id,
          sequence: i.sequence,
          category: l.category,
          dueDate: i.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(i.scheduledAmount).minus(D(i.paidAmount))),
          status: i.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
    ...monthlyVattiLoans.flatMap((l) =>
      l.interestPeriods
        .filter((p) => p.status === "DUE_TODAY")
        .map((p) => ({
          id: p.id,
          sequence: p.sequence,
          category: l.category,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(p.scheduledAmount).minus(D(p.paidAmount))),
          status: p.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
    ...weeklyRunVatiLoans.flatMap((l) =>
      l.interestPeriods
        .filter((p) => p.status === "DUE_TODAY")
        .map((p) => ({
          id: p.id,
          sequence: p.sequence,
          category: l.category,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(p.scheduledAmount).minus(D(p.paidAmount))),
          status: p.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
  ].slice(0, 8);

  // Upcoming items
  const upcomingItems = [
    ...thavanaiLoans.flatMap((l) =>
      l.installments
        .filter((i) => (i.status === "UPCOMING" || i.status === "PARTIALLY_PAID") && i.dueDate > todayDate && i.dueDate <= upcomingEnd)
        .map((i) => ({
          id: i.id,
          sequence: i.sequence,
          category: l.category,
          dueDate: i.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(i.scheduledAmount).minus(D(i.paidAmount))),
          status: i.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
    ...monthlyVattiLoans.flatMap((l) =>
      l.interestPeriods
        .filter((p) => (p.status === "UPCOMING" || p.status === "PARTIALLY_PAID") && p.dueDate > todayDate && p.dueDate <= upcomingEnd)
        .map((p) => ({
          id: p.id,
          sequence: p.sequence,
          category: l.category,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(p.scheduledAmount).minus(D(p.paidAmount))),
          status: p.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
    ...weeklyRunVatiLoans.flatMap((l) =>
      l.interestPeriods
        .filter((p) => (p.status === "UPCOMING" || p.status === "PARTIALLY_PAID") && p.dueDate > todayDate && p.dueDate <= upcomingEnd)
        .map((p) => ({
          id: p.id,
          sequence: p.sequence,
          category: l.category,
          dueDate: p.dueDate.toISOString().slice(0, 10),
          outstanding: money(D(p.scheduledAmount).minus(D(p.paidAmount))),
          status: p.status,
          loan: { id: l.id, reference: l.reference, category: l.category },
          customer: l.customer,
        })),
    ),
  ].slice(0, 8);

  const runVatiData = {
    activeLoans: weeklyRunVatiLoans.length,
    principalDisbursed: money(runVatiDisbursed),
    outstandingPrincipal: money(runVatiOutstandingPrincipal),
    weeklyInterestAccrued: money(runVatiInterestAccrued),
    interestCollected: money(runVatiInterestCollected),
    interestPending: money(runVatiInterestPending),
    totalOutstanding: money(runVatiTotalOutstanding),
    weekCollections: money(runVatiWeekPayments),
    overdueInterest: money(runVatiOverdueInterest),
    overdueCount: runVatiOverduePeriods.length,
  };

  return {
    today,
    overall: {
      totalCustomers: totalUniqueCustomers,
      activeLoans: activeLoans.length,
      cashDisbursed: money(totalCashDisbursed),
      amountCollected: money(lifetimePaymentsAgg._sum.amount ?? 0),
      activeCollected: money(totalActiveCollected),
      outstandingReceivables: money(totalOutstandingReceivables),
      overdueAmount: money(totalOverdueAmount),
      todayCollection: money(todayPaymentsAgg._sum.amount ?? 0),
      weekCollection: money(weekPaymentsAgg._sum.amount ?? 0),
      monthCollection: money(monthPaymentsAgg._sum.amount ?? 0),
    },
    thavanai: {
      totalLoans: thavanaiLoans.length,
      amountDisbursed: money(thavanaiDisbursed),
      repaymentCommitment: money(thavanaiRepayment),
      totalCollected: money(thavanaiCollected),
      remainingBalance: money(thavanaiRemaining),
      todayInstallmentsCount: thavanaiDueToday.length,
      todayInstallmentsAmount: money(thavanaiDueTodayAmount),
      overdueInstallmentsCount: thavanaiOverdue.length,
      overdueInstallmentsAmount: money(thavanaiOverdueAmount),
      expectedGrossMargin: money(thavanaiGrossMargin),
    },
    monthlyVatti: {
      activeLoans: monthlyVattiLoans.length,
      principalDisbursed: money(monthlyVattiDisbursed),
      outstandingPrincipal: money(monthlyVattiOutstandingPrincipal),
      interestAccrued: money(monthlyVattiInterestAccrued),
      interestCollected: money(monthlyVattiInterestCollected),
      interestPending: money(monthlyVattiInterestPending),
      totalOutstanding: money(monthlyVattiTotalOutstanding),
      todayCollections: money(monthlyVattiTodayPayments),
      monthCollections: money(monthlyVattiMonthPayments),
      overdueInterest: money(monthlyVattiOverdueInterest),
      overdueCount: monthlyVattiOverduePeriods.length,
    },
    runVati: runVatiData,
    trend: trendDays.map((day) => ({
      date: day,
      amount: Number((trendMap.get(day) ?? 0).toFixed(2)),
    })),
    statusCounts,
    recentPayments: recentPaymentsRaw.map((payment) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: money(payment.amount),
      paidAt: payment.paidAt.toISOString(),
      mode: payment.mode,
      customer: payment.customer,
      loan: payment.loan,
    })),
    dueToday: dueTodayItems,
    upcoming: upcomingItems,
    totalsForCharts: {
      activeRepayment: toNumberForChart(totalOutstandingReceivables),
      activeDisbursed: toNumberForChart(totalCashDisbursed),
      activeCollected: toNumberForChart(totalActiveCollected),
      lifetimeCollected: toNumberForChart(lifetimePaymentsAgg._sum.amount ?? 0),
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
