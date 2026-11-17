import "dotenv/config";
import { prisma } from "../src/lib/db";
import { buildSchedule } from "../src/lib/schedule";
import { computeInstallmentStatus } from "../src/lib/installments";
import { getIndiaTodayISO, isoToUtcMidnight } from "../src/lib/dates";
import { hashPassword } from "../src/lib/password";
import { APP_NAME } from "../src/lib/constants";

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessName: process.env.BUSINESS_NAME?.trim() || APP_NAME,
      currency: "INR",
      timezone: "Asia/Kolkata",
      receiptHeader: "Thank you for your payment.",
      receiptFooter: "This is a manually recorded payment receipt. No automatic payment was collected.",
    },
  });

  if (process.env.SEED_DEMO_DATA !== "true") {
    console.log("[seed] Settings ensured. Set SEED_DEMO_DATA=true to insert demo records.");
    return;
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@thavanai.local").trim().toLowerCase();
  let admin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const password = process.env.ADMIN_PASSWORD ?? "thavanai-demo1";
    admin = await prisma.admin.create({
      data: {
        email: adminEmail,
        name: process.env.ADMIN_NAME?.trim() || "Demo Administrator",
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`[seed] Created demo administrator ${adminEmail}. Set ADMIN_PASSWORD to control the password.`);
  }

  const mobile = "9876543210";
  let customer = await prisma.customer.findFirst({ where: { mobile } });
  if (!customer) {
    const seq = await prisma.customer.count();
    customer = await prisma.customer.create({
      data: {
        code: `TM-C${String(seq + 1).padStart(4, "0")}`,
        fullName: "Demo Customer",
        mobile,
        address: "12 Market Road, Chennai",
        notes: "Demo record created by prisma/seed.ts",
      },
    });
  }

  const existingLoan = await prisma.loan.findFirst({ where: { customerId: customer.id } });
  if (existingLoan) {
    console.log("[seed] Demo loan already exists. Nothing further to do.");
    return;
  }

  const today = getIndiaTodayISO();
  const schedule = buildSchedule({
    firstDueDate: today,
    frequency: "WEEKLY",
    installmentAmount: "500.00",
    totalRepayment: "6000.00",
  });
  if (!schedule.ok) throw new Error(schedule.errors.join(" "));

  const loan = await prisma.$transaction(async (tx) => {
    const created = await tx.loan.create({
      data: {
        reference: `TM-L${today.slice(0, 4)}-PREVIEW`,
        customerId: customer.id,
        nominalAmount: "5000.00",
        deductionAmount: "500.00",
        netDisbursed: "4500.00",
        totalRepayment: "6000.00",
        installmentAmount: "500.00",
        installmentCount: schedule.installmentCount,
        frequency: "WEEKLY",
        startDate: isoToUtcMidnight(today),
        firstDueDate: isoToUtcMidnight(today),
        disbursementDate: isoToUtcMidnight(today),
        status: "ACTIVE",
        notes: "Demo loan seeded for local evaluation.",
        createdById: admin.id,
        activatedAt: new Date(),
      },
    });
    await tx.loan.update({
      where: { id: created.id },
      data: { reference: `TM-L${today.slice(0, 4)}-${String(created.seq).padStart(5, "0")}` },
    });
    await tx.installment.createMany({
      data: schedule.rows.map((row) => ({
        loanId: created.id,
        sequence: row.sequence,
        dueDate: isoToUtcMidnight(row.dueDate),
        scheduledAmount: row.scheduledAmount,
        paidAmount: "0.00",
        status: computeInstallmentStatus({
          dueDate: row.dueDate,
          scheduledAmount: row.scheduledAmount,
          paidAmount: "0",
          today,
        }),
      })),
    });
    return created;
  });

  console.log(`[seed] Demo data ready: customer ${customer.fullName}, loan ${loan.reference}.`);
}

main()
  .catch((error) => {
    console.error("[seed] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
