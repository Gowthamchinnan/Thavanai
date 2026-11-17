"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Coins,
  Loader2,
  Percent,
  ReceiptIndianRupee,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import type Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input, SelectNative, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loanInputSchema, type LoanInput } from "@/lib/validation";
import { buildSchedule } from "@/lib/schedule";
import { calculateMonthlyInterest, buildMonthlyInterestSchedule } from "@/lib/vatti-engine";
import { calculateWeeklyInterest, buildWeeklyInterestSchedule } from "@/lib/run-vati-engine";
import { D, formatINR, money } from "@/lib/money";
import { formatDateISO, type Frequency } from "@/lib/dates";
import { createLoanAction } from "@/app/actions/loans";
import { LOAN_CATEGORY_LABELS, LOAN_CATEGORY_TONES } from "@/lib/constants";

interface CustomerOption {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
}

function safeMoney(value?: string | null): Decimal | null {
  if (!value || !/^\d{1,11}(\.\d{1,2})?$/.test(value.trim())) return null;
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
  initialCategory = "THAVANAI",
  onSuccess,
  onCancel,
  isDialog = false,
}: {
  customers: CustomerOption[];
  today: string;
  initialCustomerId?: string;
  initialCategory?: "THAVANAI" | "MONTHLY_VATTI" | "WEEKLY_RUN_VATI";
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  isDialog?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);

  const form = useForm<LoanInput>({
    resolver: zodResolver(loanInputSchema) as Resolver<LoanInput>,
    defaultValues: {
      customerId: initialCustomerId ?? (customers.length === 1 ? customers[0].id : ""),
      category: initialCategory,
      nominalAmount: "",
      deductionAmount: "0",
      totalRepayment: "",
      installmentAmount: "",
      frequency: "WEEKLY",
      startDate: today,
      firstDueDate: today,
      disbursementDate: "",
      installmentCount: "",
      interestRate: initialCategory === "MONTHLY_VATTI" ? "3.0" : initialCategory === "WEEKLY_RUN_VATI" ? "2.0" : "",
      interestType: "FLAT_SIMPLE",
      collectionDay: "",
      maturityDate: "",
      principalRepaymentArrangement: "",
      unpaidInterestHandling: "PENDING_ACCUMULATION",
      notes: "",
      terms: "",
      activate: true,
    },
  });

  const { register, handleSubmit, setError, watch, formState, setValue } = form;
  const { errors } = formState;

  const category = watch("category");
  const nominalAmount = watch("nominalAmount");
  const deductionAmount = watch("deductionAmount");
  const totalRepayment = watch("totalRepayment");
  const installmentAmount = watch("installmentAmount");
  const frequency = watch("frequency");
  const firstDueDate = watch("firstDueDate");
  const installmentCount = watch("installmentCount");
  const interestRate = watch("interestRate");
  const interestType = watch("interestType");
  const collectionDay = watch("collectionDay");
  const startDate = watch("startDate");
  const maturityDate = watch("maturityDate");

  const nominal = safeMoney(nominalAmount);
  const deduction = safeMoney(deductionAmount);
  const total = safeMoney(totalRepayment);
  const installment = safeMoney(installmentAmount);
  const net = nominal && deduction && deduction.lt(nominal) ? nominal.minus(deduction) : null;
  const margin = total && net ? total.minus(net) : null;

  // Thavanai schedule preview
  const parsedCount = React.useMemo(() => {
    if (!installmentCount || !installmentCount.trim()) return null;
    const value = Number(installmentCount);
    return Number.isInteger(value) && value > 0 ? value : NaN;
  }, [installmentCount]);

  const thavanaiSchedule = React.useMemo(() => {
    if (category !== "THAVANAI" || !total || !installment || !firstDueDate) return null;
    const count = parsedCount === null ? null : Number.isNaN(parsedCount) ? null : parsedCount;
    return buildSchedule({
      firstDueDate,
      frequency: (frequency ?? "WEEKLY") as Frequency,
      installmentAmount: installmentAmount || "0",
      totalRepayment: totalRepayment || "0",
      installmentCount: count,
    });
  }, [category, total, installment, firstDueDate, frequency, installmentAmount, totalRepayment, parsedCount]);

  // Vatti schedule preview
  const monthlyVattiSchedule = React.useMemo(() => {
    if (category !== "MONTHLY_VATTI" || !nominal || !interestRate || Number(interestRate) <= 0) return null;
    return buildMonthlyInterestSchedule({
      startDate: startDate || today,
      principal: nominalAmount,
      rate: interestRate,
      method: interestType,
      collectionDay: collectionDay ? Number(collectionDay) : null,
      maturityDate: maturityDate || null,
      periodCount: 6,
    });
  }, [category, nominal, nominalAmount, interestRate, interestType, collectionDay, startDate, today, maturityDate]);

  // Run Vati schedule preview
  const runVatiSchedule = React.useMemo(() => {
    if (category !== "WEEKLY_RUN_VATI" || !nominal || !interestRate || Number(interestRate) <= 0) return null;
    return buildWeeklyInterestSchedule({
      startDate: startDate || today,
      principal: nominalAmount,
      rate: interestRate,
      method: interestType,
      collectionDay: collectionDay ? Number(collectionDay) : null,
      maturityDate: maturityDate || null,
      periodCount: 6,
    });
  }, [category, nominal, nominalAmount, interestRate, interestType, collectionDay, startDate, today, maturityDate]);

  // Calculated periodic interest
  const calculatedMonthlyInterest = React.useMemo(() => {
    if (!nominal || !interestRate || Number(interestRate) <= 0) return null;
    return calculateMonthlyInterest({ principal: nominalAmount, rate: interestRate, method: interestType });
  }, [nominal, nominalAmount, interestRate, interestType]);

  const calculatedWeeklyInterest = React.useMemo(() => {
    if (!nominal || !interestRate || Number(interestRate) <= 0) return null;
    return calculateWeeklyInterest({ principal: nominalAmount, rate: interestRate, method: interestType });
  }, [nominal, nominalAmount, interestRate, interestType]);

  async function onSubmit(values: LoanInput) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `loan-${Date.now()}`;
      const payload: LoanInput = { ...values, idempotencyKey };

      if (payload.category !== "THAVANAI") {
        payload.totalRepayment = payload.nominalAmount;
        payload.installmentAmount = "0";
        payload.firstDueDate = payload.startDate || today;
      }

      const result = await createLoanAction(payload);
      if (!result.ok) {
        toast.error(result.message || "Failed to create loan");
        if (result.fieldErrors) {
          for (const [key, message] of Object.entries(result.fieldErrors)) {
            setError(key as keyof LoanInput, { message });
          }
        }
        return;
      }

      toast.success("Loan created successfully");
      if (onSuccess && result.id) {
        onSuccess(result.id);
      } else {
        router.push(`/loans/${result.id}`);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const onInvalid = (fieldErrors: Record<string, { message?: string }>) => {
    const firstKey = Object.keys(fieldErrors)[0];
    const message = fieldErrors[firstKey]?.message || "Please fill in all required fields correctly.";
    toast.error(message);
  };

  const isBusy = submitting;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
      {/* Category Selection Tabs */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Select Loan Category
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={isBusy}
            className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
              category === "THAVANAI"
                ? "border-teal-500 bg-teal-50/70 dark:bg-teal-950/30 ring-2 ring-teal-500/20"
                : "border-border hover:bg-muted/50"
            }`}
            onClick={() => {
              setValue("category", "THAVANAI");
              if (!totalRepayment) setValue("totalRepayment", nominalAmount);
              if (!installmentAmount && nominalAmount) setValue("installmentAmount", money(D(nominalAmount).dividedBy(20)));
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600/10 text-teal-700 dark:text-teal-300">
                <ReceiptIndianRupee className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold text-sm">Thavanai</span>
            </div>
            <p className="text-xs text-muted-foreground">Fixed installments (daily, weekly, monthly).</p>
          </button>

          <button
            type="button"
            disabled={isBusy}
            className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
              category === "MONTHLY_VATTI"
                ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 ring-2 ring-blue-500/20"
                : "border-border hover:bg-muted/50"
            }`}
            onClick={() => {
              setValue("category", "MONTHLY_VATTI");
              if (!interestRate) setValue("interestRate", "3.0");
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/10 text-blue-700 dark:text-blue-300">
                <Percent className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold text-sm">Vatti</span>
            </div>
            <p className="text-xs text-muted-foreground">Monthly interest rate (%) with flexible repayments.</p>
          </button>

          <button
            type="button"
            disabled={isBusy}
            className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
              category === "WEEKLY_RUN_VATI"
                ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20"
                : "border-border hover:bg-muted/50"
            }`}
            onClick={() => {
              setValue("category", "WEEKLY_RUN_VATI");
              if (!interestRate) setValue("interestRate", "2.0");
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600/10 text-amber-700 dark:text-amber-300">
                <Coins className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold text-sm">Run Vati</span>
            </div>
            <p className="text-xs text-muted-foreground">Weekly interest rate (%) with weekly collections.</p>
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* Card 1: Customer & Basics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                Customer & loan category
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <FormField label="Customer" htmlFor="customerId" error={errors.customerId?.message} required className="sm:col-span-2">
                <SelectNative id="customerId" disabled={isBusy} {...register("customerId")}>
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

              <FormField label="Principal / Loan amount (INR)" htmlFor="nominalAmount" error={errors.nominalAmount?.message} required>
                <Input id="nominalAmount" inputMode="decimal" placeholder="30000.00" disabled={isBusy} {...register("nominalAmount")} />
              </FormField>

              <FormField
                label="Upfront deduction (INR)"
                htmlFor="deductionAmount"
                error={errors.deductionAmount?.message}
                hint="Deducted upfront. Net cash disbursed = Principal - Deduction."
                required
              >
                <Input id="deductionAmount" inputMode="decimal" placeholder="0.00" disabled={isBusy} {...register("deductionAmount")} />
              </FormField>

              <FormField label="Actual cash disbursed" htmlFor="netDisbursed" hint="Amount handed to customer.">
                <Input id="netDisbursed" value={net ? formatINR(net) : ""} placeholder="—" readOnly className="bg-muted/50 num" tabIndex={-1} />
              </FormField>

              <FormField label="Loan start date" htmlFor="startDate" error={errors.startDate?.message} required>
                <Input id="startDate" type="date" disabled={isBusy} {...register("startDate")} />
              </FormField>
            </CardContent>
          </Card>

          {/* Card 2: Category Specific Terms */}
          {category === "THAVANAI" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600/10 text-xs font-semibold text-teal-700 dark:text-teal-300">2</span>
                  Thavanai installment terms
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <FormField label="Frequency" htmlFor="frequency" error={errors.frequency?.message} required>
                  <SelectNative id="frequency" disabled={isBusy} {...register("frequency")}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </SelectNative>
                </FormField>

                <FormField label="First due date" htmlFor="firstDueDate" error={errors.firstDueDate?.message} required>
                  <Input id="firstDueDate" type="date" disabled={isBusy} {...register("firstDueDate")} />
                </FormField>

                <FormField
                  label="Contractual total repayment (INR)"
                  htmlFor="totalRepayment"
                  error={errors.totalRepayment?.message}
                  hint="Total repayment obligation agreed."
                  required
                >
                  <Input id="totalRepayment" inputMode="decimal" placeholder="30000.00" disabled={isBusy} {...register("totalRepayment")} />
                </FormField>

                <FormField label="Installment amount (INR)" htmlFor="installmentAmount" error={errors.installmentAmount?.message} required>
                  <Input id="installmentAmount" inputMode="decimal" placeholder="1500.00" disabled={isBusy} {...register("installmentAmount")} />
                </FormField>

                <FormField
                  label="Total installment count"
                  htmlFor="installmentCount"
                  error={errors.installmentCount?.message}
                  hint="Leave blank to derive from repayment ÷ installment amount."
                >
                  <Input id="installmentCount" inputMode="numeric" placeholder="e.g. 20" disabled={isBusy} {...register("installmentCount")} />
                </FormField>

                <FormField label="Expected gross margin" hint="Repayment total minus net disbursed.">
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
          )}

          {category === "MONTHLY_VATTI" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/10 text-xs font-semibold text-blue-700 dark:text-blue-300">2</span>
                  Vatti interest configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Monthly interest rate (%)"
                  htmlFor="interestRate"
                  error={errors.interestRate?.message}
                  hint="Enter monthly interest rate (e.g. 3 for 3%)."
                  required
                >
                  <Input id="interestRate" inputMode="decimal" placeholder="e.g. 3.0" disabled={isBusy} {...register("interestRate")} />
                </FormField>

                <FormField label="Calculation method" htmlFor="interestType" error={errors.interestType?.message} required>
                  <SelectNative id="interestType" disabled={isBusy} {...register("interestType")}>
                    <option value="FLAT_SIMPLE">Flat simple interest (on original principal)</option>
                    <option value="REDUCING_BALANCE">Reducing balance (on remaining principal)</option>
                  </SelectNative>
                </FormField>

                <FormField
                  label="Monthly interest due per month"
                  hint="Automatic monthly interest preview."
                >
                  <Input
                    value={calculatedMonthlyInterest ? formatINR(calculatedMonthlyInterest) : "—"}
                    placeholder="—"
                    readOnly
                    className="bg-muted/50 num"
                    tabIndex={-1}
                  />
                </FormField>

                <FormField
                  label="Monthly collection day (1–31)"
                  htmlFor="collectionDay"
                  error={errors.collectionDay?.message}
                  hint="Optional. Day of month for collection (e.g. 5 for 5th)."
                >
                  <Input id="collectionDay" inputMode="numeric" placeholder="e.g. 5" disabled={isBusy} {...register("collectionDay")} />
                </FormField>

                <FormField label="Optional maturity date" htmlFor="maturityDate" error={errors.maturityDate?.message} hint="Leave empty for open-ended interest loan.">
                  <Input id="maturityDate" type="date" disabled={isBusy} {...register("maturityDate")} />
                </FormField>

                <FormField label="Principal repayment arrangement" htmlFor="principalRepaymentArrangement" hint="e.g. Lump sum at maturity, or anytime partial payments.">
                  <Input id="principalRepaymentArrangement" placeholder="e.g. Bullet principal payment at maturity" disabled={isBusy} {...register("principalRepaymentArrangement")} />
                </FormField>
              </CardContent>
            </Card>
          )}

          {category === "WEEKLY_RUN_VATI" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600/10 text-xs font-semibold text-amber-700 dark:text-amber-300">2</span>
                  Run Vati configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Weekly interest rate (%)"
                  htmlFor="interestRate"
                  error={errors.interestRate?.message}
                  hint="Enter weekly interest rate (e.g. 2 for 2%)."
                  required
                >
                  <Input id="interestRate" inputMode="decimal" placeholder="e.g. 2.0" disabled={isBusy} {...register("interestRate")} />
                </FormField>

                <FormField label="Calculation method" htmlFor="interestType" error={errors.interestType?.message} required>
                  <SelectNative id="interestType" disabled={isBusy} {...register("interestType")}>
                    <option value="FLAT_SIMPLE">Flat simple interest (on original principal)</option>
                    <option value="REDUCING_BALANCE">Reducing balance (on remaining principal)</option>
                  </SelectNative>
                </FormField>

                <FormField
                  label="Weekly interest due per week"
                  hint="Automatic weekly interest preview."
                >
                  <Input
                    value={calculatedWeeklyInterest ? formatINR(calculatedWeeklyInterest) : "—"}
                    placeholder="—"
                    readOnly
                    className="bg-muted/50 num"
                    tabIndex={-1}
                  />
                </FormField>

                <FormField
                  label="Weekly collection day"
                  htmlFor="collectionDay"
                  error={errors.collectionDay?.message}
                  hint="Day of week for collection."
                >
                  <SelectNative id="collectionDay" disabled={isBusy} {...register("collectionDay")}>
                    <option value="">Same as start day of week</option>
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </SelectNative>
                </FormField>

                <FormField label="Optional maturity date" htmlFor="maturityDate" error={errors.maturityDate?.message} hint="Leave empty for open-ended interest loan.">
                  <Input id="maturityDate" type="date" disabled={isBusy} {...register("maturityDate")} />
                </FormField>

                <FormField label="Principal repayment arrangement" htmlFor="principalRepaymentArrangement" hint="e.g. Lump sum or flexible principal reductions.">
                  <Input id="principalRepaymentArrangement" placeholder="e.g. Flexible principal repayment" disabled={isBusy} {...register("principalRepaymentArrangement")} />
                </FormField>
              </CardContent>
            </Card>
          )}

          {/* Card 3: Notes & Activation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                Notes, terms & activation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField label="Contractual terms" htmlFor="terms" error={errors.terms?.message}>
                <Textarea id="terms" rows={2} placeholder="Agreed conditions, terms, or disclosures…" disabled={isBusy} {...register("terms")} />
              </FormField>
              <FormField label="Internal notes" htmlFor="notes" error={errors.notes?.message}>
                <Textarea id="notes" rows={2} placeholder="Optional administrator notes" disabled={isBusy} {...register("notes")} />
              </FormField>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" disabled={isBusy} {...register("activate")} />
                <span>
                  <span className="block text-sm font-medium">Activate immediately</span>
                  <span className="block text-xs text-muted-foreground">
                    Generates schedule records immediately. Leave unchecked to save as draft.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Schedule Preview Column */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Schedule preview</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${LOAN_CATEGORY_TONES[category ?? "THAVANAI"]}`}>
                  {LOAN_CATEGORY_LABELS[category ?? "THAVANAI"]}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {category === "THAVANAI" && (
                <div>
                  {thavanaiSchedule?.rows && thavanaiSchedule.rows.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        {thavanaiSchedule.installmentCount} installments of {formatINR(installmentAmount || "0")} ({(frequency || "WEEKLY").toLowerCase()})
                      </p>
                      <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {thavanaiSchedule.rows.map((row) => (
                          <div key={row.sequence} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                            <span className="font-medium">#{row.sequence} · {formatDateISO(row.dueDate)}</span>
                            <span className="font-semibold num">{formatINR(row.scheduledAmount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      Enter repayment amount and installment amount to preview schedule.
                    </p>
                  )}
                </div>
              )}

              {category === "MONTHLY_VATTI" && (
                <div>
                  {monthlyVattiSchedule?.rows && monthlyVattiSchedule.rows.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Monthly interest: {formatINR(calculatedMonthlyInterest ?? "0")} / month ({interestRate}% monthly)
                      </p>
                      <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {monthlyVattiSchedule.rows.map((row) => (
                          <div key={row.sequence} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                            <span className="font-medium">Cycle {row.sequence} · Due {formatDateISO(row.dueDate)}</span>
                            <span className="font-semibold num text-blue-700 dark:text-blue-300">
                              {formatINR(row.scheduledAmount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      Enter principal amount and monthly interest rate (%) to preview monthly interest cycles.
                    </p>
                  )}
                </div>
              )}

              {category === "WEEKLY_RUN_VATI" && (
                <div>
                  {runVatiSchedule?.rows && runVatiSchedule.rows.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Weekly interest: {formatINR(calculatedWeeklyInterest ?? "0")} / week ({interestRate}% weekly)
                      </p>
                      <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {runVatiSchedule.rows.map((row) => (
                          <div key={row.sequence} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                            <span className="font-medium">Week {row.sequence} · Due {formatDateISO(row.dueDate)}</span>
                            <span className="font-semibold num text-amber-700 dark:text-amber-300">
                              {formatINR(row.scheduledAmount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      Enter principal amount and weekly interest rate (%) to preview weekly interest cycles.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                {isDialog && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (onCancel) onCancel();
                      else router.back();
                    }}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                )}
                <Button type="submit" className={isDialog ? "flex-1" : "w-full"} disabled={isBusy}>
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {`Creating ${LOAN_CATEGORY_LABELS[category ?? "THAVANAI"]} loan...`}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {`Create ${LOAN_CATEGORY_LABELS[category ?? "THAVANAI"]} loan`}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
