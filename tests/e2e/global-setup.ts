import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

export const E2E_EMAIL = "e2e@thavanai.test";
export const E2E_PASSWORD = "e2e-password1";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is required.");

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.paymentReversal.deleteMany();
    await prisma.paymentAllocation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.installment.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.loginAttempt.deleteMany();
    await prisma.admin.deleteMany();

    await prisma.admin.create({
      data: {
        email: E2E_EMAIL,
        name: "E2E Administrator",
        passwordHash: await hash(E2E_PASSWORD, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
          outputLen: 32,
        }),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
