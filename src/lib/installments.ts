import { D, money, type MoneyInput } from "@/lib/money";
import { compareISO, type ISODate } from "@/lib/dates";

export type InstallmentStatusValue = "UPCOMING" | "DUE_TODAY" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export function computeInstallmentStatus(input: {
  dueDate: ISODate;
  scheduledAmount: MoneyInput;
  paidAmount: MoneyInput;
  today: ISODate;
}): InstallmentStatusValue {
  const scheduled = D(input.scheduledAmount);
  const paid = D(input.paidAmount);
  if (paid.gte(scheduled) && scheduled.gt(0)) return "PAID";
  if (compareISO(input.dueDate, input.today) < 0) return "OVERDUE";
  if (compareISO(input.dueDate, input.today) === 0) return "DUE_TODAY";
  if (paid.gt(0)) return "PARTIALLY_PAID";
  return "UPCOMING";
}

export function installmentOutstanding(scheduledAmount: MoneyInput, paidAmount: MoneyInput): string {
  const outstanding = D(scheduledAmount).minus(D(paidAmount));
  return money(outstanding.lt(0) ? 0 : outstanding);
}

export function isOpenInstallment(input: { scheduledAmount: MoneyInput; paidAmount: MoneyInput }): boolean {
  return D(input.paidAmount).lt(D(input.scheduledAmount));
}
