import { describe, expect, it } from "vitest";
import { buildSchedule, resolveInstallmentCount } from "@/lib/schedule";

describe("buildSchedule", () => {
  it("derives the installment count and makes the final installment absorb the remainder", () => {
    const result = buildSchedule({
      firstDueDate: "2026-01-05",
      frequency: "WEEKLY",
      installmentAmount: "3000.00",
      totalRepayment: "10000.00",
    });

    expect(result.ok).toBe(true);
    expect(result.installmentCount).toBe(4);
    expect(result.rows.map((row) => row.scheduledAmount)).toEqual(["3000.00", "3000.00", "3000.00", "1000.00"]);
    expect(result.rows.map((row) => row.dueDate)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
    expect(result.finalInstallmentAmount).toBe("1000.00");
    expect(result.scheduleTotal).toBe("10000.00");
  });

  it("supports an explicit installment count with a smaller final amount", () => {
    const result = buildSchedule({
      firstDueDate: "2026-02-01",
      frequency: "DAILY",
      installmentAmount: "300.00",
      totalRepayment: "1000.00",
      installmentCount: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.scheduledAmount)).toEqual(["300.00", "300.00", "300.00", "100.00"]);
  });

  it("rejects a count whose final installment would be zero or negative", () => {
    const result = buildSchedule({
      firstDueDate: "2026-02-01",
      frequency: "DAILY",
      installmentAmount: "300.00",
      totalRepayment: "1000.00",
      installmentCount: 5,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("final installment");
  });

  it("clamps monthly due dates to the last day of shorter months", () => {
    const result = buildSchedule({
      firstDueDate: "2026-01-31",
      frequency: "MONTHLY",
      installmentAmount: "100.00",
      totalRepayment: "400.00",
    });

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("reports an error for a non-positive installment amount", () => {
    const resolved = resolveInstallmentCount("1000.00", "0");
    expect(resolved.count).toBe(0);
    expect(resolved.errors.length).toBeGreaterThan(0);
  });
});
