import { D, money, sumMoney } from "@/lib/money";

export interface AllocatableInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  scheduledAmount: string;
  paidAmount: string;
}

export interface AllocationResult {
  allocations: { installmentId: string; sequence: number; amount: string }[];
  unallocated: string;
  allocated: string;
}

/** Allocates a payment to the oldest outstanding installments first. */
export function allocateToInstallments(amount: string, installments: AllocatableInstallment[]): AllocationResult {
  let remaining = D(amount);
  const sorted = [...installments].sort((a, b) => a.sequence - b.sequence);
  const allocations: { installmentId: string; sequence: number; amount: string }[] = [];

  for (const installment of sorted) {
    if (remaining.lte(0)) break;
    const outstanding = D(installment.scheduledAmount).minus(D(installment.paidAmount));
    if (outstanding.lte(0)) continue;
    const portion = remaining.lt(outstanding) ? remaining : outstanding;
    if (portion.lte(0)) continue;
    allocations.push({
      installmentId: installment.id,
      sequence: installment.sequence,
      amount: money(portion),
    });
    remaining = remaining.minus(portion);
  }

  return {
    allocations,
    unallocated: money(remaining.lt(0) ? 0 : remaining),
    allocated: money(sumMoney(allocations.map((a) => a.amount))),
  };
}
