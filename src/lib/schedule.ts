import { D, money, type MoneyInput } from "@/lib/money";
import { generateDueDates, type Frequency, type ISODate, isValidISODate } from "@/lib/dates";

export const MAX_INSTALLMENTS = 1000;

export interface BuildScheduleInput {
  firstDueDate: ISODate;
  frequency: Frequency;
  installmentAmount: MoneyInput;
  totalRepayment: MoneyInput;
  installmentCount?: number | null;
}

export interface ScheduleRow {
  sequence: number;
  dueDate: ISODate;
  scheduledAmount: string;
}

export interface BuildScheduleResult {
  ok: boolean;
  errors: string[];
  installmentCount: number;
  rows: ScheduleRow[];
  finalInstallmentAmount: string;
  scheduleTotal: string;
}

export function resolveInstallmentCount(
  totalRepayment: MoneyInput,
  installmentAmount: MoneyInput,
  providedCount?: number | null,
): { count: number; errors: string[] } {
  const errors: string[] = [];
  const total = D(totalRepayment);
  const amount = D(installmentAmount);

  if (amount.lte(0)) errors.push("Installment amount must be greater than zero.");
  if (total.lte(0)) errors.push("Contractual total repayment must be greater than zero.");
  if (errors.length) return { count: 0, errors };

  const maxCount = total.div(amount).ceil().toNumber();

  if (providedCount == null) {
    if (maxCount > MAX_INSTALLMENTS) {
      return {
        count: 0,
        errors: [`This would create ${maxCount} installments. The maximum supported is ${MAX_INSTALLMENTS}.`],
      };
    }
    return { count: maxCount, errors: [] };
  }

  if (!Number.isInteger(providedCount) || providedCount < 1) {
    return { count: 0, errors: ["Total number of installments must be a positive whole number."] };
  }
  if (providedCount > MAX_INSTALLMENTS) {
    return { count: 0, errors: [`Total number of installments cannot exceed ${MAX_INSTALLMENTS}.`] };
  }
  if (providedCount > maxCount) {
    return {
      count: 0,
      errors: [
        `With ${providedCount} installments the final installment would be negative or zero. Use ${maxCount} installments or fewer.`,
      ],
    };
  }
  const last = total.minus(amount.times(providedCount - 1));
  if (last.gt(amount)) {
    return {
      count: 0,
      errors: [
        `With ${providedCount} installments of ${money(amount)}, only ${money(amount.times(providedCount))} of ${money(total)} is scheduled. Increase the installment amount or the number of installments.`,
      ],
    };
  }
  if (last.lte(0)) {
    return { count: 0, errors: ["The final installment would be zero. Reduce the number of installments."] };
  }
  return { count: providedCount, errors: [] };
}

export function buildSchedule(input: BuildScheduleInput): BuildScheduleResult {
  const errors: string[] = [];

  if (!isValidISODate(input.firstDueDate)) errors.push("First due date is invalid.");
  if (!(input.frequency === "DAILY" || input.frequency === "WEEKLY" || input.frequency === "MONTHLY")) {
    errors.push("Frequency must be daily, weekly or monthly.");
  }

  const resolved = resolveInstallmentCount(input.totalRepayment, input.installmentAmount, input.installmentCount ?? null);
  errors.push(...resolved.errors);

  if (errors.length) {
    return {
      ok: false,
      errors,
      installmentCount: 0,
      rows: [],
      finalInstallmentAmount: "0.00",
      scheduleTotal: "0.00",
    };
  }

  const total = D(input.totalRepayment);
  const base = D(input.installmentAmount);
  const count = resolved.count;
  const dates = generateDueDates(input.firstDueDate, input.frequency, count);

  let running = D(0);
  const rows: ScheduleRow[] = dates.map((dueDate, index) => {
    const isLast = index === count - 1;
    const amount = isLast ? total.minus(running) : base;
    running = running.plus(amount);
    return {
      sequence: index + 1,
      dueDate,
      scheduledAmount: money(amount),
    };
  });

  const finalInstallmentAmount = rows.length ? rows[rows.length - 1].scheduledAmount : "0.00";

  return {
    ok: rows.every((r) => D(r.scheduledAmount).gt(0)) && running.eq(total),
    errors: rows.every((r) => D(r.scheduledAmount).gt(0)) && running.eq(total) ? [] : ["Schedule totals do not match the contractual repayment amount."],
    installmentCount: count,
    rows,
    finalInstallmentAmount,
    scheduleTotal: money(running),
  };
}
