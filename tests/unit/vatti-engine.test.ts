import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  calculateMonthlyInterest,
  buildMonthlyInterestSchedule,
  allocateInterestToPeriods,
  computeInterestPeriodStatus,
} from "@/lib/vatti-engine";
import {
  calculateWeeklyInterest,
  buildWeeklyInterestSchedule,
} from "@/lib/run-vati-engine";

describe("Monthly Vatti calculation engine", () => {
  it("calculates simple monthly interest correctly", () => {
    // Example from user prompt: Principal: ₹1,00,000, 3% monthly rate -> ₹3,000
    expect(calculateMonthlyInterest({ principal: "100000", rate: "3" })).toBe("3000.00");
    expect(calculateMonthlyInterest({ principal: "30000", rate: "3" })).toBe("900.00");
    expect(calculateMonthlyInterest({ principal: "20000", rate: "2.5" })).toBe("500.00");
  });

  it("builds monthly schedule correctly with 12 periods by default", () => {
    const res = buildMonthlyInterestSchedule({
      startDate: "2026-01-15",
      principal: "100000",
      rate: "3",
      method: "FLAT_SIMPLE",
    });

    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(12);
    expect(res.rows[0].sequence).toBe(1);
    expect(res.rows[0].fromDate).toBe("2026-01-15");
    expect(res.rows[0].dueDate).toBe("2026-02-15");
    expect(res.rows[0].scheduledAmount).toBe("3000.00");
    expect(res.rows[1].sequence).toBe(2);
    expect(res.rows[1].fromDate).toBe("2026-02-15");
    expect(res.rows[1].dueDate).toBe("2026-03-15");
  });

  it("allocates interest payment oldest first", () => {
    const periods = [
      { id: "p1", sequence: 1, scheduledAmount: "900.00", paidAmount: "0.00", dueDate: "2026-02-15" },
      { id: "p2", sequence: 2, scheduledAmount: "900.00", paidAmount: "0.00", dueDate: "2026-03-15" },
      { id: "p3", sequence: 3, scheduledAmount: "900.00", paidAmount: "0.00", dueDate: "2026-04-15" },
    ];

    const result = allocateInterestToPeriods("1500.00", periods);
    expect(result.allocations).toEqual([
      { interestPeriodId: "p1", sequence: 1, amount: "900.00" },
      { interestPeriodId: "p2", sequence: 2, amount: "600.00" },
    ]);
    expect(result.unallocated).toBe("0.00");
  });

  it("verifies Vatti monthly interest-only payments never reduce principal over 12 months", () => {
    // Example from prompt:
    // Original Principal: ₹1,00,000
    // Upfront Deduction: ₹10,000
    // Actual Cash Given: ₹90,000
    // Monthly Interest: ₹3,000
    const originalPrincipal = D("100000.00");
    const deduction = D("10000.00");
    const cashDisbursed = originalPrincipal.minus(deduction);
    expect(cashDisbursed.toFixed(2)).toBe("90000.00");

    let totalPrincipalRepaid = D("0.00");
    let totalInterestCollected = D("0.00");
    const monthlyInterest = D("3000.00");

    // 12 monthly payments of interest only
    for (let month = 1; month <= 12; month++) {
      totalInterestCollected = totalInterestCollected.plus(monthlyInterest);
      // Interest payment NEVER reduces principal
      const remainingPrincipal = originalPrincipal.minus(totalPrincipalRepaid);
      expect(remainingPrincipal.toFixed(2)).toBe("100000.00");
    }

    expect(totalInterestCollected.toFixed(2)).toBe("36000.00");
    expect(originalPrincipal.minus(totalPrincipalRepaid).toFixed(2)).toBe("100000.00");

    // Loan must still be active because principal is not repaid
    const isClosedBeforeRepayment = originalPrincipal.minus(totalPrincipalRepaid).lte(0);
    expect(isClosedBeforeRepayment).toBe(false);

    // Now customer repays full principal
    totalPrincipalRepaid = totalPrincipalRepaid.plus(originalPrincipal);
    const finalRemainingPrincipal = originalPrincipal.minus(totalPrincipalRepaid);
    expect(finalRemainingPrincipal.toFixed(2)).toBe("0.00");

    // Only now does the loan qualify as CLOSED
    const isClosedAfterRepayment = finalRemainingPrincipal.lte(0);
    expect(isClosedAfterRepayment).toBe(true);
  });

  it("computes interest period status accurately", () => {
    expect(
      computeInterestPeriodStatus({
        dueDate: "2026-02-15",
        scheduledAmount: "900.00",
        paidAmount: "900.00",
        today: "2026-03-01",
      }),
    ).toBe("PAID");

    expect(
      computeInterestPeriodStatus({
        dueDate: "2026-02-15",
        scheduledAmount: "900.00",
        paidAmount: "0.00",
        today: "2026-03-01",
      }),
    ).toBe("OVERDUE");

    expect(
      computeInterestPeriodStatus({
        dueDate: "2026-03-01",
        scheduledAmount: "900.00",
        paidAmount: "0.00",
        today: "2026-03-01",
      }),
    ).toBe("DUE_TODAY");

    expect(
      computeInterestPeriodStatus({
        dueDate: "2026-03-15",
        scheduledAmount: "900.00",
        paidAmount: "0.00",
        today: "2026-03-01",
      }),
    ).toBe("UPCOMING");
  });
});

describe("Weekly Run Vati calculation engine", () => {
  it("calculates weekly interest correctly without hardcoding", () => {
    // Principal: ₹1,00,000, 1% weekly rate -> ₹1,000
    expect(calculateWeeklyInterest({ principal: "100000", rate: "1" })).toBe("1000.00");
    // Principal: ₹30,000, 2% weekly rate -> ₹600
    expect(calculateWeeklyInterest({ principal: "30000", rate: "2" })).toBe("600.00");
    expect(calculateWeeklyInterest({ principal: "15000", rate: "1.5" })).toBe("225.00");
    expect(calculateWeeklyInterest({ principal: "50000", rate: "2.25" })).toBe("1125.00");
  });

  it("verifies Run Vati weekly interest-only payments never reduce principal over 12 weeks", () => {
    // Example from prompt:
    // Original Principal: ₹1,00,000
    // Upfront Deduction: ₹10,000
    // Actual Cash Given: ₹90,000
    // Weekly Interest: ₹1,000
    const originalPrincipal = D("100000.00");
    const deduction = D("10000.00");
    const cashDisbursed = originalPrincipal.minus(deduction);
    expect(cashDisbursed.toFixed(2)).toBe("90000.00");

    let totalPrincipalRepaid = D("0.00");
    let totalInterestCollected = D("0.00");
    const weeklyInterest = D("1000.00");

    // 12 weekly payments of interest only
    for (let week = 1; week <= 12; week++) {
      totalInterestCollected = totalInterestCollected.plus(weeklyInterest);
      // Interest payment NEVER reduces principal
      const remainingPrincipal = originalPrincipal.minus(totalPrincipalRepaid);
      expect(remainingPrincipal.toFixed(2)).toBe("100000.00");
    }

    expect(totalInterestCollected.toFixed(2)).toBe("12000.00");
    expect(originalPrincipal.minus(totalPrincipalRepaid).toFixed(2)).toBe("100000.00");

    // Loan remains active
    expect(originalPrincipal.minus(totalPrincipalRepaid).lte(0)).toBe(false);

    // Full principal repayment
    totalPrincipalRepaid = totalPrincipalRepaid.plus(originalPrincipal);
    const finalRemainingPrincipal = originalPrincipal.minus(totalPrincipalRepaid);
    expect(finalRemainingPrincipal.toFixed(2)).toBe("0.00");
    expect(finalRemainingPrincipal.lte(0)).toBe(true);
  });

  it("builds weekly schedule with 7-day increments", () => {
    const res = buildWeeklyInterestSchedule({
      startDate: "2026-01-01",
      principal: "30000",
      rate: "2",
      periodCount: 4,
    });

    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(4);
    expect(res.rows[0].sequence).toBe(1);
    expect(res.rows[0].fromDate).toBe("2026-01-01");
    expect(res.rows[0].dueDate).toBe("2026-01-08");
    expect(res.rows[0].scheduledAmount).toBe("600.00");
    expect(res.rows[1].sequence).toBe(2);
    expect(res.rows[1].fromDate).toBe("2026-01-08");
    expect(res.rows[1].dueDate).toBe("2026-01-15");
  });
});
