import { describe, expect, it } from "vitest";
import { loanInputSchema } from "@/lib/validation";

describe("loanInputSchema", () => {
  it("reports empty amounts without throwing during schedule validation", () => {
    const result = loanInputSchema.safeParse({
      customerId: "",
      nominalAmount: "",
      deductionAmount: "",
      totalRepayment: "",
      installmentAmount: "",
      frequency: "MONTHLY",
      startDate: "",
      firstDueDate: "",
      disbursementDate: "",
      installmentCount: "",
      notes: "",
      terms: "",
      activate: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("nominalAmount");
      expect(fields).toContain("totalRepayment");
      expect(fields).toContain("installmentAmount");
    }
  });
});
