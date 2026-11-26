import { z } from "zod";
import { isValidMoneyInput, D, MAX_AMOUNT, money } from "@/lib/money";
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

const optionalNonNegativeMoney = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((value) => {
    if (!value || value === "") return true;
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
  idempotencyKey: z.string().trim().max(100).optional(),
  // Optional initial loan creation:
  createInitialLoan: z.boolean().optional().default(false),
  initialLoanCategory: z.enum(["THAVANAI", "MONTHLY_VATTI", "WEEKLY_RUN_VATI"]).optional().default("THAVANAI"),
  initialNominalAmount: optionalText(20),
  initialDeductionAmount: optionalText(20),
  initialTotalRepayment: optionalText(20),
  initialInstallmentAmount: optionalText(20),
  initialFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional().default("WEEKLY"),
  initialInterestRate: optionalText(10),
  initialInterestType: z.enum(["FLAT_SIMPLE", "REDUCING_BALANCE"]).optional().default("FLAT_SIMPLE"),
});
export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerParsed = z.infer<typeof customerInputSchema>;

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
    category: z.enum(["THAVANAI", "MONTHLY_VATTI", "WEEKLY_RUN_VATI"]).default("THAVANAI"),
    nominalAmount: positiveMoney,
    deductionAmount: nonNegativeMoney.default("0"),
    idempotencyKey: z.string().trim().max(100).optional(),

    // THAVANAI fields:
    totalRepayment: optionalNonNegativeMoney,
    installmentAmount: optionalNonNegativeMoney,
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("WEEKLY"),
    firstDueDate: optionalDate,
    installmentCount: installmentCountField,

    // VATTI & RUN VATI fields:
    interestRate: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((val) => {
        if (!val) return true;
        const n = Number(val);
        return !isNaN(n) && n > 0 && n <= 100;
      }, "Enter a valid interest percentage between 0.01% and 100%"),
    interestType: z.enum(["FLAT_SIMPLE", "REDUCING_BALANCE"]).default("FLAT_SIMPLE"),
    collectionDay: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((val) => {
        if (!val) return true;
        const n = Number(val);
        return Number.isInteger(n) && n >= 0 && n <= 31;
      }, "Enter a valid collection day"),
    maturityDate: optionalDate,
    principalRepaymentArrangement: optionalText(1000),
    unpaidInterestHandling: optionalText(500),

    startDate: isoDate,
    disbursementDate: optionalDate,
    notes: optionalText(2000),
    terms: optionalText(5000),
    activate: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const nominalValid = isValidMoneyInput(value.nominalAmount);
    const deductionValid = /^\d{1,11}(\.\d{1,2})?$/.test(value.deductionAmount);
    if (nominalValid && deductionValid) {
      const nominal = D(value.nominalAmount);
      const deduction = D(value.deductionAmount);
      if (deduction.gte(nominal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deductionAmount"],
          message: "Deduction must be less than the nominal loan amount",
        });
      }
    }

    if (value.category === "THAVANAI") {
      if (!isValidMoneyInput(value.totalRepayment)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["totalRepayment"], message: "Total repayment is required" });
      } else if (nominalValid && !D(value.totalRepayment).eq(D(value.nominalAmount))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalRepayment"],
          message: "Repayment amount must equal the loan amount",
        });
      }
      if (!isValidMoneyInput(value.installmentAmount)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentAmount"], message: "Installment amount is required" });
      }
      if (!value.firstDueDate || !isValidISODate(value.firstDueDate)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDueDate"], message: "First due date is required" });
      } else if (value.firstDueDate < value.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstDueDate"], message: "First due date cannot be before the start date" });
      }

      if (!isValidMoneyInput(value.totalRepayment) || !isValidMoneyInput(value.installmentAmount) || !value.firstDueDate || !isValidISODate(value.firstDueDate)) {
        return;
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
    } else {
      // MONTHLY_VATTI or WEEKLY_RUN_VATI
      if (!value.interestRate || !value.interestRate.trim() || Number(value.interestRate) <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["interestRate"], message: "Interest percentage is required" });
      }
      if (value.maturityDate && value.maturityDate < value.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maturityDate"], message: "Maturity date cannot be before the start date" });
      }
    }
  });
export type LoanInput = z.input<typeof loanInputSchema>;
export type LoanParsed = z.infer<typeof loanInputSchema>;

export const paymentInputSchema = z
  .object({
    loanId: z.string().trim().min(1, "Loan is required"),
    amount: positiveMoney,
    paidAt: z
      .string()
      .trim()
      .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value), "Enter a valid payment date and time"),
    mode: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]).default("CASH"),
    notes: optionalText(1000),
    idempotencyKey: z.string().trim().min(8, "Invalid submission key").max(100),
    interestAmount: nonNegativeMoney.optional().default("0"),
    principalAmount: nonNegativeMoney.optional().default("0"),
    paymentType: z.enum(["INSTALLMENT", "INTEREST_ONLY", "PRINCIPAL_ONLY", "COMBINED", "FULL_SETTLEMENT"]).optional(),
  })
  .superRefine((val, ctx) => {
    const total = D(val.amount);
    const interest = D(val.interestAmount || "0");
    const principal = D(val.principalAmount || "0");
    if (interest.gt(0) || principal.gt(0)) {
      if (!interest.plus(principal).eq(total)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: `Breakdown (Interest ₹${money(interest)} + Principal ₹${money(principal)}) must equal total payment of ₹${money(total)}`,
        });
      }
    }
  });
export type PaymentInput = z.input<typeof paymentInputSchema>;
export type PaymentParsed = z.infer<typeof paymentInputSchema>;

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
