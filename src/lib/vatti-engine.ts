import { D, money, type MoneyInput } from "@/lib/money";
import {
  daysInMonth,
  getIndiaTodayISO,
  isoParts,
  toISODate,
  type ISODate,
} from "@/lib/dates";
import type { InterestCalculationMethod, InstallmentStatus } from "@prisma/client";

export interface MonthlyInterestInput {
  principal: MoneyInput;
  rate: MoneyInput;
  method?: InterestCalculationMethod;
}

export function calculateMonthlyInterest({ principal, rate }: MonthlyInterestInput): string {
  const p = D(principal);
  const r = D(rate);
  if (p.lte(0) || r.lte(0)) return "0.00";
  // Simple monthly interest: Principal * (Rate / 100)
  const interest = p.times(r.dividedBy(100));
  return money(interest);
}

export interface BuildMonthlyScheduleParams {
  startDate: ISODate;
  principal: MoneyInput;
  rate: MoneyInput;
  method?: InterestCalculationMethod;
  collectionDay?: number | null;
  maturityDate?: ISODate | null;
  periodCount?: number | null;
}

export interface MonthlyInterestScheduleRow {
  sequence: number;
  fromDate: ISODate;
  dueDate: ISODate;
  principalBase: string;
  interestRate: string;
  scheduledAmount: string;
}

export function computeNextMonthlyDueDate(fromDate: ISODate, collectionDay?: number | null): ISODate {
  const { year, month, day } = isoParts(fromDate);
  const targetDay = collectionDay && collectionDay >= 1 && collectionDay <= 31 ? collectionDay : day;
  const nextMonthIndex = month; // next month in 0-indexed terms is month
  const targetYear = year + Math.floor(nextMonthIndex / 12);
  const targetMonth = (nextMonthIndex % 12) + 1;
  const clampedDay = Math.min(targetDay, daysInMonth(targetYear, targetMonth));
  return toISODate(targetYear, targetMonth, clampedDay);
}

export function buildMonthlyInterestSchedule({
  startDate,
  principal,
  rate,
  method = "FLAT_SIMPLE",
  collectionDay = null,
  maturityDate = null,
  periodCount = null,
}: BuildMonthlyScheduleParams): { ok: boolean; rows: MonthlyInterestScheduleRow[]; errors: string[] } {
  const p = D(principal);
  const r = D(rate);

  if (p.lte(0)) return { ok: false, rows: [], errors: ["Principal must be greater than zero."] };
  if (r.lte(0)) return { ok: false, rows: [], errors: ["Monthly interest rate must be greater than zero."] };

  let count = periodCount ?? 12; // default 12 months horizon
  if (maturityDate) {
    // If maturity date is specified, derive number of monthly periods up to maturity date
    let currentFrom = startDate;
    let derivedCount = 0;
    while (derivedCount < 120) {
      const nextDue = computeNextMonthlyDueDate(currentFrom, collectionDay);
      derivedCount += 1;
      if (nextDue >= maturityDate) break;
      currentFrom = nextDue;
    }
    count = Math.max(1, derivedCount);
  }

  const rows: MonthlyInterestScheduleRow[] = [];
  let currentFrom = startDate;
  const monthlyScheduled = calculateMonthlyInterest({ principal: p, rate: r, method });

  for (let seq = 1; seq <= count; seq += 1) {
    const nextDue = computeNextMonthlyDueDate(currentFrom, collectionDay);
    rows.push({
      sequence: seq,
      fromDate: currentFrom,
      dueDate: nextDue,
      principalBase: money(p),
      interestRate: r.toFixed(3),
      scheduledAmount: monthlyScheduled,
    });
    currentFrom = nextDue;
  }

  return { ok: true, rows, errors: [] };
}

export interface InterestAllocationTarget {
  id: string;
  sequence: number;
  scheduledAmount: MoneyInput;
  paidAmount: MoneyInput;
  dueDate: ISODate;
}

export function allocateInterestToPeriods(
  amountToAllocate: MoneyInput,
  openPeriods: InterestAllocationTarget[],
): {
  allocations: { interestPeriodId: string; sequence: number; amount: string }[];
  unallocated: string;
} {
  let remaining = D(amountToAllocate);
  const allocations: { interestPeriodId: string; sequence: number; amount: string }[] = [];

  const sorted = [...openPeriods].sort((a, b) => a.sequence - b.sequence);

  for (const period of sorted) {
    if (remaining.lte(0)) break;
    const periodOutstanding = D(period.scheduledAmount).minus(D(period.paidAmount));
    if (periodOutstanding.lte(0)) continue;

    const alloc = remaining.gte(periodOutstanding) ? periodOutstanding : remaining;
    allocations.push({
      interestPeriodId: period.id,
      sequence: period.sequence,
      amount: money(alloc),
    });
    remaining = remaining.minus(alloc);
  }

  return {
    allocations,
    unallocated: money(remaining.lt(0) ? 0 : remaining),
  };
}

export function computeInterestPeriodStatus({
  dueDate,
  scheduledAmount,
  paidAmount,
  today = getIndiaTodayISO(),
}: {
  dueDate: ISODate;
  scheduledAmount: MoneyInput;
  paidAmount: MoneyInput;
  today?: ISODate;
}): InstallmentStatus {
  const scheduled = D(scheduledAmount);
  const paid = D(paidAmount);

  if (paid.gte(scheduled) && scheduled.gt(0)) return "PAID";
  if (dueDate < today) return paid.gt(0) ? "PARTIALLY_PAID" : "OVERDUE";
  if (dueDate === today) return "DUE_TODAY";
  return paid.gt(0) ? "PARTIALLY_PAID" : "UPCOMING";
}
