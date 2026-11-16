import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal | { toString(): string };

export const MAX_AMOUNT = new Decimal("99999999999.99");

export function D(value: MoneyInput): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

export function money(value: MoneyInput): string {
  return D(value).toFixed(2);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(D(value)), new Decimal(0));
}

export function isPositive(value: MoneyInput): boolean {
  return D(value).gt(0);
}

export function isValidMoneyInput(value: string): boolean {
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(value.trim())) return false;
  const d = D(value);
  return d.gt(0) && d.lte(MAX_AMOUNT);
}

export function formatINR(value: MoneyInput, options?: { decimals?: boolean }): string {
  const decimals = options?.decimals ?? true;
  const d = D(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(d.toNumber());
}

export function formatNumberIN(value: MoneyInput, decimals = 2): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(D(value).toNumber());
}

export function formatAmountPlain(value: MoneyInput, decimals = 2): string {
  return D(value).toFixed(decimals);
}

export function toNumberForChart(value: MoneyInput): number {
  return Number(D(value).toFixed(2));
}

export function percent(part: MoneyInput, total: MoneyInput): number {
  const t = D(total);
  if (t.lte(0)) return 0;
  return Number(D(part).div(t).times(100).toFixed(1));
}
