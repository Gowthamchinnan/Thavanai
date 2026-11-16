"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { customerInputSchema, type CustomerInput } from "@/lib/validation";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsFromZod } from "@/lib/action-result";
import { createCustomer, setCustomerArchived, updateCustomer } from "@/lib/services/customers";
import { getActionIp } from "@/lib/request-ip";

export async function createCustomerAction(values: CustomerInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = customerInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const customer = await createCustomer(parsed.data, admin.id, await getActionIp());
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { ok: true, id: customer.id, message: `Customer ${customer.code} created.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create the customer." };
  }
}

export async function updateCustomerAction(id: string, values: CustomerInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = customerInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    await updateCustomer(id, parsed.data, admin.id, await getActionIp());
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath("/dashboard");
    return { ok: true, id, message: "Customer updated." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the customer." };
  }
}

export async function setCustomerArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setCustomerArchived(id, archived, admin.id, await getActionIp());
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath("/dashboard");
    return { ok: true, id, message: archived ? "Customer archived." : "Customer restored." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the customer." };
  }
}
