import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wallet, ShieldCheck, ArrowLeftRight, FileText } from "lucide-react";
import { auth } from "@/auth";
import { LoginForm } from "@/components/forms/login-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Administrator sign in" };

export default async function LoginPage() {
  let session = null;
  try {
    session = await auth();
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Session check on login page:", error);
  }
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{APP_NAME}</p>
              <p className="text-xs text-sidebar-muted">Private collection administration</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-lg text-4xl font-semibold leading-tight text-white">
            Every installment, receipt and balance in one place.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-sidebar-foreground/80">
            Built for a single lender managing flexible loans. Record manual cash collections, follow overdue
            installments and share clear statements with customers — without a customer portal or payment gateway.
          </p>
          <div className="mt-10 grid max-w-md gap-4">
            {[
              { icon: ArrowLeftRight, title: "Flexible loan terms", text: "Daily, weekly or monthly schedules with custom deductions and repayment totals." },
              { icon: FileText, title: "Statements & receipts", text: "Server-generated PDFs with WhatsApp sharing and Excel exports." },
              { icon: ShieldCheck, title: "Private by default", text: "Single administrator, secure sessions and an auditable financial ledger." },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs text-sidebar-muted">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          Manual bookkeeping only. No payment processing or automatic bank reconciliation.
        </p>
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold">{APP_NAME}</p>
              <p className="text-xs text-muted-foreground">Private collection administration</p>
            </div>
          </div>
          <div className="card-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">Administrator sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the single administrator account created during setup.
            </p>
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            No public registration. Sessions are protected and sign-in attempts are rate-limited.
          </p>
        </div>
      </div>
    </div>
  );
}
