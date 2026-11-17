import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import { buildSchedule } from "@/lib/schedule";
import {
  calculateMonthlyInterest,
  buildMonthlyInterestSchedule,
  allocateInterestToPeriods,
} from "@/lib/vatti-engine";
import {
  calculateWeeklyInterest,
  buildWeeklyInterestSchedule,
} from "@/lib/run-vati-engine";
import { buildWorkbookBuffer, type SheetSpec } from "@/lib/excel";

describe("Multi-Category Portfolio Calculations", () => {
  it("calculates independent balances for a customer with Thavanai, Vatti, and Run Vati", () => {
    // 1. Sivaprabhu takes Thavanai loan of ₹30,000 with ₹4,500 deduction and ₹30,000 total repayment (20 × ₹1,500 weekly)
    const thavanaiSchedule = buildSchedule({
      firstDueDate: "2026-11-20",
      frequency: "WEEKLY",
      installmentAmount: "1500",
      totalRepayment: "30000",
      installmentCount: 20,
    });
    expect(thavanaiSchedule.ok).toBe(true);
    expect(thavanaiSchedule.installmentCount).toBe(20);
    expect(thavanaiSchedule.scheduleTotal).toBe("30000.00");

    // Sivaprabhu pays 2 installments = ₹3,000
    const thavanaiCollected = D("3000.00");
    const thavanaiOutstanding = D("30000.00").minus(thavanaiCollected); // ₹27,000
    expect(thavanaiOutstanding.toFixed(2)).toBe("27000.00");

    // 2. Sivaprabhu takes Monthly Vatti loan of ₹20,000 @ 3% / month
    const vattiMonthlyRate = "3.0";
    const vattiInterest = calculateMonthlyInterest({
      principal: "20000.00",
      rate: vattiMonthlyRate,
      method: "FLAT_SIMPLE",
    });
    // 20000 * 0.03 = 600
    expect(vattiInterest).toBe("600.00");

    const vattiSchedule = buildMonthlyInterestSchedule({
      startDate: "2026-11-01",
      principal: "20000.00",
      rate: vattiMonthlyRate,
      method: "FLAT_SIMPLE",
      collectionDay: 1,
      periodCount: 6,
    });
    expect(vattiSchedule.ok).toBe(true);
    expect(vattiSchedule.rows.length).toBe(6);
    expect(vattiSchedule.rows[0].scheduledAmount).toBe("600.00");

    // Monthly Vatti payment: Customer pays ₹600 interest + ₹5,000 principal
    const vattiPrincipalPaid = D("5000.00");
    const vattiInterestPaid = D("600.00");
    const vattiPrincipalRemaining = D("20000.00").minus(vattiPrincipalPaid); // ₹15,000
    const vattiAccruedInterest = D("600.00"); // 1 cycle accrued
    const vattiPendingInterest = vattiAccruedInterest.minus(vattiInterestPaid); // ₹0.00
    const vattiOutstanding = vattiPrincipalRemaining.plus(vattiPendingInterest); // ₹15,000.00
    expect(vattiOutstanding.toFixed(2)).toBe("15000.00");

    // 3. Sivaprabhu takes Weekly Run Vati loan of ₹15,000 @ 2.5% / week (admin configured)
    const rvWeeklyRate = "2.5";
    const rvInterest = calculateWeeklyInterest({
      principal: "15000.00",
      rate: rvWeeklyRate,
      method: "REDUCING_BALANCE",
    });
    // 15000 * 0.025 = 375
    expect(rvInterest).toBe("375.00");

    const rvSchedule = buildWeeklyInterestSchedule({
      startDate: "2026-11-01",
      principal: "15000.00",
      rate: rvWeeklyRate,
      method: "REDUCING_BALANCE",
      collectionDay: 1,
      periodCount: 8,
    });
    expect(rvSchedule.ok).toBe(true);
    expect(rvSchedule.rows.length).toBe(8);
    expect(rvSchedule.rows[0].scheduledAmount).toBe("375.00");

    // Customer pays ₹200 towards ₹375 weekly interest (partial interest payment)
    const rvInterestPaid = D("200.00");
    const rvPrincipalPaid = D("0.00");
    const rvPrincipalRemaining = D("15000.00").minus(rvPrincipalPaid); // ₹15,000
    const rvAccruedInterest = D("375.00");
    const rvPendingInterest = rvAccruedInterest.minus(rvInterestPaid); // ₹175.00
    const rvOutstanding = rvPrincipalRemaining.plus(rvPendingInterest); // ₹15,175.00
    expect(rvOutstanding.toFixed(2)).toBe("15175.00");

    // 4. Consolidated Customer Portfolio Balance:
    // Thavanai remaining: ₹27,000
    // Monthly Vatti outstanding (prin + unpaid int): ₹15,000
    // Weekly Run Vati outstanding (prin + unpaid int): ₹15,175
    // Total Portfolio Outstanding = ₹27,000 + ₹15,000 + ₹15,175 = ₹57,175.00
    const totalPortfolioOutstanding = thavanaiOutstanding.plus(vattiOutstanding).plus(rvOutstanding);
    expect(totalPortfolioOutstanding.toFixed(2)).toBe("57175.00");

    // Total Disbursed = ₹30,000 (Thavanai) + ₹20,000 (Vatti) + ₹15,000 (Run Vati) = ₹65,000.00
    const totalDisbursed = D("30000").plus(D("20000")).plus(D("15000"));
    expect(totalDisbursed.toFixed(2)).toBe("65000.00");

    // Total Collected = ₹3,000 (Thav) + ₹5,600 (Vatti prin+int) + ₹200 (RV int) = ₹8,800.00
    const totalCollected = thavanaiCollected.plus(vattiPrincipalPaid).plus(vattiInterestPaid).plus(rvInterestPaid);
    expect(totalCollected.toFixed(2)).toBe("8800.00");

    // Total Outstanding Principal = ₹27,000 + ₹15,000 + ₹15,000 = ₹57,000.00
    const totalOutstandingPrincipal = thavanaiOutstanding.plus(vattiPrincipalRemaining).plus(rvPrincipalRemaining);
    expect(totalOutstandingPrincipal.toFixed(2)).toBe("57000.00");

    // Total Outstanding Interest = ₹0 (Vatti) + ₹175 (RV) = ₹175.00
    const totalOutstandingInterest = vattiPendingInterest.plus(rvPendingInterest);
    expect(totalOutstandingInterest.toFixed(2)).toBe("175.00");
  });

  it("handles interest period allocation correctly (oldest unpaid cycle first)", () => {
    const periods = [
      { id: "p1", sequence: 1, dueDate: "2026-10-01", scheduledAmount: "500.00", paidAmount: "200.00" }, // 300 remaining
      { id: "p2", sequence: 2, dueDate: "2026-11-01", scheduledAmount: "500.00", paidAmount: "0.00" },   // 500 remaining
      { id: "p3", sequence: 3, dueDate: "2026-12-01", scheduledAmount: "500.00", paidAmount: "0.00" },   // 500 remaining
    ];

    // Customer pays ₹600 interest:
    // Should allocate ₹300 to p1 (clearing it), and ₹300 to p2 (partial)
    const alloc = allocateInterestToPeriods("600.00", periods);
    expect(alloc.unallocated).toBe("0.00");
    expect(alloc.allocations.length).toBe(2);
    expect(alloc.allocations[0].interestPeriodId).toBe("p1");
    expect(alloc.allocations[0].amount).toBe("300.00");
    expect(alloc.allocations[1].interestPeriodId).toBe("p2");
    expect(alloc.allocations[1].amount).toBe("300.00");
  });

  it("builds the full 6-sheet Excel report workbook without errors", async () => {
    const sheets: SheetSpec[] = [
      {
        name: "Overall Summary",
        title: "PORTFOLIO OVERALL SUMMARY",
        subtitle: "Generated 2026-11-18 · Unique Customers: 5 · Active Loans: 10",
        columns: [
          { header: "Metric", key: "metric", width: 30 },
          { header: "Value", key: "value", width: 25 },
        ],
        rows: [
          { metric: "Total Cash Disbursed", value: "₹1,50,000.00" },
          { metric: "Total Amount Collected", value: "₹45,000.00" },
          { metric: "Total Outstanding Balance", value: "₹1,05,000.00" },
        ],
      },
      {
        name: "Thavanai Loans",
        title: "THAVANAI INSTALLMENT LOANS",
        columns: [
          { header: "Reference", key: "ref", width: 15 },
          { header: "Customer", key: "cust", width: 25 },
          { header: "Nominal", key: "nom", width: 15, money: true },
          { header: "Repayment", key: "rep", width: 15, money: true },
          { header: "Collected", key: "col", width: 15, money: true },
          { header: "Outstanding", key: "out", width: 15, money: true },
        ],
        rows: [
          { ref: "TM-L001", cust: "Sivaprabhu", nom: "30000.00", rep: "30000.00", col: "3000.00", out: "27000.00" },
        ],
      },
      {
        name: "Vatti Loans",
        title: "VATTI LOANS",
        columns: [
          { header: "Reference", key: "ref", width: 15 },
          { header: "Customer", key: "cust", width: 25 },
          { header: "Principal", key: "prin", width: 15, money: true },
          { header: "Rate %", key: "rate", width: 10 },
          { header: "Prin Outstanding", key: "pout", width: 15, money: true },
          { header: "Pending Interest", key: "intout", width: 15, money: true },
        ],
        rows: [
          { ref: "TM-V001", cust: "Sivaprabhu", prin: "20000.00", rate: "3.00%", pout: "15000.00", intout: "0.00" },
        ],
      },
      {
        name: "Run Vati Loans",
        title: "WEEKLY RUN VATI LOANS",
        columns: [
          { header: "Reference", key: "ref", width: 15 },
          { header: "Customer", key: "cust", width: 25 },
          { header: "Principal", key: "prin", width: 15, money: true },
          { header: "Weekly Rate %", key: "rate", width: 15 },
          { header: "Prin Outstanding", key: "pout", width: 15, money: true },
          { header: "Pending Interest", key: "intout", width: 15, money: true },
        ],
        rows: [
          { ref: "TM-RV001", cust: "Sivaprabhu", prin: "15000.00", rate: "2.50%", pout: "15000.00", intout: "175.00" },
        ],
      },
      {
        name: "Payment Collections",
        title: "PAYMENT COLLECTIONS LEDGER",
        columns: [
          { header: "Receipt #", key: "rcpt", width: 15 },
          { header: "Category", key: "cat", width: 15 },
          { header: "Customer", key: "cust", width: 25 },
          { header: "Amount", key: "amt", width: 15, money: true },
          { header: "Principal", key: "prin", width: 15, money: true },
          { header: "Interest", key: "int", width: 15, money: true },
        ],
        rows: [
          { rcpt: "TM-R2026-0001", cat: "Thavanai", cust: "Sivaprabhu", amt: "1500.00", prin: "1500.00", int: "0.00" },
          { rcpt: "TM-R2026-0002", cat: "Vatti", cust: "Sivaprabhu", amt: "5600.00", prin: "5000.00", int: "600.00" },
        ],
      },
      {
        name: "Outstanding Balances",
        title: "CUSTOMER OUTSTANDING BALANCES",
        columns: [
          { header: "Customer", key: "cust", width: 25 },
          { header: "Thavanai", key: "thav", width: 15, money: true },
          { header: "Vatti Prin", key: "vprin", width: 15, money: true },
          { header: "Vatti Int", key: "vint", width: 15, money: true },
          { header: "Run Vati Prin", key: "rvprin", width: 15, money: true },
          { header: "Run Vati Int", key: "rvint", width: 15, money: true },
          { header: "Total Outstanding", key: "tot", width: 20, money: true },
        ],
        rows: [
          { cust: "Sivaprabhu", thav: "27000.00", vprin: "15000.00", vint: "0.00", rvprin: "15000.00", rvint: "175.00", tot: "57175.00" },
        ],
      },
    ];

    const buffer = await buildWorkbookBuffer(sheets, {
      businessName: "Siva Thul Finance",
      generatedAt: new Date(),
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
