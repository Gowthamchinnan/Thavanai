export const INDIA_TZ = "Asia/Kolkata";
export const INDIA_OFFSET_MINUTES = 330;

export type ISODate = string;
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoParts(value: ISODate) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function pad(n: number, size = 2): string {
  return String(n).padStart(size, "0");
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isoToUtcMidnight(value: ISODate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function utcToISO(date: Date): ISODate {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getIndiaTodayISO(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  const date = isoToUtcMidnight(value);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToISO(date);
}

export function addMonthsClampedISO(value: ISODate, months: number): ISODate {
  const { year, month, day } = isoParts(value);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return toISODate(targetYear, targetMonth, clampedDay);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBeforeISO(a: ISODate, b: ISODate): boolean {
  return compareISO(a, b) < 0;
}

export function isSameISO(a: ISODate, b: ISODate): boolean {
  return a === b;
}

export function daysBetweenISO(from: ISODate, to: ISODate): number {
  const diff = isoToUtcMidnight(to).getTime() - isoToUtcMidnight(from).getTime();
  return Math.round(diff / 86_400_000);
}

export function generateDueDates(firstDueDate: ISODate, frequency: Frequency, count: number): ISODate[] {
  const dates: ISODate[] = [];
  for (let i = 0; i < count; i += 1) {
    if (frequency === "DAILY") dates.push(addDaysISO(firstDueDate, i));
    else if (frequency === "WEEKLY") dates.push(addDaysISO(firstDueDate, 7 * i));
    else dates.push(addMonthsClampedISO(firstDueDate, i));
  }
  return dates;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateISO(value: ISODate): string {
  const { year, month, day } = isoParts(value);
  return `${pad(day)} ${MONTHS[month - 1]} ${year}`;
}

export function formatDateShort(value: ISODate): string {
  const { year, month, day } = isoParts(value);
  return `${pad(day)}/${pad(month)}/${String(year).slice(2)}`;
}

export function formatDateTimeIndia(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateTimeISOIndia(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(", ", "T");
}

/** Parses a `datetime-local` string (YYYY-MM-DDTHH:mm) as Asia/Kolkata wall-clock time. */
export function indiaLocalInputToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const asUtc = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  const date = new Date(asUtc - INDIA_OFFSET_MINUTES * 60_000);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function indiaDateTimeInputNow(now: Date = new Date()): string {
  return formatDateTimeISOIndia(now);
}

export function indiaDayRangeUTC(iso: ISODate): { start: Date; end: Date } {
  const start = new Date(isoToUtcMidnight(iso).getTime() - INDIA_OFFSET_MINUTES * 60_000);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

export function getIndiaWeekRange(now: Date = new Date()): { from: ISODate; to: ISODate; start: Date; end: Date } {
  const today = getIndiaTodayISO(now);
  const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const from = addDaysISO(today, mondayOffset);
  const to = addDaysISO(from, 6);
  return { from, to, start: indiaDayRangeUTC(from).start, end: indiaDayRangeUTC(to).end };
}

export function getIndiaMonthRange(now: Date = new Date()): { from: ISODate; to: ISODate; start: Date; end: Date } {
  const today = getIndiaTodayISO(now);
  const { year, month } = isoParts(today);
  const from = toISODate(year, month, 1);
  const to = toISODate(year, month, daysInMonth(year, month));
  return { from, to, start: indiaDayRangeUTC(from).start, end: indiaDayRangeUTC(to).end };
}

export function lastNDaysIndia(n: number, now: Date = new Date()): ISODate[] {
  const today = getIndiaTodayISO(now);
  const days: ISODate[] = [];
  for (let i = n - 1; i >= 0; i -= 1) days.push(addDaysISO(today, -i));
  return days;
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

export function isValidDateRange(from?: string | null, to?: string | null): boolean {
  if (from && !isValidISODate(from)) return false;
  if (to && !isValidISODate(to)) return false;
  if (from && to && compareISO(from, to) > 0) return false;
  return true;
}
