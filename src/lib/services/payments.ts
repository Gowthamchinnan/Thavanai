import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { LoanCategory, PaymentMode, PaymentStatus } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { allocateToInstallments } from "@/lib/allocation";
import { computeInstallmentStatus } from "@/lib/installments";
import { allocateInterestToPeriods, computeInterestPeriodStatus, calculateMonthlyInterest } from "@/lib/vatti-engine";
import { calculateWeeklyInterest } from "@/lib/run-vati-engine";
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
        const locked = await tx.$queryRaw<{ id: string; status: string; category: string }[]>`
          SELECT "id", "status"::text AS "status", "category"::text AS "category" FROM "Loan" WHERE "id" = ${input.loanId} FOR UPDATE
        `;
        if (!locked[0]) throw new ServiceError("Loan not found.");
        if (locked[0].status !== "ACTIVE") {
          throw new ServiceError("Payments can only be recorded against an active loan.");
        }

        const loan = await tx.loan.findUnique({
          where: { id: input.loanId },
          include: {
            installments: { orderBy: { sequence: "asc" } },
            interestPeriods: { orderBy: { sequence: "asc" } },
            customer: true,
          },
        });
        if (!loan) throw new ServiceError("Loan not found.");

        if (loan.category === "THAVANAI") {
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
              principalAmount: money(amount),
              interestAmount: "0.00",
              previousPrincipal: money(outstanding),
              newPrincipal: money(outstanding.minus(amount)),
              previousInterest: "0.00",
              newInterest: "0.00",
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
        }

        // MONTHLY_VATTI or WEEKLY_RUN_VATI
        const postedPayments = await tx.payment.findMany({
          where: { loanId: loan.id, status: "POSTED" },
          select: { principalAmount: true, interestAmount: true },
        });
        const currentPrincipalPaid = sumMoney(postedPayments.map((p) => p.principalAmount));
        const currentRemainingPrincipal = D(loan.nominalAmount).minus(currentPrincipalPaid);

        const openPeriods = loan.interestPeriods
          .filter((p) => D(p.paidAmount).lt(D(p.scheduledAmount)))
          .map((p) => ({
            id: p.id,
            sequence: p.sequence,
            dueDate: p.dueDate.toISOString().slice(0, 10),
            scheduledAmount: money(p.scheduledAmount),
            paidAmount: money(p.paidAmount),
          }));

        const totalPendingInterest = sumMoney(openPeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))));

        let principalPortion = D(0);
        let interestPortion = D(0);

        if (input.paymentType === "FULL_SETTLEMENT") {
          interestPortion = totalPendingInterest;
          principalPortion = currentRemainingPrincipal;
        } else if (input.paymentType === "INTEREST_ONLY") {
          // Strictly interest-only payment: NEVER reduces principal
          interestPortion = amount;
          principalPortion = D(0);
        } else if (input.paymentType === "PRINCIPAL_ONLY") {
          // Strictly principal repayment: NEVER reduces interest
          principalPortion = amount;
          interestPortion = D(0);
        } else if (
          input.interestAmount &&
          input.principalAmount &&
          (D(input.interestAmount).gt(0) || D(input.principalAmount).gt(0))
        ) {
          interestPortion = D(input.interestAmount);
          principalPortion = D(input.principalAmount);
        } else if (input.interestAmount && D(input.interestAmount).gt(0)) {
          interestPortion = D(input.interestAmount);
          principalPortion = D(0);
        } else if (input.principalAmount && D(input.principalAmount).gt(0)) {
          principalPortion = D(input.principalAmount);
          interestPortion = D(0);
        } else {
          // If no breakdown or type specified:
          if (amount.eq(currentRemainingPrincipal.plus(totalPendingInterest))) {
            interestPortion = totalPendingInterest;
            principalPortion = currentRemainingPrincipal;
          } else if (amount.lte(totalPendingInterest)) {
            // Treat as interest-only collection
            interestPortion = amount;
            principalPortion = D(0);
          } else {
            interestPortion = totalPendingInterest;
            principalPortion = amount.minus(totalPendingInterest);
          }
        }

        if (principalPortion.gt(currentRemainingPrincipal)) {
          throw new ServiceError(
            `Principal payment of ₹${money(principalPortion)} exceeds remaining principal of ₹${money(currentRemainingPrincipal)}.`,
          );
        }

        const newRemainingPrincipal = currentRemainingPrincipal.minus(principalPortion);

        // Allocate interest to open periods
        let interestAllocationResults: { interestPeriodId: string; sequence: number; amount: string }[] = [];
        if (interestPortion.gt(0)) {
          const allocation = allocateInterestToPeriods(interestPortion, openPeriods);
          interestAllocationResults = allocation.allocations;
        }

        const previousInterest = money(totalPendingInterest);
        const newInterest = money(totalPendingInterest.minus(interestPortion).clamp(0, Infinity));

        const payment = await tx.payment.create({
          data: {
            receiptNumber: temporaryReference("RCPT"),
            loanId: loan.id,
            customerId: loan.customerId,
            amount: money(amount),
            principalAmount: money(principalPortion),
            interestAmount: money(interestPortion),
            previousPrincipal: money(currentRemainingPrincipal),
            newPrincipal: money(newRemainingPrincipal),
            previousInterest,
            newInterest,
            paidAt,
            mode: input.mode,
            notes: input.notes?.trim() || null,
            idempotencyKey,
            createdById: adminId,
          },
        });

        const receiptNumber = formatReceiptNumber(payment.seq, receiptYear);
        await tx.payment.update({ where: { id: payment.id }, data: { receiptNumber } });

        // Record interest allocations
        for (const alloc of interestAllocationResults) {
          const period = loan.interestPeriods.find((p) => p.id === alloc.interestPeriodId);
          if (!period) continue;
          const newPaid = D(period.paidAmount).plus(D(alloc.amount));
          await tx.interestAllocation.create({
            data: {
              paymentId: payment.id,
              interestPeriodId: period.id,
              amount: alloc.amount,
            },
          });
          await tx.interestPeriod.update({
            where: { id: period.id },
            data: {
              paidAmount: money(newPaid),
              status: computeInterestPeriodStatus({
                dueDate: period.dueDate.toISOString().slice(0, 10),
                scheduledAmount: period.scheduledAmount,
                paidAmount: newPaid,
                today,
              }),
            },
          });
        }

        // If reducing balance and principal was repaid, recalculate future interest periods
        if (loan.interestType === "REDUCING_BALANCE" && principalPortion.gt(0)) {
          const futurePeriods = loan.interestPeriods.filter(
            (p) => p.dueDate.toISOString().slice(0, 10) > today && D(p.paidAmount).eq(0),
          );

          const rate = loan.interestRate?.toString() || "0";
          for (const fp of futurePeriods) {
            const newScheduled =
              loan.category === "MONTHLY_VATTI"
                ? calculateMonthlyInterest({ principal: newRemainingPrincipal, rate, method: "REDUCING_BALANCE" })
                : calculateWeeklyInterest({ principal: newRemainingPrincipal, rate, method: "REDUCING_BALANCE" });

            await tx.interestPeriod.update({
              where: { id: fp.id },
              data: {
                principalBase: money(newRemainingPrincipal),
                scheduledAmount: newScheduled,
              },
            });
          }
        }

        // Check if fully settled: principal is 0 and pending interest is 0
        const isCompleted = newRemainingPrincipal.lte(0) && D(newInterest).lte(0);
        if (isCompleted) {
          await tx.loan.update({ where: { id: loan.id }, data: { status: "COMPLETED", closedAt: new Date() } });
        }

        await writeAudit(tx, {
          actorId: adminId,
          action: "PAYMENT_RECORDED",
          entityType: "Payment",
          entityId: payment.id,
          summary: `Payment ${receiptNumber} of ₹${money(amount)} (Principal: ₹${money(principalPortion)}, Interest: ₹${money(interestPortion)}) recorded for loan ${loan.reference}`,
          metadata: {
            loanId: loan.id,
            receiptNumber,
            amount: money(amount),
            principalAmount: money(principalPortion),
            interestAmount: money(interestPortion),
            newPrincipal: money(newRemainingPrincipal),
            newInterest,
            completed: isCompleted,
          },
          ipAddress,
        });

        return {
          ok: true as const,
          paymentId: payment.id,
          receiptNumber,
          duplicate: false,
          completed: isCompleted,
          outstandingAfter: money(newRemainingPrincipal.plus(D(newInterest))),
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
            loan: { include: { installments: true, interestPeriods: true } },
            allocations: true,
            interestAllocations: true,
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

        if (payment.loan.category === "THAVANAI") {
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
        } else {
          // MONTHLY_VATTI or WEEKLY_RUN_VATI
          // Roll back interest allocations
          for (const alloc of payment.interestAllocations) {
            const period = payment.loan.interestPeriods.find((p) => p.id === alloc.interestPeriodId);
            if (!period) continue;
            const subtracted = D(period.paidAmount).minus(D(alloc.amount));
            const newPaid = subtracted.lt(0) ? D(0) : subtracted;
            await tx.interestPeriod.update({
              where: { id: period.id },
              data: {
                paidAmount: money(newPaid),
                status: computeInterestPeriodStatus({
                  dueDate: period.dueDate.toISOString().slice(0, 10),
                  scheduledAmount: period.scheduledAmount,
                  paidAmount: newPaid,
                  today,
                }),
              },
            });
          }

          // If principal was paid in this payment, restore principal in future reducing balance periods
          if (payment.loan.interestType === "REDUCING_BALANCE" && D(payment.principalAmount).gt(0)) {
            const remainingPayments = await tx.payment.findMany({
              where: { loanId: payment.loanId, status: "POSTED", id: { not: paymentId } },
              select: { principalAmount: true },
            });
            const restoredPaidPrincipal = sumMoney(remainingPayments.map((p) => p.principalAmount));
            const restoredRemainingPrincipal = D(payment.loan.nominalAmount).minus(restoredPaidPrincipal);

            const futurePeriods = payment.loan.interestPeriods.filter(
              (p) => p.dueDate.toISOString().slice(0, 10) > today && D(p.paidAmount).eq(0),
            );
            const rate = payment.loan.interestRate?.toString() || "0";
            for (const fp of futurePeriods) {
              const newScheduled =
                payment.loan.category === "MONTHLY_VATTI"
                  ? calculateMonthlyInterest({ principal: restoredRemainingPrincipal, rate, method: "REDUCING_BALANCE" })
                  : calculateWeeklyInterest({ principal: restoredRemainingPrincipal, rate, method: "REDUCING_BALANCE" });

              await tx.interestPeriod.update({
                where: { id: fp.id },
                data: {
                  principalBase: money(restoredRemainingPrincipal),
                  scheduledAmount: newScheduled,
                },
              });
            }
          }

          if (payment.loan.status === "COMPLETED") {
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
      loan: {
        include: {
          installments: { orderBy: { sequence: "asc" } },
          interestPeriods: { orderBy: { sequence: "asc" } },
        },
      },
      createdBy: { select: { name: true } },
      reversal: true,
      allocations: { include: { installment: { select: { sequence: true } } } },
      interestAllocations: { include: { interestPeriod: { select: { sequence: true } } } },
    },
  });
  if (!payment) return null;

  const postedPayments = await prisma.payment.findMany({
    where: { loanId: payment.loanId, status: "POSTED" },
    select: { amount: true, principalAmount: true, interestAmount: true },
  });
  const totalPaid = money(sumMoney(postedPayments.map((p) => p.amount)));
  const principalPaid = money(sumMoney(postedPayments.map((p) => p.principalAmount)));
  const interestPaid = money(sumMoney(postedPayments.map((p) => p.interestAmount)));

  let remaining = "0.00";
  let nextDue: { sequence: number; dueDate: string; amount: string } | null = null;

  if (payment.loan.category === "THAVANAI") {
    remaining = outstandingFrom(payment.loan.totalRepayment, totalPaid);
    const next = payment.loan.installments.find((i) => D(i.paidAmount).lt(D(i.scheduledAmount)));
    if (next) {
      nextDue = {
        sequence: next.sequence,
        dueDate: next.dueDate.toISOString().slice(0, 10),
        amount: money(D(next.scheduledAmount).minus(D(next.paidAmount))),
      };
    }
  } else {
    // Vatti or Run Vati
    const remainingPrincipal = D(payment.loan.nominalAmount).minus(D(principalPaid)).clamp(0, Infinity);
    const accrued = sumMoney(payment.loan.interestPeriods.map((p) => p.scheduledAmount));
    const pendingInterest = accrued.minus(D(interestPaid)).clamp(0, Infinity);
    remaining = money(remainingPrincipal.plus(pendingInterest));

    const nextPeriod = payment.loan.interestPeriods.find((p) => D(p.paidAmount).lt(D(p.scheduledAmount)));
    if (nextPeriod) {
      nextDue = {
        sequence: nextPeriod.sequence,
        dueDate: nextPeriod.dueDate.toISOString().slice(0, 10),
        amount: money(D(nextPeriod.scheduledAmount).minus(D(nextPeriod.paidAmount))),
      };
    }
  }

  return {
    payment,
    customer: payment.customer,
    loan: payment.loan,
    totalPaid,
    principalPaid,
    interestPaid,
    remaining,
    nextDue,
  };
}

export interface PaymentListParams {
  q?: string;
  category?: string;
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
  if (params.category && params.category !== "ALL") {
    base.loan = { category: params.category as LoanCategory };
  }
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
        loan: { select: { id: true, reference: true, status: true, category: true } },
        createdBy: { select: { name: true } },
        reversal: { select: { reason: true, reversedAt: true } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.aggregate({ where: { ...base, status: "POSTED" }, _sum: { amount: true, principalAmount: true, interestAmount: true } }),
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
      principalAmount: money(postedSum._sum.principalAmount ?? 0),
      interestAmount: money(postedSum._sum.interestAmount ?? 0),
      voidedCount,
    },
  };
}
