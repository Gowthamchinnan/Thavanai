import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createCustomer } from "@/lib/services/customers";
import { createLoan, getLoanDetail } from "@/lib/services/loans";
import { recordPayment, voidPayment, getPaymentDetail, listPayments } from "@/lib/services/payments";
import { listCollections } from "@/lib/services/collections";
import {
  getCustomerTrackingStatus,
  getOrCreateCustomerTrackingLink,
  getPublicCustomerTracking,
  regenerateCustomerTrackingLink,
  revokeCustomerTrackingLink,
} from "@/lib/services/tracking";
import { getIndiaTodayISO, indiaDateTimeInputNow } from "@/lib/dates";

const databaseUrl = process.env.DATABASE_URL ?? "";

let adminId = "";
let customerId = "";
let loanId = "";
let firstPaymentId = "";

async function resetDatabase() {
  await prisma.customerTrackingLink.deleteMany();
  await prisma.interestAllocation.deleteMany();
  await prisma.interestPeriod.deleteMany();
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
        nominalAmount: "3000.00",
        deductionAmount: "400.00",
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

  it("rejects mismatched Thavanai repayment amount on server creation", async () => {
    const today = getIndiaTodayISO();
    await expect(
      createLoan(
        {
          customerId,
          category: "THAVANAI",
          nominalAmount: "10000.00",
          deductionAmount: "0.00",
          totalRepayment: "12000.00",
          installmentAmount: "1000.00",
          frequency: "WEEKLY",
          startDate: today,
          firstDueDate: today,
          installmentCount: "12",
          activate: true,
        },
        adminId,
      ),
    ).rejects.toThrow("Repayment amount must equal the loan amount.");
  });

  it("manages permanent customer tracking links, updates with payments, isolates customers, and revokes/regenerates", async () => {
    const initialStatus = await getCustomerTrackingStatus(customerId);
    expect(initialStatus.status).toBe("NONE");

    const generated = await getOrCreateCustomerTrackingLink(customerId, adminId);
    expect(generated.status).toBe("ACTIVE");
    expect(generated.trackingPath).toMatch(/^\/track\/[A-Za-z0-9_-]+$/);

    // Calling getOrCreate again must reuse the same link without creating a duplicate
    const reused = await getOrCreateCustomerTrackingLink(customerId, adminId);
    expect(reused.trackingPath).toBe(generated.trackingPath);

    const token1 = generated.trackingPath!.replace("/track/", "");

    // Create a second customer + Vatti loan to verify strict isolation
    const otherCustomer = await createCustomer(
      {
        fullName: "Second Isolated Customer",
        mobile: "9876500001",
        alternateMobile: "",
        address: "Secret Address",
        notes: "Private Admin Note",
      },
      adminId,
    );
    const today = getIndiaTodayISO();
    const vattiLoan = await createLoan(
      {
        customerId,
        category: "MONTHLY_VATTI",
        nominalAmount: "20000.00",
        deductionAmount: "0.00",
        interestRate: "3.0",
        interestType: "FLAT_SIMPLE",
        startDate: today,
        activate: true,
      },
      adminId,
    );
    await recordPayment(
      {
        loanId: vattiLoan.id,
        amount: "600.00",
        interestAmount: "600.00",
        principalAmount: "0.00",
        paidAt: indiaDateTimeInputNow(),
        mode: "CASH",
        idempotencyKey: "tracking-vatti-pay-001",
      },
      adminId,
    );

    const tracked = await getPublicCustomerTracking(token1);
    expect(tracked.ok).toBe(true);
    if (tracked.ok) {
      expect(tracked.customerName).toBe("Integration Customer");
      expect(tracked.loans.length).toBe(2);
      const trackedVatti = tracked.loans.find((l) => l.category === "MONTHLY_VATTI");
      expect(trackedVatti).toBeDefined();
      if (trackedVatti && trackedVatti.category === "MONTHLY_VATTI") {
        expect(trackedVatti.totalInterestCollected).toBe("600.00");
        expect(trackedVatti.principalRepaid).toBe("0.00");
        expect(trackedVatti.remainingPrincipal).toBe("20000.00");
      }
      expect(JSON.stringify(tracked)).not.toContain(otherCustomer.fullName);
      expect(JSON.stringify(tracked)).not.toContain("Private Admin Note");
    }

    // Revoke link
    const revoked = await revokeCustomerTrackingLink(customerId, adminId);
    expect(revoked.status).toBe("REVOKED");
    const afterRevoke = await getPublicCustomerTracking(token1);
    expect(afterRevoke.ok).toBe(false);

    // Regenerate link -> new token works, old token remains invalid
    const regenerated = await regenerateCustomerTrackingLink(customerId, adminId);
    expect(regenerated.status).toBe("ACTIVE");
    const token2 = regenerated.trackingPath!.replace("/track/", "");
    expect(token2).not.toBe(token1);
    expect((await getPublicCustomerTracking(token1)).ok).toBe(false);
    expect((await getPublicCustomerTracking(token2)).ok).toBe(true);
  });
});
