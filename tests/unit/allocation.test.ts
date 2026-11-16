import { describe, expect, it } from "vitest";
import { allocateToInstallments } from "@/lib/allocation";

const installments = [
  { id: "c", sequence: 3, dueDate: "2026-03-01", scheduledAmount: "1000.00", paidAmount: "0.00" },
  { id: "a", sequence: 1, dueDate: "2026-01-01", scheduledAmount: "1000.00", paidAmount: "400.00" },
  { id: "b", sequence: 2, dueDate: "2026-02-01", scheduledAmount: "1000.00", paidAmount: "0.00" },
];

describe("allocateToInstallments", () => {
  it("allocates oldest-first and respects partial payments", () => {
    const result = allocateToInstallments("2000.00", installments);
    expect(result.allocations).toEqual([
      { installmentId: "a", sequence: 1, amount: "600.00" },
      { installmentId: "b", sequence: 2, amount: "1000.00" },
      { installmentId: "c", sequence: 3, amount: "400.00" },
    ]);
    expect(result.allocated).toBe("2000.00");
    expect(result.unallocated).toBe("0.00");
  });

  it("leaves overpayments unallocated", () => {
    const result = allocateToInstallments("4000.00", installments);
    expect(result.allocated).toBe("2600.00");
    expect(result.unallocated).toBe("1400.00");
    expect(result.allocations.length).toBe(3);
  });

  it("returns nothing when there is no outstanding balance", () => {
    const result = allocateToInstallments("500.00", [
      { id: "x", sequence: 1, dueDate: "2026-01-01", scheduledAmount: "100.00", paidAmount: "100.00" },
    ]);
    expect(result.allocations).toEqual([]);
    expect(result.unallocated).toBe("500.00");
  });
});
