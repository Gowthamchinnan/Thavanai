"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { loanInputSchema, writeOffSchema, type LoanInput } from "@/lib/validation";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsFromZod } from "@/lib/action-result";
import {
  activateLoan,
  cancelDraftLoan,
  createLoan,
  writeOffLoan,
} from "@/lib/services/loans";
import { getActionIp } from "@/lib/request-ip";

function revalidateLoanPaths(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/loans");
  revalidatePath("/customers");
  revalidatePath("/collections/today");
  revalidatePath("/collections/overdue");
  revalidatePath("/collections/upcoming");
  revalidatePath("/payments");
  if (id) {
    revalidatePath(`/loans/${id}`);
    revalidatePath(`/customers`);
  }
}

export async function createLoanAction(values: LoanInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = loanInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const loan = await createLoan(parsed.data, admin.id, await getActionIp());
    revalidateLoanPaths(loan.id);
    return {
      ok: true,
      id: loan.id,
      message: loan.status === "DRAFT" ? `Draft loan ${loan.reference} created.` : `Loan ${loan.reference} created and activated.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create the loan." };
  }
}

export async function activateLoanAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const loan = await activateLoan(id, admin.id, await getActionIp());
    revalidateLoanPaths(id);
    return { ok: true, id, message: `Loan ${loan.reference} activated.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not activate the loan." };
  }
}

export async function cancelLoanAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await cancelDraftLoan(id, admin.id, await getActionIp());
    revalidateLoanPaths(id);
    return { ok: true, id, message: "Draft loan cancelled." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not cancel the loan." };
  }
}

export async function writeOffLoanAction(values: { loanId: string; reason: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = writeOffSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    await writeOffLoan(parsed.data.loanId, parsed.data.reason, admin.id, await getActionIp());
    revalidateLoanPaths(parsed.data.loanId);
    return { ok: true, id: parsed.data.loanId, message: "Loan written off." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not write off the loan." };
  }
}
