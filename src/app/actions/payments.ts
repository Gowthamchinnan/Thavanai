"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { paymentInputSchema, voidPaymentSchema, type PaymentInput } from "@/lib/validation";
import { fieldErrorsFromZod } from "@/lib/action-result";
import { recordPayment, voidPayment } from "@/lib/services/payments";
import { getActionIp } from "@/lib/request-ip";

export type PaymentActionResult =
  | {
      ok: true;
      paymentId: string;
      receiptNumber: string;
      duplicate: boolean;
      completed: boolean;
      outstandingAfter: string;
      message: string;
    }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath("/loans");
  revalidatePath("/customers");
  revalidatePath("/collections/today");
  revalidatePath("/collections/overdue");
  revalidatePath("/collections/upcoming");
}

export async function recordPaymentAction(values: PaymentInput): Promise<PaymentActionResult> {
  const admin = await requireAdmin();
  const parsed = paymentInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the payment details.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const result = await recordPayment(parsed.data, admin.id, await getActionIp());
    if (!result.ok) return result;
    refresh();
    revalidatePath(`/loans/${parsed.data.loanId}`);
    return {
      ok: true,
      paymentId: result.paymentId,
      receiptNumber: result.receiptNumber,
      duplicate: result.duplicate,
      completed: result.completed,
      outstandingAfter: result.outstandingAfter,
      message: result.duplicate
        ? `This payment was already recorded as ${result.receiptNumber}.`
        : result.completed
          ? `Payment recorded. Loan is now fully repaid. Receipt ${result.receiptNumber}.`
          : `Payment recorded. Receipt ${result.receiptNumber}.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not record the payment." };
  }
}

export async function voidPaymentAction(values: { paymentId: string; reason: string }): Promise<PaymentActionResult> {
  const admin = await requireAdmin();
  const parsed = voidPaymentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "A clear void reason is required.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const result = await voidPayment(parsed.data.paymentId, parsed.data.reason, admin.id, await getActionIp());
    if (!result.ok) return result;
    refresh();
    return {
      ok: true,
      paymentId: parsed.data.paymentId,
      receiptNumber: "",
      duplicate: false,
      completed: false,
      outstandingAfter: "",
      message: "Payment voided. Record a replacement payment if required.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not void the payment." };
  }
}
