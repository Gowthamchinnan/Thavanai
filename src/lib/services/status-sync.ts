import { prisma } from "@/lib/db";
import { getIndiaTodayISO, isoToUtcMidnight } from "@/lib/dates";

/**
 * Persists derived installment statuses (upcoming / due today / overdue) so that
 * indexed queries and lists stay consistent as calendar days pass.
 */
export async function syncInstallmentStatuses(today: string = getIndiaTodayISO()): Promise<void> {
  const todayDate = isoToUtcMidnight(today);
  await prisma.$executeRaw`
    UPDATE "Installment" AS i
    SET "status" = c."computed"
    FROM (
      SELECT
        "id",
        (
          CASE
            WHEN "paidAmount" >= "scheduledAmount" THEN 'PAID'
            WHEN "dueDate" < ${todayDate}::date THEN 'OVERDUE'
            WHEN "dueDate" = ${todayDate}::date THEN 'DUE_TODAY'
            WHEN "paidAmount" > 0 THEN 'PARTIALLY_PAID'
            ELSE 'UPCOMING'
          END
        )::"InstallmentStatus" AS "computed"
      FROM "Installment"
    ) AS c
    WHERE i."id" = c."id" AND i."status" <> c."computed"
  `;
}
