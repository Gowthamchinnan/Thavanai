import { D, money, sumMoney, type MoneyInput } from "@/lib/money";
import { prisma } from "@/lib/db";

export function outstandingFrom(totalRepayment: MoneyInput, collected: MoneyInput): string {
  const result = D(totalRepayment).minus(D(collected));
  return money(result.lt(0) ? 0 : result);
}

export async function collectedByLoan(loanIds: string[]): Promise<Map<string, string>> {
  if (!loanIds.length) return new Map();
  const groups = await prisma.payment.groupBy({
    by: ["loanId"],
    where: { loanId: { in: loanIds }, status: "POSTED" },
    _sum: { amount: true },
  });
  const map = new Map<string, string>();
  for (const group of groups) map.set(group.loanId, money(group._sum.amount ?? 0));
  return map;
}

export function loanBalances(loan: { totalRepayment: MoneyInput }, collected: MoneyInput) {
  const totalRepayment = money(loan.totalRepayment);
  const collectedAmount = money(collected);
  return {
    totalRepayment,
    collected: collectedAmount,
    outstanding: outstandingFrom(totalRepayment, collectedAmount),
  };
}

export function totalCollected(payments: { amount: MoneyInput; status?: string }[]): string {
  const posted = payments.filter((p) => (p.status ?? "POSTED") === "POSTED");
  return money(sumMoney(posted.map((p) => p.amount)));
}
