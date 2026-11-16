import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export async function writeAudit(
  client: Prisma.TransactionClient | typeof prisma,
  input: AuditInput,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
