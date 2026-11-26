import { LOAN_CATEGORY_LABELS } from "@/lib/constants";

export function normalizeMobile(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, "");
  let national = digits;
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return national;
}

export function normalizeWhatsAppNumber(mobile: string): string | null {
  const national = normalizeMobile(mobile);
  if (!national) return null;
  return `91${national}`;
}

export function buildWhatsAppUrl(mobile: string, message: string): string | null {
  const number = normalizeWhatsAppNumber(mobile);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildTrackingWhatsAppMessage(trackingUrl: string): string {
  return `Hello! You can check your loan repayment status and payment history using this link: ${trackingUrl}`;
}

export interface PaymentMessageInput {
  businessName: string;
  customerName: string;
  loanReference: string;
  category?: string;
  receiptNumber: string;
  amount: string;
  principalAmount?: string | null;
  interestAmount?: string | null;
  paymentDate: string;
  totalPaid: string;
  remainingBalance: string;
  outstandingPrincipal?: string | null;
  pendingInterest?: string | null;
  nextDueAmount?: string | null;
  nextDueDate?: string | null;
}

export function buildPaymentWhatsAppMessage(input: PaymentMessageInput): string {
  const categoryLabel = input.category ? LOAN_CATEGORY_LABELS[input.category] ?? input.category : "Loan";
  const isVatti = input.category === "MONTHLY_VATTI" || input.category === "WEEKLY_RUN_VATI";

  const lines = [
    `*${input.businessName}* — Payment receipt`,
    `Dear ${input.customerName},`,
    `We have recorded your manual payment for ${categoryLabel} account *${input.loanReference}*.`,
    ``,
    `Receipt: ${input.receiptNumber}`,
    `Payment date: ${input.paymentDate}`,
    `Amount received: ${input.amount}`,
  ];

  if (isVatti && (input.principalAmount || input.interestAmount)) {
    lines.push(
      `Breakdown: Principal ${input.principalAmount ?? "₹0.00"} | Interest ${input.interestAmount ?? "₹0.00"}`,
      `Outstanding principal: ${input.outstandingPrincipal ?? "—"}`,
      `Pending interest: ${input.pendingInterest ?? "—"}`,
    );
  }

  lines.push(
    `Total paid to date: ${input.totalPaid}`,
    `Current remaining balance: ${input.remainingBalance}`,
  );

  if (input.nextDueAmount && input.nextDueDate) {
    lines.push(`Next due: ${input.nextDueAmount} on ${input.nextDueDate}`);
  } else if (input.remainingBalance === "₹0.00" || input.remainingBalance === "0.00") {
    lines.push(`The loan account is fully settled. Thank you.`);
  }

  lines.push(
    ``,
    `This is a manually recorded payment receipt. The detailed PDF receipt is attached/shared separately.`,
  );
  return lines.join("\n");
}

export interface StatementMessageInput {
  businessName: string;
  customerName: string;
  loanReference: string;
  category?: string;
  totalRepayment?: string;
  totalPaid: string;
  remainingBalance: string;
  outstandingPrincipal?: string | null;
  pendingInterest?: string | null;
  nextDueAmount?: string | null;
  nextDueDate?: string | null;
  loanStatus: string;
}

export function buildStatementWhatsAppMessage(input: StatementMessageInput): string {
  const categoryLabel = input.category ? LOAN_CATEGORY_LABELS[input.category] ?? input.category : "Loan";
  const isVatti = input.category === "MONTHLY_VATTI" || input.category === "WEEKLY_RUN_VATI";

  const lines = [
    `*${input.businessName}* — Account statement`,
    `Dear ${input.customerName},`,
    `Here is the latest statement for your ${categoryLabel} account *${input.loanReference}*.`,
    ``,
    `Account status: ${input.loanStatus}`,
  ];

  if (isVatti) {
    if (input.outstandingPrincipal) lines.push(`Outstanding principal: ${input.outstandingPrincipal}`);
    if (input.pendingInterest) lines.push(`Pending interest: ${input.pendingInterest}`);
  } else if (input.totalRepayment) {
    lines.push(`Contractual total repayment: ${input.totalRepayment}`);
  }

  lines.push(
    `Total collected to date: ${input.totalPaid}`,
    `Total remaining balance: ${input.remainingBalance}`,
  );

  if (input.nextDueAmount && input.nextDueDate) {
    lines.push(`Next due: ${input.nextDueAmount} on ${input.nextDueDate}`);
  }

  lines.push(
    ``,
    `The full PDF account statement is available and shared separately by the lender.`,
  );
  return lines.join("\n");
}
