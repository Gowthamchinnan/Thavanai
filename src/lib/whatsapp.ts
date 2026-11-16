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

export interface PaymentMessageInput {
  businessName: string;
  customerName: string;
  loanReference: string;
  receiptNumber: string;
  amount: string;
  paymentDate: string;
  totalPaid: string;
  remainingBalance: string;
  nextDueAmount?: string | null;
  nextDueDate?: string | null;
}

export function buildPaymentWhatsAppMessage(input: PaymentMessageInput): string {
  const lines = [
    `*${input.businessName}* — Payment receipt`,
    `Dear ${input.customerName},`,
    `We have recorded your payment for loan ${input.loanReference}.`,
    ``,
    `Receipt: ${input.receiptNumber}`,
    `Payment date: ${input.paymentDate}`,
    `Amount received: ${input.amount}`,
    `Total paid to date: ${input.totalPaid}`,
    `Remaining contractual balance: ${input.remainingBalance}`,
  ];
  if (input.nextDueAmount && input.nextDueDate) {
    lines.push(`Next installment: ${input.nextDueAmount} due ${input.nextDueDate}`);
  } else if (input.remainingBalance === "₹0.00") {
    lines.push(`The loan is fully repaid. Thank you.`);
  }
  lines.push(
    ``,
    `This is a manually recorded payment receipt. The PDF receipt is shared separately by the lender.`,
  );
  return lines.join("\n");
}

export interface StatementMessageInput {
  businessName: string;
  customerName: string;
  loanReference: string;
  totalRepayment: string;
  totalPaid: string;
  remainingBalance: string;
  nextDueAmount?: string | null;
  nextDueDate?: string | null;
  loanStatus: string;
}

export function buildStatementWhatsAppMessage(input: StatementMessageInput): string {
  const lines = [
    `*${input.businessName}* — Loan statement`,
    `Dear ${input.customerName},`,
    `Here is your current statement for loan ${input.loanReference}.`,
    ``,
    `Loan status: ${input.loanStatus}`,
    `Contractual total repayment: ${input.totalRepayment}`,
    `Total paid to date: ${input.totalPaid}`,
    `Remaining balance: ${input.remainingBalance}`,
  ];
  if (input.nextDueAmount && input.nextDueDate) {
    lines.push(`Next installment: ${input.nextDueAmount} due ${input.nextDueDate}`);
  }
  lines.push(
    ``,
    `The detailed PDF statement is shared separately by the lender. No payment is collected automatically.`,
  );
  return lines.join("\n");
}
