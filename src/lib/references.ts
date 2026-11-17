export function formatCustomerCode(seq: number): string {
  return `TM-C${String(seq).padStart(4, "0")}`;
}

export function formatLoanReference(seq: number, year: number, category: string = "THAVANAI"): string {
  const prefix =
    category === "MONTHLY_VATTI"
      ? "TM-V"
      : category === "WEEKLY_RUN_VATI"
        ? "TM-RV"
        : "TM-L";
  return `${prefix}${year}-${String(seq).padStart(5, "0")}`;
}

export function formatReceiptNumber(seq: number, year: number): string {
  return `TM-R${year}-${String(seq).padStart(5, "0")}`;
}

export function temporaryReference(prefix: string): string {
  return `${prefix}-PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
