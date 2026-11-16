"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { passwordSchema, profileSchema, settingsSchema } from "@/lib/validation";
import {
  changePasswordAction,
  updateProfileAction,
  updateSettingsAction,
} from "@/app/actions/settings";

export function BusinessSettingsForm({
  businessName,
  receiptHeader,
  receiptFooter,
}: {
  businessName: string;
  receiptHeader: string;
  receiptFooter: string;
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema) as Resolver<z.infer<typeof settingsSchema>>,
    defaultValues: { businessName, receiptHeader, receiptFooter },
  });
  const { register, handleSubmit, setError, formState } = form;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = await updateSettingsAction(values);
        if (!result.ok) {
          toast.error(result.message);
          if (result.fieldErrors) {
            for (const [key, message] of Object.entries(result.fieldErrors)) {
              setError(key as keyof typeof values, { message });
            }
          }
          return;
        }
        toast.success(result.message ?? "Settings saved.");
        router.refresh();
      })}
      className="space-y-4"
    >
      <FormField label="Business display name" htmlFor="businessName" error={formState.errors.businessName?.message} required hint="Shown on receipts, statements and exports.">
        <Input id="businessName" {...register("businessName")} />
      </FormField>
      <FormField label="Receipt header" htmlFor="receiptHeader" error={formState.errors.receiptHeader?.message}>
        <Textarea id="receiptHeader" rows={2} placeholder="Short message at the top of receipts" {...register("receiptHeader")} />
      </FormField>
      <FormField label="Receipt / statement footer" htmlFor="receiptFooter" error={formState.errors.receiptFooter?.message}>
        <Textarea id="receiptFooter" rows={2} placeholder="Disclosure text at the bottom" {...register("receiptFooter")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save business settings
      </Button>
    </form>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema) as Resolver<z.infer<typeof profileSchema>>,
    defaultValues: { name, email },
  });
  const { register, handleSubmit, setError, formState } = form;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = await updateProfileAction(values);
        if (!result.ok) {
          toast.error(result.message);
          if (result.fieldErrors) {
            for (const [key, message] of Object.entries(result.fieldErrors)) {
              setError(key as keyof typeof values, { message });
            }
          }
          return;
        }
        toast.success(result.message ?? "Profile updated.");
        router.refresh();
      })}
      className="space-y-4"
    >
      <FormField label="Administrator name" htmlFor="adminName" error={formState.errors.name?.message} required>
        <Input id="adminName" autoComplete="name" {...register("name")} />
      </FormField>
      <FormField label="Email address" htmlFor="adminEmail" error={formState.errors.email?.message} required hint="Changes apply to future sign-ins.">
        <Input id="adminEmail" type="email" autoComplete="email" {...register("email")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save profile
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema) as Resolver<z.infer<typeof passwordSchema>>,
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { register, handleSubmit, setError, reset, formState } = form;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = await changePasswordAction(values);
        if (!result.ok) {
          toast.error(result.message);
          if (result.fieldErrors) {
            for (const [key, message] of Object.entries(result.fieldErrors)) {
              setError(key as keyof typeof values, { message });
            }
          }
          return;
        }
        toast.success(result.message ?? "Password updated.");
        reset();
      })}
      className="space-y-4"
    >
      <FormField label="Current password" htmlFor="currentPassword" error={formState.errors.currentPassword?.message} required>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
      </FormField>
      <FormField
        label="New password"
        htmlFor="newPassword"
        error={formState.errors.newPassword?.message}
        hint="At least 10 characters with a letter and a number."
        required
      >
        <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
      </FormField>
      <FormField label="Confirm new password" htmlFor="confirmPassword" error={formState.errors.confirmPassword?.message} required>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Update password
      </Button>
    </form>
  );
}
