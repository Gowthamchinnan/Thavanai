import { D, money, type MoneyInput } from "@/lib/money";
import { addDaysISO, type ISODate } from "@/lib/dates";
import type { InterestCalculationMethod } from "@prisma/client";

/**
 * Run Vati (Weekly Interest Loan) Engine
 *
 * Rules:
 * - Weekly interest-only loan.
 * - Customer pays interest every week.
 * - Weekly interest payments NEVER reduce principal.
 * - Principal remains unchanged until principal repayments are received.
 * - Remaining Principal = Original Principal - Total Principal Repaid.
 * - Actual Cash Disbursed = Original Principal - Upfront Deduction.
 * - Never compound or capitalize unpaid interest.
 */

export interface WeeklyInterestInput {
  principal: MoneyInput;
  rate: MoneyInput;
  method?: InterestCalculationMethod;
}

export function calculateWeeklyInterest({ principal, rate }: WeeklyInterestInput): string {
  const p = D(principal);
  const r = D(rate);
  if (p.lte(0) || r.lte(0)) return "0.00";
  // Simple weekly interest: Principal * (Rate / 100)
  const interest = p.times(r.dividedBy(100));
  return money(interest);
}

export interface BuildWeeklyScheduleParams {
  startDate: ISODate;
  principal: MoneyInput;
  rate: MoneyInput;
  method?: InterestCalculationMethod;
  collectionDay?: number | null; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  maturityDate?: ISODate | null;
  periodCount?: number | null;
}

export interface WeeklyInterestScheduleRow {
  sequence: number;
  fromDate: ISODate;
  dueDate: ISODate;
  principalBase: string;
  interestRate: string;
  scheduledAmount: string;
}

export function computeFirstWeeklyDueDate(startDate: ISODate, collectionDay?: number | null): ISODate {
  if (collectionDay == null || collectionDay < 0 || collectionDay > 6) {
    return addDaysISO(startDate, 7);
  }
  const [y, m, d] = startDate.split("-").map(Number);
  const currentDayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let daysUntil = (collectionDay - currentDayOfWeek + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // if today is collection day, first cycle due in 7 days
  return addDaysISO(startDate, daysUntil);
}

export function buildWeeklyInterestSchedule({
  startDate,
  principal,
  rate,
  method = "FLAT_SIMPLE",
  collectionDay = null,
  maturityDate = null,
  periodCount = null,
}: BuildWeeklyScheduleParams): { ok: boolean; rows: WeeklyInterestScheduleRow[]; errors: string[] } {
  const p = D(principal);
  const r = D(rate);

  if (p.lte(0)) return { ok: false, rows: [], errors: ["Principal must be greater than zero."] };
  if (r.lte(0)) return { ok: false, rows: [], errors: ["Weekly interest rate must be greater than zero."] };

  let count = periodCount ?? 26; // default 26 weeks horizon
  const firstDue = computeFirstWeeklyDueDate(startDate, collectionDay);

  if (maturityDate) {
    let currentDue = firstDue;
    let derivedCount = 0;
    while (derivedCount < 520) {
      derivedCount += 1;
      if (currentDue >= maturityDate) break;
      currentDue = addDaysISO(currentDue, 7);
    }
    count = Math.max(1, derivedCount);
  }

  const rows: WeeklyInterestScheduleRow[] = [];
  let currentFrom = startDate;
  let currentDue = firstDue;
  const weeklyScheduled = calculateWeeklyInterest({ principal: p, rate: r, method });

  for (let seq = 1; seq <= count; seq += 1) {
    rows.push({
      sequence: seq,
      fromDate: currentFrom,
      dueDate: currentDue,
      principalBase: money(p),
      interestRate: r.toFixed(3),
      scheduledAmount: weeklyScheduled,
    });
    currentFrom = currentDue;
    currentDue = addDaysISO(currentDue, 7);
  }

  return { ok: true, rows, errors: [] };
}
