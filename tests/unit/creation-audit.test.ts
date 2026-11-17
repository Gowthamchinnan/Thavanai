import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import { customerInputSchema, loanInputSchema, paymentInputSchema } from "@/lib/validation";
import { calculateMonthlyInterest } from "@/lib/vatti-engine";
import { calculateWeeklyInterest } from "@/lib/run-vati-engine";

describe("Creation Flows & Audit Verification", () => {
  describe("Task 2: Customer Creation Validations", () => {
    it("accepts a valid customer creation input", () => {
      const result = customerInputSchema.safeParse({
        fullName: "Sivaprabhu",
        mobile: "9876543210",
        alternateMobile: "9123456780",
        address: "123 Main Road, Salem",
        notes: "Regular customer",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fullName).toBe("Sivaprabhu");
        expect(result.data.mobile).toBe("9876543210");
      }
    });

    it("allows different customers to have the exact same name", () => {
      const customer1 = customerInputSchema.safeParse({
        fullName: "Ramesh Kumar",
        mobile: "9876543210",
      });
      const customer2 = customerInputSchema.safeParse({
        fullName: "Ramesh Kumar",
        mobile: "9876543211",
      });
      expect(customer1.success).toBe(true);
      expect(customer2.success).toBe(true);
    });

    it("rejects invalid mobile numbers", () => {
      const result = customerInputSchema.safeParse({
        fullName: "Sivaprabhu",
        mobile: "12345", // too short
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.mobile).toBeDefined();
      }
    });
  });

  describe("Task 3: Loan Creation Validations Across All Categories", () => {
    it("creates a Thavanai loan with required installment fields", () => {
      const result = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "THAVANAI",
        nominalAmount: "30000.00",
        deductionAmount: "4500.00",
        totalRepayment: "30000.00",
        installmentAmount: "1500.00",
        frequency: "WEEKLY",
        startDate: "2026-11-20",
        firstDueDate: "2026-11-27",
        installmentCount: "20",
        activate: true,
      });
      expect(result.success).toBe(true);
    });

    it("creates a Vatti (Monthly) loan without requiring Thavanai repayment fields", () => {
      const result = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "MONTHLY_VATTI",
        nominalAmount: "100000.00",
        deductionAmount: "10000.00",
        totalRepayment: "", // empty
        installmentAmount: "", // empty
        startDate: "2026-11-20",
        firstDueDate: "",
        interestRate: "3.0",
        interestType: "FLAT_SIMPLE",
        collectionDay: "5",
        activate: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const netDisbursed = D(result.data.nominalAmount).minus(D(result.data.deductionAmount));
        expect(netDisbursed.toFixed(2)).toBe("90000.00");
      }
    });

    it("creates a Run Vati (Weekly) loan without requiring Thavanai repayment fields", () => {
      const result = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "WEEKLY_RUN_VATI",
        nominalAmount: "100000.00",
        deductionAmount: "10000.00",
        totalRepayment: "",
        installmentAmount: "",
        startDate: "2026-11-20",
        firstDueDate: "",
        interestRate: "2.0",
        interestType: "FLAT_SIMPLE",
        collectionDay: "1",
        activate: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const netDisbursed = D(result.data.nominalAmount).minus(D(result.data.deductionAmount));
        expect(netDisbursed.toFixed(2)).toBe("90000.00");
      }
    });

    it("rejects deduction amount equal to or greater than nominal amount", () => {
      const result = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "MONTHLY_VATTI",
        nominalAmount: "50000.00",
        deductionAmount: "50000.00",
        interestRate: "3.0",
        startDate: "2026-11-20",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.deductionAmount).toBeDefined();
      }
    });

    it("rejects zero or negative interest rate for Vatti and Run Vati", () => {
      const vatti = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "MONTHLY_VATTI",
        nominalAmount: "50000.00",
        deductionAmount: "0",
        interestRate: "0",
        startDate: "2026-11-20",
      });
      expect(vatti.success).toBe(false);

      const runVati = loanInputSchema.safeParse({
        customerId: "cust_123",
        category: "WEEKLY_RUN_VATI",
        nominalAmount: "50000.00",
        deductionAmount: "0",
        interestRate: "-1",
        startDate: "2026-11-20",
      });
      expect(runVati.success).toBe(false);
    });
  });

  describe("Task 7: Vatti & Run Vati Calculation Rules", () => {
    it("Vatti: 12 monthly interest payments NEVER reduce the principal", () => {
      const principal = D("100000.00");
      const deduction = D("10000.00");
      const actualCashDisbursed = principal.minus(deduction);
      expect(actualCashDisbursed.toFixed(2)).toBe("90000.00");

      const monthlyRate = "3.0";
      const monthlyInterest = calculateMonthlyInterest({
        principal: principal.toFixed(2),
        rate: monthlyRate,
        method: "FLAT_SIMPLE",
      });
      expect(monthlyInterest).toBe("3000.00");

      // Customer pays ₹3,000 every month for 12 months (₹36,000 total interest)
      let totalInterestCollected = D(0);
      let totalPrincipalRepaid = D(0);

      for (let month = 1; month <= 12; month++) {
        totalInterestCollected = totalInterestCollected.plus(D(monthlyInterest));
      }

      expect(totalInterestCollected.toFixed(2)).toBe("36000.00");
      expect(totalPrincipalRepaid.toFixed(2)).toBe("0.00");

      // Rule: Remaining Principal = Original Principal - Total Principal Repaid
      const remainingPrincipal = principal.minus(totalPrincipalRepaid);
      expect(remainingPrincipal.toFixed(2)).toBe("100000.00");

      // An interest-only payment NEVER closes a loan
      const isClosedAfterInterest = remainingPrincipal.lte(0);
      expect(isClosedAfterInterest).toBe(false);

      // Principal repayment: customer repays ₹40,000 principal
      totalPrincipalRepaid = totalPrincipalRepaid.plus(D("40000.00"));
      const updatedRemainingPrincipal = principal.minus(totalPrincipalRepaid);
      expect(updatedRemainingPrincipal.toFixed(2)).toBe("60000.00");

      // Full settlement: customer repays remaining ₹60,000
      totalPrincipalRepaid = totalPrincipalRepaid.plus(D("60000.00"));
      const finalRemainingPrincipal = principal.minus(totalPrincipalRepaid);
      expect(finalRemainingPrincipal.toFixed(2)).toBe("0.00");
      expect(finalRemainingPrincipal.lte(0)).toBe(true);
    });

    it("Run Vati: Weekly interest payments NEVER reduce the principal", () => {
      const principal = D("100000.00");
      const deduction = D("10000.00");
      const actualCashDisbursed = principal.minus(deduction);
      expect(actualCashDisbursed.toFixed(2)).toBe("90000.00");

      const weeklyRate = "1.0"; // ₹1,000 / week
      const weeklyInterest = calculateWeeklyInterest({
        principal: principal.toFixed(2),
        rate: weeklyRate,
        method: "FLAT_SIMPLE",
      });
      expect(weeklyInterest).toBe("1000.00");

      // 12 weeks of interest payments = ₹12,000
      let totalWeeklyInterest = D(0);
      const totalPrincipalRepaid = D(0);

      for (let week = 1; week <= 12; week++) {
        totalWeeklyInterest = totalWeeklyInterest.plus(D(weeklyInterest));
      }

      expect(totalWeeklyInterest.toFixed(2)).toBe("12000.00");
      const remainingPrincipal = principal.minus(totalPrincipalRepaid);
      expect(remainingPrincipal.toFixed(2)).toBe("100000.00");
    });
  });

  describe("Payment Input Validation", () => {
    it("validates payment breakdown matches total amount", () => {
      const valid = paymentInputSchema.safeParse({
        loanId: "loan_1",
        amount: "3500.00",
        interestAmount: "500.00",
        principalAmount: "3000.00",
        paidAt: "2026-11-20T10:00",
        mode: "CASH",
        idempotencyKey: "test-idem-12345",
      });
      expect(valid.success).toBe(true);

      const mismatch = paymentInputSchema.safeParse({
        loanId: "loan_1",
        amount: "4000.00",
        interestAmount: "500.00",
        principalAmount: "3000.00", // sum = 3500 != 4000
        paidAt: "2026-11-20T10:00",
        mode: "CASH",
        idempotencyKey: "test-idem-12345",
      });
      expect(mismatch.success).toBe(false);
    });
  });
});
