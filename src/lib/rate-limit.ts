import { prisma } from "@/lib/db";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

export async function isLoginRateLimited(email: string, ipAddress: string | null): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const count = await prisma.loginAttempt.count({
    where: {
      createdAt: { gte: since },
      success: false,
      OR: [{ email: email.toLowerCase() }, ...(ipAddress ? [{ ipAddress }] : [])],
    },
  });
  return count >= MAX_FAILURES;
}

export async function recordLoginAttempt(email: string, ipAddress: string | null, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({
    data: { email: email.toLowerCase(), ipAddress, success },
  });
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}
