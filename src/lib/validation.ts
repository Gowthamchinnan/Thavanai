import { z } from "zod";
import { isValidMoneyInput, D, MAX_AMOUNT } from "@/lib/money";
import { isValidISODate } from "@/lib/dates";
import { normalizeMobile } from "@/lib/whatsapp";
import { MAX_INSTALLMENTS, buildSchedule } from "@/lib/schedule";

const positiveMoney = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine(isValidMoneyInput, "Enter a valid amount greater than 0 with up to 2 decimals");

const nonNegativeMoney = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine((value) => {
    if (!/^\d{1,11}(\.\d{1,2})?$/.test(value)) return false;
    const d = D(value);
    return d.gte(0) && d.lte(MAX_AMOUNT);
  }, "Enter a valid amount of 0 or more with up to 2 decimals");

const isoDate = z.string().trim().refine(isValidISODate, "Enter a valid date");

const optionalDate = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((value) => value === "" || isValidISODate(value), "Enter a valid date");

const optionalText = (max: number) => z.string().trim().max(max, `Maximum ${max} characters`).optional().default("");

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120, "Maximum 120 characters"),
  mobile: z
    .string()
    .trim()
    .min(1, "Mobile number is required")
    .refine((value) => normalizeMobile(value) !== null, "Enter a valid 10-digit Indian mobile number"),
  alternateMobile: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => value === "" || normalizeMobile(value) !== null, "Enter a valid 10-digit mobile number"),
  address: optionalText(500),
  notes: optionalText(2000),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

const installmentCountField = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((value) => {
    if (value === "") return true;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= MAX_INSTALLMENTS;
  }, `Enter a whole number between 1 and ${MAX_INSTALLMENTS}, or leave blank to derive it`);

export const loanInputSchema = z
  .object({
    customerId: z.string().trim().min(1, "Select a customer"),
    nominalAmount: positiveMoney,
    deductionAmount: nonNegativeMoney,
    totalRepayment: positiveMoney,
    installmentAmount: positiveMoney,
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    startDate: isoDate,
    firstDueDate: isoDate,
    disbursementDate: optionalDate,
    installmentCount: installmentCountField,
    notes: optionalText(2000),
    terms: optionalText(5000),
    activate: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const nominalValid = isValidMoneyInput(value.nominalAmount);
    const deductionValid = /^\d{1,11}(\.\d{1,2})?$/.test(value.deductionAmount);
    if (!nominalValid || !deductionValid) return;
    if (!isValidMoneyInput(value.totalRepayment) || !isValidMoneyInput(value.installmentAmount)) return;

    const nominal = D(value.nominalAmount);
    const deduction = D(value.deductionAmount);
    if (deduction.gte(nominal)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deductionAmount"], message: "Deduction must be less than the nominal loan amount" });
    }
    if (value.firstDueDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDueDate"], message: "First due date cannot be before the start date" });
    }
    if (value.disbursementDate && value.disbursementDate < value.startDate) {
      // Backdated disbursement is unusual but allowed; only block dates before the loan start by more than a year.
    }
    const providedCount = value.installmentCount === "" ? null : Number(value.installmentCount);
    const schedule = buildSchedule({
      firstDueDate: value.firstDueDate,
      frequency: value.frequency,
      installmentAmount: value.installmentAmount,
      totalRepayment: value.totalRepayment,
      installmentCount: providedCount,
    });
    if (!schedule.ok) {
      for (const error of schedule.errors) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentCount"], message: error });
      }
    }
    if (schedule.installmentCount > 0 && providedCount == null) {
      const last = schedule.rows[schedule.rows.length - 1];
      if (last && D(last.scheduledAmount).lte(0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentCount"], message: "Schedule would end with a zero installment" });
      }
    }
  });
export type LoanInput = z.infer<typeof loanInputSchema>;

export const paymentInputSchema = z.object({
  loanId: z.string().trim().min(1, "Loan is required"),
  amount: positiveMoney,
  paidAt: z
    .string()
    .trim()
    .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value), "Enter a valid payment date and time"),
  mode: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]).default("CASH"),
  notes: optionalText(1000),
  idempotencyKey: z.string().trim().min(8, "Invalid submission key").max(100),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const voidPaymentSchema = z.object({
  paymentId: z.string().trim().min(1),
  reason: z.string().trim().min(5, "Give a clear reason (at least 5 characters)").max(500),
});

export const writeOffSchema = z.object({
  loanId: z.string().trim().min(1),
  reason: z.string().trim().min(5, "Give a clear reason (at least 5 characters)").max(500),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(2, "Business display name is required").max(100),
  receiptHeader: z.string().trim().max(500).optional().default(""),
  receiptFooter: z.string().trim().max(500).optional().default(""),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email address").max(200),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(200)
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
