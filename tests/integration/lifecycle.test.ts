import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createCustomer } from "@/lib/services/customers";
import { createLoan, getLoanDetail } from "@/lib/services/loans";
import { recordPayment, voidPayment, getPaymentDetail, listPayments } from "@/lib/services/payments";
import { listCollections } from "@/lib/services/collections";
import { getIndiaTodayISO, indiaDateTimeInputNow } from "@/lib/dates";

const databaseUrl = process.env.DATABASE_URL ?? "";

let adminId = "";
let customerId = "";
let loanId = "";
let firstPaymentId = "";

async function resetDatabase() {
  await prisma.paymentReversal.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.installment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.appSettings.deleteMany();
}

beforeAll(async () => {
  if (!databaseUrl.includes("_test")) {
    throw new Error("Integration tests require TEST_DATABASE_URL pointing at a *_test database.");
  }
  await resetDatabase();
  const admin = await prisma.admin.create({
    data: {
      email: "integration@thavanai.test",
      name: "Integration Admin",
      passwordHash: await hashPassword("integration-pass1"),
    },
  });
  adminId = admin.id;
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("loan and collection lifecycle", () => {
  it("creates a customer and an active loan with a full schedule", async () => {
    const customer = await createCustomer(
      {
        fullName: "Integration Customer",
        mobile: "9876543210",
        alternateMobile: "",
        address: "1 Test Street",
        notes: "",
      },
      adminId,
    );
    customerId = customer.id;
    expect(customer.code).toMatch(/^TM-C\d{4}$/);

    const today = getIndiaTodayISO();
    const loan = await createLoan(
      {
        customerId,
        nominalAmount: "2600.00",
        deductionAmount: "100.00",
        totalRepayment: "3000.00",
        installmentAmount: "1000.00",
        frequency: "WEEKLY",
        startDate: today,
        firstDueDate: today,
        disbursementDate: today,
        installmentCount: "3",
        notes: "",
        terms: "",
        activate: true,
      },
      adminId,
    );
    loanId = loan.id;

    const detail = await getLoanDetail(loanId);
    expect(detail).not.toBeNull();
    expect(detail?.installments).toHaveLength(3);
    expect(detail?.stats.outstanding).toBe("3000.00");
    expect(detail?.loan.reference).toMatch(/^TM-L\d{4}-\d{5}$/);
    expect(detail?.stats.nextDueSequence).toBe(1);
  });

  it("records a payment oldest-first and is idempotent", async () => {
    const input = {
      loanId,
      amount: "1000.00",
      paidAt: indiaDateTimeInputNow(),
      mode: "CASH" as const,
      notes: "First collection",
      idempotencyKey: "integration-key-0001",
    };
    const first = await recordPayment(input, adminId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    firstPaymentId = first.paymentId;
    expect(first.outstandingAfter).toBe("2000.00");

    const duplicate = await recordPayment(input, adminId);
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) {
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.paymentId).toBe(first.paymentId);
    }

    const detail = await getLoanDetail(loanId);
    expect(detail?.stats.collected).toBe("1000.00");
    expect(detail?.installments[0].paidAmount.toString()).toBe("1000");

    const payments = await listPayments({ q: "TM-R", page: 1 });
    expect(payments.total).toBe(1);
    expect(payments.summary.postedAmount).toBe("1000.00");
  });

  it("rejects an overpayment", async () => {
    const result = await recordPayment(
      {
        loanId,
        amount: "2500.00",
        paidAt: indiaDateTimeInputNow(),
        mode: "UPI",
        notes: "",
        idempotencyKey: "integration-key-0002",
      },
      adminId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("exceeds");
  });

  it("completes the loan when the final balance is collected", async () => {
    const result = await recordPayment(
      {
        loanId,
        amount: "2000.00",
        paidAt: indiaDateTimeInputNow(),
        mode: "BANK_TRANSFER",
        notes: "Final settlement",
        idempotencyKey: "integration-key-0003",
      },
      adminId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.completed).toBe(true);

    const detail = await getLoanDetail(loanId);
    expect(detail?.loan.status).toBe("COMPLETED");
    expect(detail?.stats.outstanding).toBe("0.00");
  });

  it("voids a payment and reopens the loan", async () => {
    const voided = await voidPayment(firstPaymentId, "Amount entered incorrectly", adminId);
    expect(voided.ok).toBe(true);

    const payment = await getPaymentDetail(firstPaymentId);
    expect(payment?.payment.status).toBe("VOIDED");
    expect(payment?.payment.reversal?.reason).toBe("Amount entered incorrectly");

    const detail = await getLoanDetail(loanId);
    expect(detail?.loan.status).toBe("ACTIVE");
    expect(detail?.stats.outstanding).toBe("1000.00");
    expect(detail?.installments[0].paidAmount.toString()).toBe("0");

    const today = await listCollections({ scope: "today", page: 1 });
    expect(today.items.some((item) => item.loan.id === loanId)).toBe(true);
  });
});
