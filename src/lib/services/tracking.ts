import { prisma } from "@/lib/db";
import type { LoanCategory, LoanFrequency, LoanStatus } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getIndiaTodayISO, formatDateTimeIndia } from "@/lib/dates";
import { D, money, percent, sumMoney, type MoneyInput } from "@/lib/money";
import { computeInstallmentStatus } from "@/lib/installments";
import { buildSchedule } from "@/lib/schedule";
import { outstandingFrom } from "@/lib/services/balances";
import {
  buildTrackingPath,
  decryptTrackingToken,
  encryptTrackingToken,
  generateTrackingToken,
  hashTrackingToken,
  isValidTrackingTokenFormat,
} from "@/lib/tracking";

export type CustomerTrackingStatus = "ACTIVE" | "REVOKED" | "NONE";

export interface AdminTrackingState {
  status: CustomerTrackingStatus;
  trackingPath: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
}

export interface PublicThavanaiPayment {
  paidAtLabel: string;
  amount: string;
}

export type PublicScheduleStatus = "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE";

export interface PublicScheduleRow {
  sequence: number;
  dueDate: string;
  scheduledAmount: string;
  paidAmount: string;
  status: PublicScheduleStatus;
}

export interface PublicScheduleSummary {
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  overdueInstallments: number;
  totalScheduledAmount: string;
  totalPaid: string;
  remainingAmount: string;
}

export interface PublicVattiPayment {
  paidAtLabel: string;
  amount: string;
  interestAmount: string;
  principalAmount: string;
}

export interface PublicThavanaiLoan {
  reference: string;
  category: "THAVANAI";
  status: LoanStatus;
  frequency: LoanFrequency;
  originalLoanAmount: string;
  installmentAmount: string;
  totalPaid: string;
  remainingAmount: string;
  installmentsPaid: number;
  installmentsTotal: number;
  installmentsRemaining: number;
  nextDueDate: string | null;
  progressPercent: number;
  payments: PublicThavanaiPayment[];
  schedule: PublicScheduleRow[];
  scheduleSummary: PublicScheduleSummary;
}

export interface PublicVattiLoan {
  reference: string;
  category: "MONTHLY_VATTI" | "WEEKLY_RUN_VATI";
  status: LoanStatus;
  originalPrincipal: string;
  interestRate: string | null;
  totalInterestCollected: string;
  pendingInterest: string;
  principalRepaid: string;
  remainingPrincipal: string;
  nextDueDate: string | null;
  payments: PublicVattiPayment[];
}

export type PublicTrackedLoan = PublicThavanaiLoan | PublicVattiLoan;

export interface PublicTrackingData {
  ok: true;
  customerName: string;
  loans: PublicTrackedLoan[];
  summary: {
    totalLoans: number;
    activeLoans: number;
    hasThavanai: boolean;
    hasInterestLoans: boolean;
    thavanaiRemaining: string;
    vattiRemainingPrincipal: string;
    vattiPendingInterest: string;
    totalRemaining: string;
  };
}

export type PublicTrackingResult =
  | PublicTrackingData
  | { ok: false; reason: "UNAVAILABLE" };

/** Returns the current admin-facing tracking link state for a customer without creating one. */
export async function getCustomerTrackingStatus(customerId: string): Promise<AdminTrackingState> {
  const links = await prisma.customerTrackingLink.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }],
    take: 5,
    select: { status: true, encryptedToken: true, updatedAt: true, revokedAt: true },
  });

  const active = links.find((l) => l.status === "ACTIVE" && l.revokedAt === null);
  if (active) {
    const token = decryptTrackingToken(active.encryptedToken);
    if (token) {
      return {
        status: "ACTIVE",
        trackingPath: buildTrackingPath(token),
        updatedAt: active.updatedAt.toISOString(),
        revokedAt: null,
      };
    }
  }

  const latestRevoked = links.find((l) => l.status === "REVOKED" || l.revokedAt !== null);
  if (latestRevoked) {
    return {
      status: "REVOKED",
      trackingPath: null,
      updatedAt: latestRevoked.updatedAt.toISOString(),
      revokedAt: (latestRevoked.revokedAt ?? latestRevoked.updatedAt).toISOString(),
    };
  }

  return {
    status: "NONE",
    trackingPath: null,
    updatedAt: null,
    revokedAt: null,
  };
}

/** Reuses the customer's existing active tracking link, or generates one atomically if none is active. */
export async function getOrCreateCustomerTrackingLink(
  customerId: string,
  adminId: string,
  ipAddress?: string | null,
): Promise<AdminTrackingState> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; code: string; fullName: string }[]>`
      SELECT "id", "code", "fullName" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE
    `;
    const customer = locked[0];
    if (!customer) throw new Error("Customer not found.");

    const existing = await tx.customerTrackingLink.findFirst({
      where: { customerId, status: "ACTIVE", revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, encryptedToken: true, updatedAt: true },
    });

    if (existing) {
      const existingToken = decryptTrackingToken(existing.encryptedToken);
      if (existingToken) {
        return {
          status: "ACTIVE",
          trackingPath: buildTrackingPath(existingToken),
          updatedAt: existing.updatedAt.toISOString(),
          revokedAt: null,
        };
      }
    }

    const now = new Date();
    await tx.customerTrackingLink.updateMany({
      where: { customerId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });

    const rawToken = generateTrackingToken();
    const created = await tx.customerTrackingLink.create({
      data: {
        customerId,
        tokenHash: hashTrackingToken(rawToken),
        encryptedToken: encryptTrackingToken(rawToken),
        status: "ACTIVE",
      },
      select: { updatedAt: true },
    });

    await writeAudit(tx, {
      actorId: adminId,
      action: "TRACKING_LINK_GENERATED",
      entityType: "Customer",
      entityId: customerId,
      summary: `Tracking link generated for customer ${customer.code} (${customer.fullName})`,
      ipAddress,
    });

    return {
      status: "ACTIVE",
      trackingPath: buildTrackingPath(rawToken),
      updatedAt: created.updatedAt.toISOString(),
      revokedAt: null,
    };
  });
}

/** Immediately revokes any active link for the customer and generates a fresh secure replacement. */
export async function regenerateCustomerTrackingLink(
  customerId: string,
  adminId: string,
  ipAddress?: string | null,
): Promise<AdminTrackingState> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; code: string; fullName: string }[]>`
      SELECT "id", "code", "fullName" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE
    `;
    const customer = locked[0];
    if (!customer) throw new Error("Customer not found.");

    const now = new Date();
    await tx.customerTrackingLink.updateMany({
      where: { customerId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });

    const rawToken = generateTrackingToken();
    const created = await tx.customerTrackingLink.create({
      data: {
        customerId,
        tokenHash: hashTrackingToken(rawToken),
        encryptedToken: encryptTrackingToken(rawToken),
        status: "ACTIVE",
      },
      select: { updatedAt: true },
    });

    await writeAudit(tx, {
      actorId: adminId,
      action: "TRACKING_LINK_REGENERATED",
      entityType: "Customer",
      entityId: customerId,
      summary: `Tracking link regenerated for customer ${customer.code} (${customer.fullName})`,
      ipAddress,
    });

    return {
      status: "ACTIVE",
      trackingPath: buildTrackingPath(rawToken),
      updatedAt: created.updatedAt.toISOString(),
      revokedAt: null,
    };
  });
}

/** Revokes the customer's active tracking link without creating a replacement. */
export async function revokeCustomerTrackingLink(
  customerId: string,
  adminId: string,
  ipAddress?: string | null,
): Promise<AdminTrackingState> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; code: string; fullName: string }[]>`
      SELECT "id", "code", "fullName" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE
    `;
    const customer = locked[0];
    if (!customer) throw new Error("Customer not found.");

    const now = new Date();
    await tx.customerTrackingLink.updateMany({
      where: { customerId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });

    await writeAudit(tx, {
      actorId: adminId,
      action: "TRACKING_LINK_REVOKED",
      entityType: "Customer",
      entityId: customerId,
      summary: `Tracking link revoked for customer ${customer.code} (${customer.fullName})`,
      ipAddress,
    });

    return {
      status: "REVOKED",
      trackingPath: null,
      updatedAt: now.toISOString(),
      revokedAt: now.toISOString(),
    };
  });
}

interface ScheduleSourceInstallment {
  sequence: number;
  dueDate: Date;
  scheduledAmount: { toString(): string };
  paidAmount: { toString(): string };
}

function toPublicScheduleStatus(input: {
  dueDate: string;
  scheduledAmount: MoneyInput;
  paidAmount: MoneyInput;
  today: string;
}): PublicScheduleStatus {
  const status = computeInstallmentStatus(input);
  if (status === "PAID") return "PAID";
  if (status === "PARTIALLY_PAID") return "PARTIALLY_PAID";
  if (status === "OVERDUE") return "OVERDUE";
  return "PENDING";
}

/** Builds the public installment statement from the persisted, allocation-aware installment rows. */
function scheduleFromInstallments(installments: ScheduleSourceInstallment[], today: string): PublicScheduleRow[] {
  return installments.map((installment) => {
    const scheduledAmount = money(installment.scheduledAmount as MoneyInput);
    const paidAmount = money(installment.paidAmount as MoneyInput);
    const dueDate = installment.dueDate.toISOString().slice(0, 10);
    return {
      sequence: installment.sequence,
      dueDate,
      scheduledAmount,
      paidAmount,
      status: toPublicScheduleStatus({ dueDate, scheduledAmount, paidAmount, today }),
    };
  });
}

/**
 * Fallback for legacy loans whose installment rows were never persisted: derives the schedule from the
 * saved loan terms and spreads the recorded payments across the oldest installments first (the same rule
 * used when payments are recorded).
 */
function scheduleFromLoanTerms(
  loan: {
    firstDueDate: Date | null;
    startDate: Date;
    frequency: LoanFrequency;
    installmentAmount: { toString(): string };
    totalRepayment: { toString(): string };
    installmentCount: number;
  },
  totalPaid: string,
  today: string,
): PublicScheduleRow[] {
  const firstDueDate = (loan.firstDueDate ?? loan.startDate).toISOString().slice(0, 10);
  const result = buildSchedule({
    firstDueDate,
    frequency: loan.frequency,
    installmentAmount: money(loan.installmentAmount),
    totalRepayment: money(loan.totalRepayment),
    installmentCount: loan.installmentCount > 0 ? loan.installmentCount : null,
  });
  if (!result.ok) return [];

  let remaining = D(totalPaid);
  return result.rows.map((row) => {
    const scheduled = D(row.scheduledAmount);
    let allocated = D(0);
    if (remaining.gt(0)) {
      allocated = remaining.gte(scheduled) ? scheduled : remaining;
      remaining = remaining.minus(allocated);
    }
    const scheduledAmount = money(scheduled);
    const paidAmount = money(allocated);
    return {
      sequence: row.sequence,
      dueDate: row.dueDate,
      scheduledAmount,
      paidAmount,
      status: toPublicScheduleStatus({ dueDate: row.dueDate, scheduledAmount, paidAmount, today }),
    };
  });
}

/**
 * Resolves a public customer tracking token strictly on the server and returns sanitized,
 * read-only loan and payment data for that single customer only.
 */
export async function getPublicCustomerTracking(rawToken: string): Promise<PublicTrackingResult> {
  if (!isValidTrackingTokenFormat(rawToken)) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const tokenHash = hashTrackingToken(rawToken);
  const link = await prisma.customerTrackingLink.findUnique({
    where: { tokenHash },
    select: {
      status: true,
      revokedAt: true,
      customerId: true,
      customer: {
        select: {
          fullName: true,
        },
      },
    },
  });

  if (!link || link.status !== "ACTIVE" || link.revokedAt !== null) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const today = getIndiaTodayISO();

  const rawLoans = await prisma.loan.findMany({
    where: {
      customerId: link.customerId,
      status: { in: ["ACTIVE", "COMPLETED", "WRITTEN_OFF"] },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      reference: true,
      category: true,
      status: true,
      frequency: true,
      nominalAmount: true,
      totalRepayment: true,
      installmentAmount: true,
      installmentCount: true,
      firstDueDate: true,
      startDate: true,
      interestRate: true,
      installments: {
        orderBy: { sequence: "asc" },
        select: {
          sequence: true,
          dueDate: true,
          scheduledAmount: true,
          paidAmount: true,
        },
      },
      interestPeriods: {
        orderBy: { sequence: "asc" },
        select: {
          dueDate: true,
          scheduledAmount: true,
          paidAmount: true,
        },
      },
      payments: {
        where: { status: "POSTED" },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: {
          amount: true,
          principalAmount: true,
          interestAmount: true,
          paidAt: true,
        },
      },
    },
  });

  let thavanaiRemaining = D(0);
  let vattiRemainingPrincipal = D(0);
  let vattiPendingInterest = D(0);

  const loans: PublicTrackedLoan[] = rawLoans.map((loan) => {
    const category: LoanCategory = loan.category;

    if (category === "THAVANAI") {
      const totalPaidDecimal = sumMoney(loan.payments.map((p) => p.amount));
      const totalPaid = money(totalPaidDecimal);
      const remainingStr = loan.status === "ACTIVE" ? outstandingFrom(loan.totalRepayment, totalPaidDecimal) : "0.00";
      if (loan.status === "ACTIVE") {
        thavanaiRemaining = thavanaiRemaining.plus(D(remainingStr));
      }

      const schedule = loan.installments.length
        ? scheduleFromInstallments(loan.installments, today)
        : scheduleFromLoanTerms(loan, totalPaid, today);

      const installmentsTotal = schedule.length || loan.installmentCount;
      const installmentsPaid = schedule.filter((row) => row.status === "PAID").length;
      const installmentsRemaining = Math.max(0, installmentsTotal - installmentsPaid);
      const nextInstallment = schedule.find((row) => row.status !== "PAID");

      return {
        reference: loan.reference,
        category: "THAVANAI",
        status: loan.status,
        frequency: loan.frequency,
        originalLoanAmount: money(loan.nominalAmount),
        installmentAmount: money(loan.installmentAmount),
        totalPaid,
        remainingAmount: remainingStr,
        installmentsPaid,
        installmentsTotal,
        installmentsRemaining,
        nextDueDate: loan.status === "ACTIVE" && nextInstallment ? nextInstallment.dueDate : null,
        progressPercent: Math.min(100, percent(totalPaidDecimal, loan.totalRepayment)),
        payments: loan.payments.map((p) => ({
          paidAtLabel: formatDateTimeIndia(p.paidAt),
          amount: money(p.amount),
        })),
        schedule,
        scheduleSummary: {
          totalInstallments: schedule.length,
          paidInstallments: installmentsPaid,
          pendingInstallments: schedule.filter((row) => row.status === "PENDING" || row.status === "PARTIALLY_PAID").length,
          overdueInstallments: schedule.filter((row) => row.status === "OVERDUE").length,
          totalScheduledAmount: money(sumMoney(schedule.map((row) => row.scheduledAmount))),
          totalPaid,
          remainingAmount: remainingStr,
        },
      };
    }

    // MONTHLY_VATTI or WEEKLY_RUN_VATI — interest payments NEVER reduce principal.
    const principalRepaid = sumMoney(loan.payments.map((p) => p.principalAmount));
    const totalInterestCollected = sumMoney(loan.payments.map((p) => p.interestAmount));
    const remainingPrincipal = D(loan.nominalAmount).minus(principalRepaid).clamp(0, Infinity);
    const accruedInterest = sumMoney(
      loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
    );
    const pendingInterest =
      loan.status === "ACTIVE" ? accruedInterest.minus(totalInterestCollected).clamp(0, Infinity) : D(0);

    if (loan.status === "ACTIVE") {
      vattiRemainingPrincipal = vattiRemainingPrincipal.plus(remainingPrincipal);
      vattiPendingInterest = vattiPendingInterest.plus(pendingInterest);
    }

    const nextPeriod = loan.interestPeriods.find((p) => D(p.paidAmount).lt(D(p.scheduledAmount)));

    return {
      reference: loan.reference,
      category: category === "MONTHLY_VATTI" ? "MONTHLY_VATTI" : "WEEKLY_RUN_VATI",
      status: loan.status,
      originalPrincipal: money(loan.nominalAmount),
      interestRate: loan.interestRate ? loan.interestRate.toString() : null,
      totalInterestCollected: money(totalInterestCollected),
      pendingInterest: money(pendingInterest),
      principalRepaid: money(principalRepaid),
      remainingPrincipal: money(remainingPrincipal),
      nextDueDate: loan.status === "ACTIVE" && nextPeriod ? nextPeriod.dueDate.toISOString().slice(0, 10) : null,
      payments: loan.payments.map((p) => ({
        paidAtLabel: formatDateTimeIndia(p.paidAt),
        amount: money(p.amount),
        interestAmount: money(p.interestAmount),
        principalAmount: money(p.principalAmount),
      })),
    };
  });

  const activeLoans = loans.filter((l) => l.status === "ACTIVE").length;
  const totalRemaining = thavanaiRemaining.plus(vattiRemainingPrincipal).plus(vattiPendingInterest);

  return {
    ok: true,
    customerName: link.customer.fullName,
    loans,
    summary: {
      totalLoans: loans.length,
      activeLoans,
      hasThavanai: loans.some((l) => l.category === "THAVANAI"),
      hasInterestLoans: loans.some((l) => l.category !== "THAVANAI"),
      thavanaiRemaining: money(thavanaiRemaining),
      vattiRemainingPrincipal: money(vattiRemainingPrincipal),
      vattiPendingInterest: money(vattiPendingInterest),
      totalRemaining: money(totalRemaining),
    },
  };
}
