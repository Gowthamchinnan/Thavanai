"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  Coins,
  FileText,
  Percent,
  ReceiptIndianRupee,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { Customer } from "@prisma/client";
import type { CustomerLoanSummary } from "@/lib/services/customers";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoanCategoryBadge, LoanStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FREQUENCY_LABELS,
  INTEREST_CALCULATION_METHOD_LABELS,
  PAYMENT_MODE_LABELS,
} from "@/lib/constants";

interface PaymentRow {
  id: string;
  receiptNumber: string;
  paidAt: Date;
  amount: { toString(): string } | string | number;
  principalAmount?: { toString(): string } | string | number | null;
  interestAmount?: { toString(): string } | string | number | null;
  previousPrincipal?: { toString(): string } | string | number | null;
  newPrincipal?: { toString(): string } | string | number | null;
  previousInterest?: { toString(): string } | string | number | null;
  newInterest?: { toString(): string } | string | number | null;
  mode: string;
  status: string;
  notes?: string | null;
  loan: {
    reference: string;
    category: string;
  };
  createdBy: {
    name: string;
  } | null;
}

interface CustomerDetailViewProps {
  customer: Customer;
  loans: CustomerLoanSummary[];
  thavanaiLoans: CustomerLoanSummary[];
  monthlyVattiLoans: CustomerLoanSummary[];
  weeklyRunVatiLoans: CustomerLoanSummary[];
  payments: PaymentRow[];
  stats: {
    totalLoans: number;
    activeLoans: number;
    totalPrincipalDisbursed: string;
    totalCollected: string;
    outstandingPrincipal: string;
    outstandingInterest: string;
    totalOutstandingBalance: string;
    totalOverdue: string;
  };
}

export function CustomerDetailView({
  customer,
  loans,
  thavanaiLoans,
  monthlyVattiLoans,
  weeklyRunVatiLoans = [],
  payments,
  stats,
}: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = React.useState<"all" | "thavanai" | "vatti" | "runVati">("all");

  const displayedLoans = React.useMemo(() => {
    switch (activeTab) {
      case "thavanai":
        return thavanaiLoans;
      case "vatti":
        return monthlyVattiLoans;
      case "runVati":
        return weeklyRunVatiLoans;
      default:
        return loans;
    }
  }, [activeTab, loans, thavanaiLoans, monthlyVattiLoans, weeklyRunVatiLoans]);

  const activeThavanaiCount = (thavanaiLoans ?? []).filter((l) => l.status === "ACTIVE").length;
  const activeMonthlyCount = (monthlyVattiLoans ?? []).filter((l) => l.status === "ACTIVE").length;
  const activeWeeklyCount = (weeklyRunVatiLoans ?? []).filter((l) => l.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* 8 Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Disbursed</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(stats.totalPrincipalDisbursed)}</p>
          <p className="text-[11px] text-muted-foreground">Across all loans</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Collected</p>
          <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(stats.totalCollected)}</p>
          <p className="text-[11px] text-muted-foreground">Principal + Interest</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding Principal</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(stats.outstandingPrincipal)}</p>
          <p className="text-[11px] text-muted-foreground">Active loans</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding Interest</p>
          <p className="num mt-1 text-lg font-semibold text-amber-700 dark:text-amber-400">{formatINR(stats.outstandingInterest)}</p>
          <p className="text-[11px] text-muted-foreground">Vatti accrued pending</p>
        </div>

        <div className="rounded-xl border-2 border-primary/40 bg-accent/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-primary font-medium">Total Outstanding Balance</p>
          <p className="num mt-1 text-xl font-bold text-primary">{formatINR(stats.totalOutstandingBalance)}</p>
          <p className="text-[11px] text-muted-foreground">Principal + Unpaid Interest</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active Loans</p>
          <p className="num mt-1 text-xl font-semibold">{stats.activeLoans}</p>
          <p className="text-[11px] text-muted-foreground">
            {activeThavanaiCount} Thav · {activeMonthlyCount} Vatti · {activeWeeklyCount} Run Vati
          </p>
        </div>

        <div className={`rounded-xl border p-4 ${
          Number(stats.totalOverdue) > 0
            ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
            : "border-border bg-card"
        }`}>
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">
            <TriangleAlert className="h-3 w-3" /> Overdue Amount
          </p>
          <p className={`num mt-1 text-lg font-semibold ${
            Number(stats.totalOverdue) > 0 ? "text-rose-900 dark:text-rose-100" : "text-foreground"
          }`}>
            {formatINR(stats.totalOverdue)}
          </p>
          <p className="text-[11px] text-muted-foreground">Overdue installments/interest</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Loans</p>
          <p className="num mt-1 text-xl font-semibold">{stats.totalLoans}</p>
          <p className="text-[11px] text-muted-foreground">Active + closed accounts</p>
        </div>
      </div>

      {/* Customer Info Card */}
      {(customer.address || customer.notes) && (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</p>
              <p className="mt-1 text-sm">{customer.address || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Internal notes</p>
              <p className="mt-1 whitespace-pre-line text-sm">{customer.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Tabs for Loans */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All Loans
              <span className="text-[11px] bg-background/30 px-1.5 py-0.5 rounded-full">{loans.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("thavanai")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "thavanai"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <ReceiptIndianRupee className="h-3.5 w-3.5" /> Thavanai
              <span className="text-[11px] bg-white/25 px-1.5 py-0.5 rounded-full">{thavanaiLoans.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("vatti")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "vatti"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Percent className="h-3.5 w-3.5" /> Vatti
              <span className="text-[11px] bg-white/25 px-1.5 py-0.5 rounded-full">{monthlyVattiLoans.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("runVati")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "runVati"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Coins className="h-3.5 w-3.5" /> Run Vati
              <span className="text-[11px] bg-white/25 px-1.5 py-0.5 rounded-full">{(weeklyRunVatiLoans ?? []).length}</span>
            </button>
          </div>

          <Button asChild size="sm">
            <Link
              href={`/loans/new?customerId=${customer.id}${
                activeTab === "vatti"
                  ? "&category=MONTHLY_VATTI"
                  : activeTab === "runVati"
                    ? "&category=WEEKLY_RUN_VATI"
                    : activeTab === "thavanai"
                      ? "&category=THAVANAI"
                      : ""
              }`}
            >
              + New loan for {customer.fullName}
            </Link>
          </Button>
        </div>

        {displayedLoans.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={`No ${activeTab === "all" ? "" : activeTab === "runVati" ? "Run Vati" : activeTab === "vatti" ? "Vatti" : "Thavanai"} loans for this customer`}
            description="Create an account under any loan category without restrictions."
            actionHref={`/loans/new?customerId=${customer.id}`}
            actionLabel="Create loan"
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {displayedLoans.map((loan) => (
              <Card key={loan.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/loans/${loan.id}`} className="font-semibold hover:underline">
                          {loan.reference}
                        </Link>
                        <LoanCategoryBadge category={loan.category} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {loan.category === "THAVANAI"
                          ? `${FREQUENCY_LABELS[loan.frequency]} · ${loan.installmentCount} × ${formatINR(loan.installmentAmount)}`
                          : loan.category === "MONTHLY_VATTI"
                          ? `${loan.interestRate}% / month · ${INTEREST_CALCULATION_METHOD_LABELS[loan.interestType ?? "FLAT_SIMPLE"]}`
                          : `${loan.interestRate}% / week · ${INTEREST_CALCULATION_METHOD_LABELS[loan.interestType ?? "FLAT_SIMPLE"]}`}
                      </p>
                    </div>
                    <LoanStatusBadge status={loan.status} />
                  </div>

                  {loan.category === "THAVANAI" ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Repayment</p>
                        <p className="num font-medium">{formatINR(loan.totalRepayment)}</p>
                        <p className="text-[10px] text-muted-foreground">Disb: {formatINR(loan.netDisbursed)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Collected</p>
                        <p className="num font-medium text-emerald-700 dark:text-emerald-400">{formatINR(loan.collected)}</p>
                        <p className="text-[10px] text-muted-foreground">Ded: {formatINR(loan.deductionAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                        <p className="num font-semibold text-primary">{formatINR(loan.outstanding)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Principal</p>
                        <p className="num font-medium">{formatINR(loan.nominalAmount)}</p>
                        <p className="text-[10px] text-muted-foreground">Paid: {formatINR(loan.principalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outst. Prin.</p>
                        <p className="num font-semibold">{formatINR(loan.outstandingPrincipal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pend. Interest</p>
                        <p className="num font-medium text-amber-700 dark:text-amber-400">{formatINR(loan.pendingInterest)}</p>
                        <p className="text-[10px] text-muted-foreground">Paid: {formatINR(loan.interestPaid)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Outst.</p>
                        <p className="num font-semibold text-primary">{formatINR(loan.outstanding)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                  <div className="text-muted-foreground">
                    {loan.overdueCount > 0 ? (
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                        <TriangleAlert className="h-3.5 w-3.5" /> {loan.overdueCount} overdue · {formatINR(loan.overdueAmount)}
                      </span>
                    ) : loan.nextDueDate ? (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" /> Next {formatDateISO(loan.nextDueDate)} · {formatINR(loan.nextDueAmount ?? "0")}
                      </span>
                    ) : (
                      <span>No active dues</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/loans/${loan.id}`}>
                        <FileText className="h-3.5 w-3.5" /> View
                      </Link>
                    </Button>
                    {loan.status === "ACTIVE" && (
                      <Button asChild size="sm">
                        <Link href={`/loans/${loan.id}#record`}>
                          <ReceiptIndianRupee className="h-3.5 w-3.5" /> Pay
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Chronological Combined Customer Ledger */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Chronological Combined Ledger</CardTitle>
            <p className="text-xs text-muted-foreground">
              All payment transactions across Thavanai, Vatti, and Run Vati accounts in chronological order.
            </p>
          </div>
          <Badge variant="outline">{payments.length} transactions</Badge>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded for this customer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Receipt</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="px-2 py-2 text-left">Loan</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Breakdown / Balances</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-left">Mode</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => {
                    const isVatti = payment.loan.category === "MONTHLY_VATTI" || payment.loan.category === "WEEKLY_RUN_VATI" || payment.loan.category === "WEEKLY_RENDU_VATTI";
                    return (
                      <tr key={payment.id} className={payment.status === "VOIDED" ? "text-muted-foreground opacity-70" : undefined}>
                        <td className="px-2 py-2.5">
                          <Link href={`/payments/${payment.id}`} className="num text-xs font-semibold hover:underline">
                            {payment.receiptNumber}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5">
                          <LoanCategoryBadge category={payment.loan.category} className="text-[10px]" />
                        </td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground">
                          <Link href={`/loans?q=${payment.loan.reference}`} className="hover:underline">
                            {payment.loan.reference}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-xs">{formatDateTimeIndia(payment.paidAt)}</td>
                        <td className="px-2 py-2.5 text-xs">
                          {isVatti ? (
                            <div>
                              <span className="font-medium">Prin: {formatINR(payment.principalAmount ?? "0")}</span>
                              <span className="mx-1 text-muted-foreground">·</span>
                              <span className="font-medium text-amber-700 dark:text-amber-400">Int: {formatINR(payment.interestAmount ?? "0")}</span>
                              {payment.newPrincipal && (
                                <p className="text-[10px] text-muted-foreground">
                                  Bal: {formatINR(payment.newPrincipal)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Installment repayment</span>
                          )}
                        </td>
                        <td className={`num px-2 py-2.5 text-right font-semibold ${payment.status === "VOIDED" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {formatINR(payment.amount)}
                        </td>
                        <td className="px-2 py-2.5 text-xs">{PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}</td>
                        <td className="px-2 py-2.5">
                          <PaymentStatusBadge status={payment.status} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/payments/${payment.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">
          <CalendarClock className="mr-1 h-3 w-3" /> Customer registered {formatDateISO(customer.createdAt.toISOString().slice(0, 10))}
        </Badge>
        <Badge variant="outline">All amounts in INR (₹)</Badge>
        <Badge variant="outline">Multi-loan accounts maintained separately</Badge>
      </div>
    </div>
  );
}
