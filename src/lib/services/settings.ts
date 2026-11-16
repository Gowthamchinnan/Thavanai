import { prisma } from "@/lib/db";
import type { AppSettings } from "@prisma/client";
import type { z } from "zod";
import type { profileSchema, settingsSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "@/lib/services/loans";

export async function getSettings(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessName: "Thavanai Manager",
      currency: "INR",
      timezone: "Asia/Kolkata",
      receiptHeader: "Thank you for your payment.",
      receiptFooter: "This is a manually recorded payment receipt. No automatic payment was collected.",
    },
  });
}

export async function updateSettings(
  input: z.infer<typeof settingsSchema>,
  adminId: string,
  ipAddress?: string | null,
): Promise<AppSettings> {
  const settings = await prisma.$transaction(async (tx) => {
    const updated = await tx.appSettings.upsert({
      where: { id: "singleton" },
      update: {
        businessName: input.businessName.trim(),
        receiptHeader: input.receiptHeader?.trim() || "",
        receiptFooter: input.receiptFooter?.trim() || "",
        updatedById: adminId,
      },
      create: {
        id: "singleton",
        businessName: input.businessName.trim(),
        receiptHeader: input.receiptHeader?.trim() || "",
        receiptFooter: input.receiptFooter?.trim() || "",
        updatedById: adminId,
      },
    });
    await writeAudit(tx, {
      actorId: adminId,
      action: "SETTINGS_UPDATED",
      entityType: "AppSettings",
      entityId: "singleton",
      summary: `Business settings updated (${updated.businessName})`,
      ipAddress,
    });
    return updated;
  });
  return settings;
}

export async function updateProfile(
  input: z.infer<typeof profileSchema>,
  adminId: string,
  ipAddress?: string | null,
) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing && existing.id !== adminId) throw new ServiceError("That email address is already in use.");

  await prisma.$transaction(async (tx) => {
    await tx.admin.update({
      where: { id: adminId },
      data: { name: input.name.trim(), email },
    });
    await writeAudit(tx, {
      actorId: adminId,
      action: "PROFILE_UPDATED",
      entityType: "Admin",
      entityId: adminId,
      summary: `Administrator profile updated (${input.name.trim()}, ${email})`,
      ipAddress,
    });
  });
}

export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string | null,
) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw new ServiceError("Administrator not found.");
  const valid = await verifyPassword(admin.passwordHash, currentPassword);
  if (!valid) throw new ServiceError("Current password is incorrect.");
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.admin.update({ where: { id: adminId }, data: { passwordHash } });
    await writeAudit(tx, {
      actorId: adminId,
      action: "PASSWORD_CHANGED",
      entityType: "Admin",
      entityId: adminId,
      summary: "Administrator password changed",
      ipAddress,
    });
  });
}

export async function getRecentAuditLogs(limit = 25) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true } } },
  });
}
