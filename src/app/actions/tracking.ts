"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { getActionIp } from "@/lib/request-ip";
import {
  getOrCreateCustomerTrackingLink,
  regenerateCustomerTrackingLink,
  revokeCustomerTrackingLink,
  type AdminTrackingState,
} from "@/lib/services/tracking";

export type TrackingActionResponse =
  | { ok: true; state: AdminTrackingState; message: string }
  | { ok: false; message: string };

export async function generateTrackingLinkAction(customerId: string): Promise<TrackingActionResponse> {
  const admin = await requireAdmin();
  if (!customerId?.trim()) return { ok: false, message: "Customer is required." };
  try {
    const state = await getOrCreateCustomerTrackingLink(customerId.trim(), admin.id, await getActionIp());
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, state, message: "Customer tracking link ready." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not generate tracking link." };
  }
}

export async function regenerateTrackingLinkAction(customerId: string): Promise<TrackingActionResponse> {
  const admin = await requireAdmin();
  if (!customerId?.trim()) return { ok: false, message: "Customer is required." };
  try {
    const state = await regenerateCustomerTrackingLink(customerId.trim(), admin.id, await getActionIp());
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, state, message: "New tracking link generated. Previous link has been revoked." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not regenerate tracking link." };
  }
}

export async function revokeTrackingLinkAction(customerId: string): Promise<TrackingActionResponse> {
  const admin = await requireAdmin();
  if (!customerId?.trim()) return { ok: false, message: "Customer is required." };
  try {
    const state = await revokeCustomerTrackingLink(customerId.trim(), admin.id, await getActionIp());
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, state, message: "Tracking link revoked." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not revoke tracking link." };
  }
}
