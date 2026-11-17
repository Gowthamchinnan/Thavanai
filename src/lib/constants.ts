export const APP_NAME = "Siva Thul Finance";
export const PAGE_SIZE = 20;

export const LOAN_CATEGORIES = ["THAVANAI", "MONTHLY_VATTI", "WEEKLY_RUN_VATI"] as const;
export const LOAN_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export const LOAN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "WRITTEN_OFF"] as const;
export const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "UPI", "OTHER"] as const;
export const INSTALLMENT_STATUSES = ["UPCOMING", "DUE_TODAY", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;

export const LOAN_CATEGORY_LABELS: Record<string, string> = {
  THAVANAI: "Thavanai",
  MONTHLY_VATTI: "Vatti",
  WEEKLY_RUN_VATI: "Run Vati",
};

export const LOAN_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  THAVANAI: "Installment-based fixed repayment loan (daily, weekly, or monthly installments).",
  MONTHLY_VATTI: "Monthly interest-based loan with flexible interest & principal repayments.",
  WEEKLY_RUN_VATI: "Weekly interest-based loan with flexible interest & principal repayments.",
};

export const LOAN_CATEGORY_TONES: Record<string, string> = {
  THAVANAI: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  MONTHLY_VATTI: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  WEEKLY_RUN_VATI: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
};

export const INTEREST_CALCULATION_METHOD_LABELS: Record<string, string> = {
  FLAT_SIMPLE: "Flat interest (on original principal)",
  REDUCING_BALANCE: "Reducing balance (on outstanding principal)",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

export const LOAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  WRITTEN_OFF: "Written off",
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI (recorded offline)",
  OTHER: "Other",
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Upcoming",
  DUE_TODAY: "Due today",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

export const LOAN_STATUS_TONES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  COMPLETED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CANCELLED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  WRITTEN_OFF: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export const INSTALLMENT_STATUS_TONES: Record<string, string> = {
  UPCOMING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  DUE_TODAY: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PARTIALLY_PAID: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  OVERDUE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export const REPORT_TYPE_OPTIONS = [
  { value: "full-workbook", label: "Complete 6-Sheet Workbook", description: "Comprehensive Excel workbook with Overall Summary, Thavanai, Vatti, Run Vati, Collections, and Balances." },
  { value: "thavanai", label: "Thavanai report", description: "All installment loans with repayment schedules, margins, and collection status." },
  { value: "monthly-vatti", label: "Vatti report", description: "Monthly interest loans with principal, rate, accrued & collected interest, and pending interest." },
  { value: "run-vati", label: "Run Vati report", description: "Weekly interest loans with principal, weekly rate, accrued & collected interest, and pending interest." },
  { value: "collections", label: "Collection report", description: "Payments received across all categories with breakdowns and daily summaries." },
  { value: "ledger", label: "Combined customer ledger", description: "Chronological transaction ledger across all 3 loan categories." },
  { value: "outstanding", label: "Outstanding balances", description: "Customer-wise exposure across Thavanai, Vatti, and Run Vati." },
  { value: "customers", label: "Customer directory", description: "All registered customers with contact information and portfolio summary." },
] as const;

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/customers", label: "Customers", icon: "Users" },
  { href: "/loans", label: "Loans", icon: "Wallet" },
  { href: "/collections/today", label: "Due today", icon: "CalendarClock" },
  { href: "/collections/overdue", label: "Overdue", icon: "TriangleAlert" },
  { href: "/collections/upcoming", label: "Upcoming", icon: "CalendarDays" },
  { href: "/payments", label: "Payments", icon: "ReceiptIndianRupee" },
  { href: "/reports", label: "Reports", icon: "FileSpreadsheet" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;
