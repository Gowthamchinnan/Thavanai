"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Loader2, ReceiptText, Wallet, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { D, formatINR, money } from "@/lib/money";
import { paymentInputSchema, type PaymentInput } from "@/lib/validation";
import { recordPaymentAction } from "@/app/actions/payments";
import { LOAN_CATEGORY_LABELS } from "@/lib/constants";

function safeMoney(value: string): Decimal | null {
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(value.trim())) return null;
  try {
    return D(value);
  } catch {
    return null;
  }
}

export function PaymentForm({
  loanId,
  loanReference,
  customerName,
  category = "THAVANAI",
  outstanding,
  installmentAmount,
  principalOutstanding = "0.00",
  interestPending = "0.00",
  nextDueDate,
  nowInput,
  loanStatus,
}: {
  loanId: string;
  loanReference: string;
  customerName: string;
  category?: string;
  outstanding: string;
  installmentAmount: string;
  principalOutstanding?: string;
  interestPending?: string;
  nextDueDate: string | null;
  nowInput: string;
  loanStatus: string;
}) {
  const router = useRouter();
  const isVatti = category === "MONTHLY_VATTI" || category === "WEEKLY_RUN_VATI";
  const submittingRef = React.useRef(false);

  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentInputSchema) as Resolver<PaymentInput>,
    defaultValues: {
      loanId,
      amount: "",
      interestAmount: "0",
      principalAmount: "0",
      paidAt: nowInput,
      mode: "CASH",
      notes: "",
      idempotencyKey: "",
    },
  });

  const { register, handleSubmit, setError, watch, setValue, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  const amountStr = watch("amount") || "";
  const principalStr = watch("principalAmount") || "0";
  const interestStr = watch("interestAmount") || "0";

  const amount = safeMoney(amountStr);
  const balance = safeMoney(outstanding) ?? D(0);
  const pBalance = safeMoney(principalOutstanding) ?? D(0);
  const iBalance = safeMoney(interestPending) ?? D(0);

  const after = amount && amount.lte(balance) ? balance.minus(amount) : null;
  const active = loanStatus === "ACTIVE";
  const [lastReceipt, setLastReceipt] = React.useState<{ paymentId: string; receiptNumber: string; outstandingAfter: string } | null>(null);

  React.useEffect(() => {
    setValue("idempotencyKey", crypto.randomUUID());
  }, [setValue]);

  // Synchronize interest and principal breakdown for Vatti
  function handleVattiChange(type: "interest" | "principal", val: string) {
    if (type === "interest") {
      setValue("interestAmount", val);
      const p = safeMoney(principalStr) ?? D(0);
      const i = safeMoney(val) ?? D(0);
      setValue("amount", money(p.plus(i)), { shouldValidate: true });
    } else {
      setValue("principalAmount", val);
      const p = safeMoney(val) ?? D(0);
      const i = safeMoney(interestStr) ?? D(0);
      setValue("amount", money(p.plus(i)), { shouldValidate: true });
    }
  }

  function fillInterestOnly() {
    setValue("interestAmount", interestPending);
    setValue("principalAmount", "0.00");
    setValue("amount", interestPending, { shouldValidate: true });
  }

  function fillPrincipalOnly() {
    setValue("interestAmount", "0.00");
    setValue("principalAmount", principalOutstanding);
    setValue("amount", principalOutstanding, { shouldValidate: true });
  }

  function fillFullSettlement() {
    setValue("interestAmount", interestPending);
    setValue("principalAmount", principalOutstanding);
    const total = pBalance.plus(iBalance);
    setValue("amount", money(total), { shouldValidate: true });
  }

  async function onSubmit(values: PaymentInput) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const parsed = safeMoney(values.amount);
      if (!parsed) {
        setError("amount", { message: "Enter a valid amount." });
        return;
      }
      if (parsed.gt(balance)) {
        setError("amount", { message: `Amount cannot exceed the total balance of ${formatINR(outstanding)}.` });
        return;
      }
      if (parsed.lte(0)) {
        setError("amount", { message: "Payment amount must be greater than zero." });
        return;
      }

      const result = await recordPaymentAction(values);
      if (!result.ok) {
        toast.error(result.message);
        if (result.fieldErrors?.amount) setError("amount", { message: result.fieldErrors.amount });
        return;
      }
      toast.success(result.message);
      setLastReceipt({ paymentId: result.paymentId, receiptNumber: result.receiptNumber, outstandingAfter: result.outstandingAfter });
      reset({
        loanId,
        amount: "",
        interestAmount: "0",
        principalAmount: "0",
        paidAt: values.paidAt,
        mode: values.mode,
        notes: "",
        idempotencyKey: crypto.randomUUID(),
      });
      router.refresh();
    } finally {
      submittingRef.current = false;
    }
  }

  const onInvalid = (fieldErrors: Record<string, { message?: string }>) => {
    const firstKey = Object.keys(fieldErrors)[0];
    const message = fieldErrors[firstKey]?.message || "Please enter a valid payment amount.";
    toast.error(message);
  };

  if (!active) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Payments can only be recorded for an active loan. This loan is currently{" "}
        <span className="font-medium text-foreground">{loanStatus.toLowerCase().replace("_", " ")}</span>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lastReceipt ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Payment recorded · {lastReceipt.receiptNumber}
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            Remaining balance is now {formatINR(lastReceipt.outstandingAfter)}. The receipt is available to download or share.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/payments/${lastReceipt.paymentId}`}>
                <ReceiptText className="h-4 w-4" /> View receipt
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/payments/${lastReceipt.paymentId}/receipt`} target="_blank" rel="noreferrer">
                Download PDF
              </a>
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLastReceipt(null)}>
              Record another
            </Button>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
        <input type="hidden" {...register("loanId")} />
        <input type="hidden" {...register("idempotencyKey")} />

        {isVatti ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding Principal</p>
              <p className="num mt-1 text-base font-semibold">{formatINR(principalOutstanding)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending Interest</p>
              <p className="num mt-1 text-base font-semibold text-amber-600 dark:text-amber-400">{formatINR(interestPending)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Received</p>
              <p className="num mt-1 text-base font-semibold">{amount ? formatINR(amount) : "—"}</p>
            </div>
            <div className="rounded-lg bg-accent/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Balance After</p>
              <p className="num mt-1 text-base font-semibold text-primary">{after ? formatINR(after) : "—"}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance before</p>
              <p className="num mt-1 text-base font-semibold">{formatINR(outstanding)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment</p>
              <p className="num mt-1 text-base font-semibold">{amount ? formatINR(amount) : "—"}</p>
            </div>
            <div className="rounded-lg bg-accent/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance after</p>
              <p className="num mt-1 text-base font-semibold text-primary">{after ? formatINR(after) : "—"}</p>
            </div>
          </div>
        )}

        {isVatti && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
            <span className="font-medium text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Payment options:
            </span>
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1 hover:bg-muted font-medium"
              onClick={fillInterestOnly}
            >
              Interest only ({formatINR(interestPending)})
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1 hover:bg-muted font-medium"
              onClick={fillPrincipalOnly}
            >
              Principal only ({formatINR(principalOutstanding)})
            </button>
            <button
              type="button"
              className="rounded-md border border-primary/40 bg-primary/10 text-primary px-2.5 py-1 hover:bg-primary/20 font-semibold"
              onClick={fillFullSettlement}
            >
              Full loan settlement ({formatINR(outstanding)})
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {isVatti ? (
            <>
              <FormField label="Interest amount (INR)" htmlFor="interestAmount" error={errors.interestAmount?.message}>
                <Input
                  id="interestAmount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={interestStr}
                  onChange={(e) => handleVattiChange("interest", e.target.value)}
                />
              </FormField>
              <FormField label="Principal amount (INR)" htmlFor="principalAmount" error={errors.principalAmount?.message}>
                <Input
                  id="principalAmount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={principalStr}
                  onChange={(e) => handleVattiChange("principal", e.target.value)}
                />
              </FormField>
              <FormField label="Total received (INR)" htmlFor="amount" error={errors.amount?.message} required className="sm:col-span-2">
                <Input id="amount" inputMode="decimal" placeholder="e.g. 1500.00" autoComplete="off" {...register("amount")} />
              </FormField>
            </>
          ) : (
            <FormField label="Amount received (INR)" htmlFor="amount" error={errors.amount?.message} required className="sm:col-span-2">
              <Input id="amount" inputMode="decimal" placeholder="e.g. 1500.00" autoComplete="off" {...register("amount")} />
            </FormField>
          )}

          <FormField label="Payment date & time (Asia/Kolkata)" htmlFor="paidAt" error={errors.paidAt?.message} required>
            <Input id="paidAt" type="datetime-local" {...register("paidAt")} />
          </FormField>
          <FormField label="Payment mode" htmlFor="mode" error={errors.mode?.message}>
            <SelectNative id="mode" {...register("mode")}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer (recorded offline)</option>
              <option value="UPI">UPI (recorded offline)</option>
              <option value="OTHER">Other</option>
            </SelectNative>
          </FormField>
          <FormField label="Notes" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
            <Input id="notes" placeholder="Optional notes for this manual receipt" {...register("notes")} />
          </FormField>
        </div>

        {!isVatti && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> Quick fill:
            </span>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
              onClick={() => setValue("amount", installmentAmount, { shouldValidate: true })}
            >
              Next installment {formatINR(installmentAmount)}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
              onClick={() => setValue("amount", outstanding, { shouldValidate: true })}
            >
              Full balance {formatINR(outstanding)}
            </button>
          </div>
        )}

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {isVatti
            ? `Allocates interest towards accrued cycles and reduces principal balance. Overpayment beyond total balance of ${formatINR(outstanding)} is rejected.`
            : `Payments are allocated to the oldest outstanding installments first. Overpayment above the outstanding balance is rejected. ${nextDueDate ? `Next due date: ${nextDueDate}.` : "No further installments remain."}`}
        </p>

        <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !active}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isSubmitting ? "Recording payment…" : `Record payment for ${customerName}`}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {LOAN_CATEGORY_LABELS[category] ?? category} Account {loanReference}. This is manual offline bookkeeping only; no online payment is processed.
        </p>
      </form>
    </div>
  );
}
