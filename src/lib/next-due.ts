import { addDaysISO, generateDueDates, type Frequency, type ISODate, daysBetweenISO } from "@/lib/dates";

export function schedulePreview(
  firstDueDate: ISODate,
  frequency: Frequency,
  count: number,
  limit = 6,
): { dueDate: ISODate; label: string }[] {
  return generateDueDates(firstDueDate, frequency, Math.min(count, limit)).map((date, index) => ({
    dueDate: date,
    label: `#${index + 1}`,
  }));
}

export function nextDueAfter(firstDueDate: ISODate, frequency: Frequency, sequenceIndex: number): ISODate {
  if (frequency === "DAILY") return addDaysISO(firstDueDate, sequenceIndex + 1);
  if (frequency === "WEEKLY") return addDaysISO(firstDueDate, (sequenceIndex + 1) * 7);
  const [year, month, day] = firstDueDate.split("-").map(Number);
  const targetIndex = month - 1 + sequenceIndex + 1;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clamped = Math.min(day, daysInTarget);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export function overdueDays(dueDate: ISODate, today: ISODate): number {
  const diff = daysBetweenISO(dueDate, today);
  return diff > 0 ? diff : 0;
}
