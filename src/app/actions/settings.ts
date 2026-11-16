"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import {
  passwordSchema,
  profileSchema,
  settingsSchema,
} from "@/lib/validation";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsFromZod } from "@/lib/action-result";
import { changePassword, updateProfile, updateSettings } from "@/lib/services/settings";
import { getActionIp } from "@/lib/request-ip";

export async function updateSettingsAction(values: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const settings = await updateSettings(parsed.data, admin.id, await getActionIp());
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: `Settings saved for ${settings.businessName}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save settings." };
  }
}

export async function updateProfileAction(values: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    await updateProfile(parsed.data, admin.id, await getActionIp());
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: "Profile updated. New details apply on your next sign-in." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the profile." };
  }
}

export async function changePasswordAction(values: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = passwordSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    await changePassword(admin.id, parsed.data.currentPassword, parsed.data.newPassword, await getActionIp());
    revalidatePath("/settings");
    return { ok: true, message: "Password updated. Use the new password next time you sign in." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the password." };
  }
}
