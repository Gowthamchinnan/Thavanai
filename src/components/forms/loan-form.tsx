"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input, SelectNative, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loanInputSchema, type LoanInput } from "@/lib/validation";
import { buildSchedule } from "@/lib/schedule";
import { D, formatINR } from "@/lib/money";
import { formatDateISO, type Frequency } from "@/lib/dates";
import { createLoanAction } from "@/app/actions/loans";

interface CustomerOption {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
}

function safeMoney(value: string): Decimal | null {
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(value.trim())) return null;
  try {
    return D(value);
  } catch {
    return null;
  }
}

export function LoanForm({
  customers,
  today,
  initialCustomerId,
}: {
  customers: CustomerOption[];
  today: string;
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const form = useForm<LoanInput>({
    resolver: zodResolver(loanInputSchema) as Resolver<LoanInput>,
    defaultValues: {
      customerId: initialCustomerId ?? (customers.length === 1 ? customers[0].id : ""),
      nominalAmount: "",
      deductionAmount: "0",
      totalRepayment: "",
      installmentAmount: "",
      frequency: "WEEKLY",
      startDate: today,
      firstDueDate: today,
      disbursementDate: "",
      installmentCount: "",
      notes: "",
      terms: "",
      activate: true,
    },
  });
  const { register, handleSubmit, setError, watch, formState, setValue } = form;
  const { errors, isSubmitting } = formState;

  const nominalAmount = watch("nominalAmount");
  const deductionAmount = watch("deductionAmount");
  const totalRepayment = watch("totalRepayment");
  const installmentAmount = watch("installmentAmount");
  const frequency = watch("frequency");
  const firstDueDate = watch("firstDueDate");
  const installmentCount = watch("installmentCount");

  const nominal = safeMoney(nominalAmount);
  const deduction = safeMoney(deductionAmount);
  const total = safeMoney(totalRepayment);
  const installment = safeMoney(installmentAmount);
  const net = nominal && deduction && deduction.lt(nominal) ? nominal.minus(deduction) : null;
  const margin = total && net ? total.minus(net) : null;

  const parsedCount = React.useMemo(() => {
    if (!installmentCount || !installmentCount.trim()) return null;
    const value = Number(installmentCount);
    return Number.isInteger(value) && value > 0 ? value : NaN;
  }, [installmentCount]);

  const schedule = React.useMemo(() => {
    if (!total || !installment || !firstDueDate) return null;
    const count = parsedCount === null ? null : Number.isNaN(parsedCount) ? null : parsedCount;
    return buildSchedule({
      firstDueDate,
      frequency: frequency as Frequency,
      installmentAmount: installmentAmount,
      totalRepayment: totalRepayment,
      installmentCount: count,
    });
  }, [total, installment, firstDueDate, frequency, installmentAmount, totalRepayment, parsedCount]);

  const preview = schedule?.rows ?? [];
  const hasCollapsedPreview = preview.length > 8;
  const previewHead = hasCollapsedPreview ? preview.slice(0, 6) : preview;
  const previewTail = hasCollapsedPreview ? preview.slice(-2) : [];

  async function onSubmit(values: LoanInput) {
    const result = await createLoanAction(values);
    if (!result.ok) {
      toast.error(result.message);
      if (result.fieldErrors) {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof LoanInput, { message });
        }
      }
      return;
    }
    toast.success(result.message ?? "Loan created.");
    router.push(`/loans/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              Customer & loan basics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField label="Customer" htmlFor="customerId" error={errors.customerId?.message} required className="sm:col-span-2">
              <SelectNative id="customerId" {...register("customerId")}>
                <option value="">Select a customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName} · {customer.mobile} ({customer.code})
                  </option>
                ))}
              </SelectNative>
              {customers.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  No customers yet.{" "}
                  <Link href="/customers/new" className="underline">
                    Create a customer first
                  </Link>
                  .
                </p>
              ) : null}
            </FormField>
            <FormField label="Frequency" htmlFor="frequency" error={errors.frequency?.message} required>
              <SelectNative id="frequency" {...register("frequency")}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </SelectNative>
            </FormField>
            <FormField label="Total number of installments" htmlFor="installmentCount" error={errors.installmentCount?.message} hint="Leave blank to derive the count from repayment ÷ installment amount.">
              <Input id="installmentCount" inputMode="numeric" placeholder="e.g. 20" {...register("installmentCount")} />
            </FormField>
            <FormField label="Loan start date" htmlFor="startDate" error={errors.startDate?.message} required>
              <Input id="startDate" type="date" {...register("startDate")} />
            </FormField>
            <FormField label="First due date" htmlFor="firstDueDate" error={errors.firstDueDate?.message} required>
              <Input id="firstDueDate" type="date" {...register("firstDueDate")} />
            </FormField>
            <FormField label="Actual disbursement date" htmlFor="disbursementDate" error={errors.disbursementDate?.message} hint="Optional. Defaults to the start date.">
              <Input id="disbursementDate" type="date" {...register("disbursementDate")} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              Money & repayment terms
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField label="Nominal loan amount (INR)" htmlFor="nominalAmount" error={errors.nominalAmount?.message} required>
              <Input id="nominalAmount" inputMode="decimal" placeholder="30000.00" {...register("nominalAmount")} />
            </FormField>
            <FormField
              label="Upfront deduction (INR)"
              htmlFor="deductionAmount"
              error={errors.deductionAmount?.message}
              hint="Must be less than the nominal amount. Zero is allowed."
              required
            >
              <Input id="deductionAmount" inputMode="decimal" placeholder="4500.00" {...register("deductionAmount")} />
            </FormField>
            <FormField label="Net cash disbursed" htmlFor="netDisbursed" hint="Calculated as nominal amount minus deduction. Not editable.">
              <Input id="netDisbursed" value={net ? formatINR(net) : ""} placeholder="—" readOnly className="bg-muted/50 num" tabIndex={-1} />
            </FormField>
            <FormField
              label="Contractual total repayment (INR)"
              htmlFor="totalRepayment"
              error={errors.totalRepayment?.message}
              hint="Entered explicitly. It is not assumed to equal the nominal amount."
              required
            >
              <Input id="totalRepayment" inputMode="decimal" placeholder="30000.00" {...register("totalRepayment")} />
            </FormField>
            <FormField label="Installment amount (INR)" htmlFor="installmentAmount" error={errors.installmentAmount?.message} required>
              <Input id="installmentAmount" inputMode="decimal" placeholder="1500.00" {...register("installmentAmount")} />
            </FormField>
            <FormField label="Expected gross margin" hint="Contractual repayment minus net cash disbursed. Not guaranteed profit.">
              <Input
                value={margin ? formatINR(margin) : ""}
                placeholder="—"
                readOnly
                className={margin && margin.lt(0) ? "bg-rose-50 text-rose-700 num dark:bg-rose-950/30 dark:text-rose-300" : "bg-muted/50 num"}
                tabIndex={-1}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              Notes, terms & activation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormField label="Contractual terms" htmlFor="terms" error={errors.terms?.message} hint="Record disclosures or terms applicable to this arrangement. The application does not guarantee legal compliance.">
              <Textarea id="terms" rows={3} placeholder="Repayment terms, disclosures, agreed conditions…" {...register("terms")} />
            </FormField>
            <FormField label="Internal notes" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} placeholder="Optional notes visible to the administrator" {...register("notes")} />
            </FormField>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" {...register("activate")} />
              <span>
                <span className="block text-sm font-medium">Activate immediately</span>
                <span className="block text-xs text-muted-foreground">
                  Generates the full installment schedule. Leave unchecked to save a draft and activate later.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Schedule preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installments</p>
                <p className="num mt-1 text-lg font-semibold">{schedule?.ok ? schedule.installmentCount : "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Final installment</p>
                <p className="num mt-1 text-lg font-semibold">{schedule?.ok ? formatINR(schedule.finalInstallmentAmount) : "—"}</p>
              </div>
            </div>

            {schedule && !schedule.ok ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" /> Schedule needs attention
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {schedule.errors.slice(0, 3).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {schedule?.ok ? (
              <>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">Due date</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewHead.map((row) => (
                        <tr key={row.sequence} className="border-t border-border/70">
                          <td className="px-2 py-1.5 text-muted-foreground">{row.sequence}</td>
                          <td className="px-2 py-1.5">{formatDateISO(row.dueDate)}</td>
                          <td className="num px-2 py-1.5 text-right">{formatINR(row.scheduledAmount)}</td>
                        </tr>
                      ))}
                      {hasCollapsedPreview ? (
                        <tr className="border-t border-border/70">
                          <td colSpan={3} className="px-2 py-1.5 text-center text-[11px] text-muted-foreground">
                            … {preview.length - previewHead.length - previewTail.length} more installments …
                          </td>
                        </tr>
                      ) : null}
                      {previewTail.map((row) => (
                        <tr key={row.sequence} className="border-t border-border/70">
                          <td className="px-2 py-1.5 text-muted-foreground">{row.sequence}</td>
                          <td className="px-2 py-1.5">{formatDateISO(row.dueDate)}</td>
                          <td className="num px-2 py-1.5 text-right">{formatINR(row.scheduledAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Schedule totals {formatINR(schedule.scheduleTotal)}. The final installment absorbs any remainder.
                </p>
              </>
            ) : null}

            {schedule?.ok && parsedCount === null ? (
              <p className="text-[11px] text-muted-foreground">
                Installment count derived automatically. Enter a count to constrain it.
              </p>
            ) : null}

            {margin && margin.lt(0) ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                Contractual repayment is below net cash disbursed. This loan has a negative expected margin.
              </div>
            ) : null}

            {net ? (
              <div className="rounded-lg border border-primary/20 bg-accent/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash handed to customer</p>
                <p className="num mt-1 text-xl font-semibold text-primary">{formatINR(net)}</p>
                <button
                  type="button"
                  className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline"
                  onClick={() => setValue("deductionAmount", "0", { shouldValidate: true })}
                >
                  Reset deduction to zero
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || customers.length === 0}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSubmitting ? "Creating loan…" : "Create loan"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Loan terms are immutable after activation. Cancel a draft instead of deleting it.
        </p>
      </div>
    </form>
  );
}
