"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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

export function CustomerForm({ mode, customer }: { mode: "create" | "edit"; customer?: CustomerFormValues }) {
  const router = useRouter();
  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema) as Resolver<CustomerInput>,
    defaultValues: {
      fullName: customer?.fullName ?? "",
      mobile: customer?.mobile ?? "",
      alternateMobile: customer?.alternateMobile ?? "",
      address: customer?.address ?? "",
      notes: customer?.notes ?? "",
    },
  });
  const { register, handleSubmit, setError, formState } = form;
  const { errors, isSubmitting } = formState;

  async function onSubmit(values: CustomerInput) {
    const result =
      mode === "create"
        ? await createCustomerAction(values)
        : await updateCustomerAction(customer?.id ?? "", values);

    if (!result.ok) {
      toast.error(result.message);
      if (result.fieldErrors) {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          setError(key as keyof CustomerInput, { message });
        }
      }
      return;
    }
    toast.success(result.message ?? "Saved");
    router.push(`/customers/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
          <Input id="fullName" autoComplete="name" placeholder="e.g. Lakshmi Raman" {...register("fullName")} />
        </FormField>
        <FormField
          label="Mobile number"
          htmlFor="mobile"
          error={errors.mobile?.message}
          hint="10-digit Indian mobile number, used for WhatsApp prefills."
          required
        >
          <Input id="mobile" inputMode="tel" autoComplete="tel" placeholder="98765 43210" {...register("mobile")} />
        </FormField>
        <FormField label="Alternate mobile" htmlFor="alternateMobile" error={errors.alternateMobile?.message}>
          <Input id="alternateMobile" inputMode="tel" placeholder="Optional" {...register("alternateMobile")} />
        </FormField>
        <FormField label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} placeholder="Optional address" {...register("address")} />
        </FormField>
        <FormField
          label="Internal notes"
          htmlFor="notes"
          error={errors.notes?.message}
          hint="Visible only to the administrator. Do not store sensitive identifiers."
          className="sm:col-span-2"
        >
          <Textarea id="notes" rows={3} placeholder="Optional notes about this customer" {...register("notes")} />
        </FormField>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create customer" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
