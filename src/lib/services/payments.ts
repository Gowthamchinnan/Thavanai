import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { PaymentMode, PaymentStatus } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { allocateToInstallments } from "@/lib/allocation";
import { computeInstallmentStatus } from "@/lib/installments";
import { formatReceiptNumber, temporaryReference } from "@/lib/references";
import { getIndiaTodayISO, indiaDayRangeUTC, indiaLocalInputToDate, isValidISODate } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";
import type { PaymentInput } from "@/lib/validation";
import { ServiceError } from "@/lib/services/loans";
import { outstandingFrom } from "@/lib/services/balances";

export type RecordPaymentResult =
  | {
      ok: true;
      paymentId: string;
      receiptNumber: string;
      duplicate: boolean;
      completed: boolean;
      outstandingAfter: string;
    }
  | { ok: false; message: string };

const FUTURE_TOLERANCE_MS = 5 * 60_000;

export async function recordPayment(
  input: PaymentInput,
  adminId: string,
  ipAddress?: string | null,
): Promise<RecordPaymentResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
    select: { id: true, receiptNumber: true, loanId: true },
  });
  if (existing) {
    const detail = await getPaymentDetail(existing.id);
    return {
      ok: true,
      paymentId: existing.id,
      receiptNumber: existing.receiptNumber,
      duplicate: true,
      completed: detail?.loan.status === "COMPLETED",
      outstandingAfter: detail?.remaining ?? "0.00",
    };
  }

  const paidAt = indiaLocalInputToDate(input.paidAt);
  if (!paidAt) return { ok: false, message: "Enter a valid payment date and time." };
  if (paidAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return { ok: false, message: "Payment date cannot be in the future." };
  }

  const amount = D(input.amount).toDecimalPlaces(2);
  if (amount.lte(0)) return { ok: false, message: "Payment amount must be greater than zero." };
  if (!amount.eq(D(input.amount))) return { ok: false, message: "Payment amount can have at most two decimals." };

  const today = getIndiaTodayISO();
  const receiptYear = Number(getIndiaTodayISO(paidAt).slice(0, 4));

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT "id", "status"::text AS "status" FROM "Loan" WHERE "id" = ${input.loanId} FOR UPDATE
        `;
        if (!locked[0]) throw new ServiceError("Loan not found.");
        if (locked[0].status !== "ACTIVE") {
          throw new ServiceError("Payments can only be recorded against an active loan.");
        }

        const loan = await tx.loan.findUnique({
          where: { id: input.loanId },
          include: { installments: { orderBy: { sequence: "asc" } }, customer: true },
        });
        if (!loan) throw new ServiceError("Loan not found.");

        const outstanding = sumMoney(
          loan.installments.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))),
        );
        if (amount.gt(outstanding)) {
          throw new ServiceError(
            `Payment of ₹${money(amount)} exceeds the outstanding balance of ₹${money(outstanding)}. Overpayments are not accepted.`,
          );
        }

        const allocation = allocateToInstallments(
          money(amount),
          loan.installments.map((i) => ({
            id: i.id,
            sequence: i.sequence,
            dueDate: i.dueDate.toISOString().slice(0, 10),
            scheduledAmount: money(i.scheduledAmount),
            paidAmount: money(i.paidAmount),
          })),
        );
        if (D(allocation.unallocated).gt(0)) {
          throw new ServiceError("The payment could not be fully allocated to outstanding installments.");
        }

        const payment = await tx.payment.create({
          data: {
            receiptNumber: temporaryReference("RCPT"),
            loanId: loan.id,
            customerId: loan.customerId,
            amount: money(amount),
            paidAt,
            mode: input.mode,
            notes: input.notes?.trim() || null,
            idempotencyKey,
            createdById: adminId,
          },
        });

        const receiptNumber = formatReceiptNumber(payment.seq, receiptYear);
        await tx.payment.update({ where: { id: payment.id }, data: { receiptNumber } });

        for (const alloc of allocation.allocations) {
          const installment = loan.installments.find((i) => i.id === alloc.installmentId);
          if (!installment) continue;
          const newPaid = D(installment.paidAmount).plus(D(alloc.amount));
          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              installmentId: installment.id,
              amount: alloc.amount,
            },
          });
          await tx.installment.update({
            where: { id: installment.id },
            data: {
              paidAmount: money(newPaid),
              status: computeInstallmentStatus({
                dueDate: installment.dueDate.toISOString().slice(0, 10),
                scheduledAmount: installment.scheduledAmount,
                paidAmount: newPaid,
                today,
              }),
            },
          });
        }

        const newCollected = sumMoney(loan.installments.map((i) => i.paidAmount)).plus(amount);
        const completed = newCollected.gte(D(loan.totalRepayment));
        if (completed) {
          await tx.loan.update({ where: { id: loan.id }, data: { status: "COMPLETED", closedAt: new Date() } });
        }

        await writeAudit(tx, {
          actorId: adminId,
          action: "PAYMENT_RECORDED",
          entityType: "Payment",
          entityId: payment.id,
          summary: `Payment ${receiptNumber} of ₹${money(amount)} recorded for loan ${loan.reference}`,
          metadata: {
            loanId: loan.id,
            receiptNumber,
            amount: money(amount),
            mode: input.mode,
            paidAt: paidAt.toISOString(),
            allocations: allocation.allocations.map((a) => ({ sequence: a.sequence, amount: a.amount })),
            completed,
          },
          ipAddress,
        });

        return {
          ok: true as const,
          paymentId: payment.id,
          receiptNumber,
          duplicate: false,
          completed,
          outstandingAfter: outstandingFrom(loan.totalRepayment, newCollected),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );

    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: { loan: { select: { status: true } } },
      });
      if (duplicate) {
        return {
          ok: true,
          paymentId: duplicate.id,
          receiptNumber: duplicate.receiptNumber,
          duplicate: true,
          completed: duplicate.loan.status === "COMPLETED",
          outstandingAfter: "0.00",
        };
      }
    }
    if (error instanceof ServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function voidPayment(
  paymentId: string,
  reason: string,
  adminId: string,
  ipAddress?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT "id", "status"::text AS "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
        `;
        if (!locked[0]) throw new ServiceError("Payment not found.");
        if (locked[0].status !== "POSTED") throw new ServiceError("This payment has already been voided.");

        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            loan: { include: { installments: true } },
            allocations: true,
            customer: { select: { fullName: true } },
          },
        });
        if (!payment) throw new ServiceError("Payment not found.");

        await tx.payment.update({
          where: { id: paymentId },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason.trim() },
        });
        await tx.paymentReversal.create({
          data: {
            paymentId,
            amount: payment.amount,
            reason: reason.trim(),
            reversedById: adminId,
          },
        });

        const today = getIndiaTodayISO();
        for (const allocation of payment.allocations) {
          const installment = payment.loan.installments.find((i) => i.id === allocation.installmentId);
          if (!installment) continue;
          const subtracted = D(installment.paidAmount).minus(D(allocation.amount));
          const newPaid = subtracted.lt(0) ? D(0) : subtracted;
          await tx.installment.update({
            where: { id: installment.id },
            data: {
              paidAmount: money(newPaid),
              status: computeInstallmentStatus({
                dueDate: installment.dueDate.toISOString().slice(0, 10),
                scheduledAmount: installment.scheduledAmount,
                paidAmount: newPaid,
                today,
              }),
            },
          });
        }

        if (payment.loan.status === "COMPLETED") {
          const updatedInstallments = await tx.installment.findMany({
            where: { loanId: payment.loanId },
            select: { paidAmount: true, scheduledAmount: true },
          });
          const outstanding = sumMoney(
            updatedInstallments.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount))),
          );
          if (outstanding.gt(0)) {
            await tx.loan.update({ where: { id: payment.loanId }, data: { status: "ACTIVE", closedAt: null } });
          }
        }

        await writeAudit(tx, {
          actorId: adminId,
          action: "PAYMENT_VOIDED",
          entityType: "Payment",
          entityId: paymentId,
          summary: `Payment ${payment.receiptNumber} of ₹${money(payment.amount)} voided: ${reason.trim()}`,
          metadata: {
            loanId: payment.loanId,
            receiptNumber: payment.receiptNumber,
            amount: money(payment.amount),
            reason: reason.trim(),
          },
          ipAddress,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function getPaymentDetail(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      loan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      createdBy: { select: { name: true } },
      reversal: true,
      allocations: { include: { installment: { select: { sequence: true } } } },
    },
  });
  if (!payment) return null;

  const postedSum = await prisma.payment.aggregate({
    where: { loanId: payment.loanId, status: "POSTED" },
    _sum: { amount: true },
  });
  const totalPaid = money(postedSum._sum.amount ?? 0);
  const remaining = outstandingFrom(payment.loan.totalRepayment, totalPaid);
  const next = payment.loan.installments.find((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));

  return {
    payment,
    customer: payment.customer,
    loan: payment.loan,
    totalPaid,
    remaining,
    nextDue: next
      ? {
          sequence: next.sequence,
          dueDate: next.dueDate.toISOString().slice(0, 10),
          amount: money(D(next.scheduledAmount).minus(D(next.paidAmount))),
        }
      : null,
  };
}

export interface PaymentListParams {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  mode?: string;
  page?: number;
  pageSize?: number;
}

export async function listPayments(params: PaymentListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const base: Prisma.PaymentWhereInput = {};
  const paidAtFilter: Prisma.DateTimeFilter = {};
  if (params.from && isValidISODate(params.from)) {
    paidAtFilter.gte = indiaDayRangeUTC(params.from).start;
  }
  if (params.to && isValidISODate(params.to)) {
    paidAtFilter.lt = indiaDayRangeUTC(params.to).end;
  }
  if (Object.keys(paidAtFilter).length) base.paidAt = paidAtFilter;
  if (params.mode && params.mode !== "ALL") base.mode = params.mode as PaymentMode;
  if (params.q?.trim()) {
    const q = params.q.trim();
    base.OR = [
      { receiptNumber: { contains: q, mode: "insensitive" } },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { mobile: { contains: q } } },
      { loan: { reference: { contains: q, mode: "insensitive" } } },
    ];
  }

  const where: Prisma.PaymentWhereInput = { ...base };
  if (params.status && params.status !== "ALL") where.status = params.status as PaymentStatus;

  const [total, payments, postedSum, voidedCount] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true } },
        loan: { select: { id: true, reference: true, status: true } },
        createdBy: { select: { name: true } },
        reversal: { select: { reason: true, reversedAt: true } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.aggregate({ where: { ...base, status: "POSTED" }, _sum: { amount: true } }),
    prisma.payment.count({ where: { ...base, status: "VOIDED" } }),
  ]);

  return {
    items: payments,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      postedAmount: money(postedSum._sum.amount ?? 0),
      voidedCount,
    },
  };
}
