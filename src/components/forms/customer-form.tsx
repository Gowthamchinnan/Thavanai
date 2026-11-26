"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Coins, Loader2, Percent, ReceiptIndianRupee, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, SelectNative, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { customerInputSchema, type CustomerInput } from "@/lib/validation";
import { createCustomerAction, updateCustomerAction } from "@/app/actions/customers";

export interface CustomerFormValues {
  id?: string;
  fullName: string;
  mobile: string;
  alternateMobile: string;
  address: string;
  notes: string;
}

export function CustomerForm({
  mode,
  customer,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  customer?: CustomerFormValues;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  isDialog?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);

  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema) as Resolver<CustomerInput>,
    defaultValues: {
      fullName: customer?.fullName ?? "",
      mobile: customer?.mobile ?? "",
      alternateMobile: customer?.alternateMobile ?? "",
      address: customer?.address ?? "",
      notes: customer?.notes ?? "",
      createInitialLoan: false,
      initialLoanCategory: "THAVANAI",
      initialNominalAmount: "",
      initialDeductionAmount: "0",
      initialTotalRepayment: "",
      initialInstallmentAmount: "",
      initialFrequency: "WEEKLY",
      initialInterestRate: "3.0",
      initialInterestType: "FLAT_SIMPLE",
    },
  });

  const { register, handleSubmit, setError, watch, setValue, formState } = form;
  const { errors } = formState;

  const createInitialLoan = watch("createInitialLoan");
  const initialCategory = watch("initialLoanCategory");
  const initialNominalAmount = watch("initialNominalAmount");

  React.useEffect(() => {
    if (createInitialLoan && initialCategory === "THAVANAI") {
      setValue("initialTotalRepayment", initialNominalAmount ?? "");
    }
  }, [createInitialLoan, initialCategory, initialNominalAmount, setValue]);

  async function onSubmit(values: CustomerInput) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cus-${Date.now()}`;
      const payload: CustomerInput = { ...values, idempotencyKey };

      const result =
        mode === "create"
          ? await createCustomerAction(payload)
          : await updateCustomerAction(customer?.id ?? "", payload);

      if (!result.ok) {
        toast.error(result.message || "Failed to save customer");
        if (result.fieldErrors) {
          for (const [key, message] of Object.entries(result.fieldErrors)) {
            setError(key as keyof CustomerInput, { message });
          }
        }
        return;
      }

      toast.success(mode === "create" ? "Customer created successfully" : "Customer updated successfully");
      if (onSuccess && result.id) {
        onSuccess(result.id);
      } else {
        router.push(`/customers/${result.id}`);
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
    const message = fieldErrors[firstKey]?.message || "Please check the highlighted fields.";
    toast.error(message);
  };

  const isBusy = submitting;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" autoComplete="name" placeholder="e.g. Sivaprabhu" disabled={isBusy} {...register("fullName")} />
        </FormField>
        <FormField
          label="Mobile number"
          htmlFor="mobile"
          error={errors.mobile?.message}
          hint="10-digit Indian mobile number, used for WhatsApp prefills."
          required
        >
          <Input id="mobile" inputMode="tel" autoComplete="tel" placeholder="98765 43210" disabled={isBusy} {...register("mobile")} />
        </FormField>
        <FormField label="Alternate mobile" htmlFor="alternateMobile" error={errors.alternateMobile?.message}>
          <Input id="alternateMobile" inputMode="tel" placeholder="Optional" disabled={isBusy} {...register("alternateMobile")} />
        </FormField>
        <FormField label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} placeholder="Optional residential or shop address" disabled={isBusy} {...register("address")} />
        </FormField>
        <FormField
          label="Internal notes"
          htmlFor="notes"
          error={errors.notes?.message}
          hint="Visible only to the administrator."
          className="sm:col-span-2"
        >
          <Textarea id="notes" rows={2} placeholder="Optional notes about this customer" disabled={isBusy} {...register("notes")} />
        </FormField>
      </div>

      {mode === "create" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-teal-600 rounded"
              disabled={isBusy}
              {...register("createInitialLoan")}
            />
            <div>
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-teal-600" /> Create first loan immediately
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Optionally disburse an initial Thavanai, Vatti, or Run Vati loan right now.
              </span>
            </div>
          </label>

          {createInitialLoan && (
            <div className="pt-3 border-t border-border space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Select Loan Category
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                      initialCategory === "THAVANAI"
                        ? "border-teal-500 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                        : "border-border hover:bg-muted"
                    }`}
                    onClick={() => setValue("initialLoanCategory", "THAVANAI")}
                  >
                    <ReceiptIndianRupee className="h-4 w-4 text-teal-600" /> Thavanai
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                      initialCategory === "MONTHLY_VATTI"
                        ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200"
                        : "border-border hover:bg-muted"
                    }`}
                    onClick={() => {
                      setValue("initialLoanCategory", "MONTHLY_VATTI");
                      setValue("initialInterestRate", "3.0");
                    }}
                  >
                    <Percent className="h-4 w-4 text-blue-600" /> Vatti
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                      initialCategory === "WEEKLY_RUN_VATI"
                        ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                        : "border-border hover:bg-muted"
                    }`}
                    onClick={() => {
                      setValue("initialLoanCategory", "WEEKLY_RUN_VATI");
                      setValue("initialInterestRate", "2.0");
                    }}
                  >
                    <Coins className="h-4 w-4 text-amber-600" /> Run Vati
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Principal / Loan amount (INR)" htmlFor="initialNominalAmount">
                  <Input id="initialNominalAmount" inputMode="decimal" placeholder="30000.00" disabled={isBusy} {...register("initialNominalAmount")} />
                </FormField>
                <FormField label="Upfront deduction (INR)" htmlFor="initialDeductionAmount">
                  <Input id="initialDeductionAmount" inputMode="decimal" placeholder="0.00" disabled={isBusy} {...register("initialDeductionAmount")} />
                </FormField>

                {initialCategory === "THAVANAI" ? (
                  <>
                    <FormField
                      label="Contractual total repayment (INR)"
                      htmlFor="initialTotalRepayment"
                      hint="Repayment amount is automatically fixed to the loan amount."
                    >
                      <Input
                        id="initialTotalRepayment"
                        inputMode="decimal"
                        placeholder="30000.00"
                        readOnly
                        tabIndex={-1}
                        className="bg-muted/50 num cursor-not-allowed"
                        aria-readonly="true"
                        {...register("initialTotalRepayment")}
                      />
                    </FormField>
                    <FormField label="Installment amount (INR)" htmlFor="initialInstallmentAmount">
                      <Input id="initialInstallmentAmount" inputMode="decimal" placeholder="1500.00" disabled={isBusy} {...register("initialInstallmentAmount")} />
                    </FormField>
                    <FormField label="Frequency" htmlFor="initialFrequency">
                      <SelectNative id="initialFrequency" disabled={isBusy} {...register("initialFrequency")}>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </SelectNative>
                    </FormField>
                  </>
                ) : (
                  <>
                    <FormField
                      label={`${initialCategory === "MONTHLY_VATTI" ? "Monthly" : "Weekly"} interest rate (%)`}
                      htmlFor="initialInterestRate"
                      hint="User configured interest rate percentage."
                    >
                      <Input id="initialInterestRate" inputMode="decimal" placeholder="e.g. 3.0" disabled={isBusy} {...register("initialInterestRate")} />
                    </FormField>
                    <FormField label="Calculation method" htmlFor="initialInterestType">
                      <SelectNative id="initialInterestType" disabled={isBusy} {...register("initialInterestType")}>
                        <option value="FLAT_SIMPLE">Flat simple interest</option>
                        <option value="REDUCING_BALANCE">Reducing balance on remaining principal</option>
                      </SelectNative>
                    </FormField>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (onCancel) onCancel();
            else router.back();
          }}
          disabled={isBusy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isBusy}>
          {isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "create" ? "Creating customer..." : "Saving..."}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {mode === "create" ? "Create customer" : "Save changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
