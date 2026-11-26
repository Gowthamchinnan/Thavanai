import { prisma } from "@/lib/db";
import { getIndiaTodayISO, isoToUtcMidnight } from "@/lib/dates";

async function runWithReconnectRetry(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    const code = (error as { code?: string } | null)?.code;
    if (code === "P1017" || code === "P1001" || msg.includes("Server has closed the connection")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fn();
      return;
    }
    throw error;
  }
}

/**
 * Persists derived installment and interest period statuses (upcoming / due today / overdue) so that
 * indexed queries and lists stay consistent as calendar days pass.
 */
export async function syncInstallmentStatuses(today: string = getIndiaTodayISO()): Promise<void> {
  const todayDate = isoToUtcMidnight(today);
  await runWithReconnectRetry(async () => {
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

    await prisma.$executeRaw`
      UPDATE "InterestPeriod" AS p
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
        FROM "InterestPeriod"
      ) AS c
      WHERE p."id" = c."id" AND p."status" <> c."computed"
    `;
  });
}
