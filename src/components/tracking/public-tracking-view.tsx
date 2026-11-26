"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Coins, Landmark, Percent, ReceiptIndianRupee, ShieldCheck, Wallet } from "lucide-react";
import type {
  PublicScheduleStatus,
  PublicThavanaiLoan,
  PublicTrackedLoan,
  PublicTrackingData,
  PublicVattiLoan,
} from "@/lib/services/tracking";
import { FREQUENCY_LABELS, LOAN_CATEGORY_LABELS, LOAN_CATEGORY_TONES, LOAN_STATUS_LABELS, LOAN_STATUS_TONES } from "@/lib/constants";
import { formatDateISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function StatusPill({ status }: { status: string }) {
  const tone = LOAN_STATUS_TONES[status] ?? "bg-muted text-muted-foreground";
  const label = LOAN_STATUS_LABELS[status] ?? status;
  return <Badge className={tone}>{label}</Badge>;
}

const SCHEDULE_STATUS_META: Record<PublicScheduleStatus, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  PARTIALLY_PAID: { label: "Partially paid", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  OVERDUE: { label: "Overdue", className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
};

const SCHEDULE_PREVIEW_COUNT = 8;

function PaymentSchedule({ loan }: { loan: PublicThavanaiLoan }) {
  const [expanded, setExpanded] = React.useState(false);
  const { schedule, scheduleSummary } = loan;
  const hasMore = schedule.length > SCHEDULE_PREVIEW_COUNT;
  const visibleRows = expanded || !hasMore ? schedule : schedule.slice(0, SCHEDULE_PREVIEW_COUNT);

  const summaryItems = [
    { label: "Installments", value: String(scheduleSummary.totalInstallments) },
    { label: "Paid", value: String(scheduleSummary.paidInstallments), tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "Pending", value: String(scheduleSummary.pendingInstallments) },
    { label: "Overdue", value: String(scheduleSummary.overdueInstallments), tone: "text-rose-700 dark:text-rose-400" },
    { label: "Scheduled", value: formatINR(scheduleSummary.totalScheduledAmount) },
    { label: "Paid amount", value: formatINR(scheduleSummary.totalPaid), tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "Remaining", value: formatINR(scheduleSummary.remainingAmount), tone: "text-primary" },
  ];

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Schedule</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">View your installment due dates and payment status.</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className={`num mt-0.5 truncate text-sm font-semibold ${item.tone ?? "text-foreground"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {schedule.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          No installment schedule available yet.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[3rem_1fr_7rem_7rem] items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>#</span>
              <span>Due date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-border">
              {visibleRows.map((row) => {
                const meta = SCHEDULE_STATUS_META[row.status];
                return (
                  <div key={row.sequence} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="num w-6 shrink-0 text-xs text-muted-foreground">{row.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{formatDateISO(row.dueDate)}</p>
                      <p className="num mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                        {formatINR(row.scheduledAmount)}
                        {row.status === "PARTIALLY_PAID" && (
                          <span className="ml-1">· {formatINR(row.paidAmount)} paid</span>
                        )}
                      </p>
                    </div>
                    <span className="num hidden shrink-0 text-sm font-semibold text-foreground sm:block">
                      {formatINR(row.scheduledAmount)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" /> Show full schedule ({schedule.length} installments)
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}


function ThavanaiCard({ loan }: { loan: PublicThavanaiLoan }) {
  return (
    <Card className="overflow-hidden border-teal-200/80 dark:border-teal-900/60">
      <CardHeader className="border-b border-border/60 bg-teal-50/40 pb-4 dark:bg-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${LOAN_CATEGORY_TONES.THAVANAI}`}>
                <ReceiptIndianRupee className="h-3 w-3" /> {LOAN_CATEGORY_LABELS.THAVANAI}
              </span>
              <span className="num text-xs font-medium text-muted-foreground">{loan.reference}</span>
            </div>
            <CardTitle className="mt-2 text-lg">
              {FREQUENCY_LABELS[loan.frequency] ?? loan.frequency} Installment Plan
            </CardTitle>
          </div>
          <StatusPill status={loan.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Original Loan</p>
            <p className="num mt-1 text-base font-semibold">{formatINR(loan.originalLoanAmount)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installment</p>
            <p className="num mt-1 text-base font-semibold">
              {formatINR(loan.installmentAmount)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {(FREQUENCY_LABELS[loan.frequency] ?? loan.frequency).toLowerCase()}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Total Paid</p>
            <p className="num mt-1 text-base font-bold text-emerald-700 dark:text-emerald-300">{formatINR(loan.totalPaid)}</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-accent/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="num mt-1 text-base font-bold text-primary">{formatINR(loan.remainingAmount)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next Due Date</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
              {loan.nextDueDate ? (
                <>
                  <CalendarClock className="h-3.5 w-3.5 text-primary" />
                  {formatDateISO(loan.nextDueDate)}
                </>
              ) : loan.status === "COMPLETED" ? (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Settled
                </span>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">
              Payment progress: <span className="num font-semibold">{loan.progressPercent}%</span>
            </span>
            <span className="text-muted-foreground">
              <span className="num font-semibold text-foreground">{loan.installmentsPaid}</span> paid ·{" "}
              <span className="num font-semibold text-foreground">{loan.installmentsRemaining}</span> remaining (of{" "}
              {loan.installmentsTotal})
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${loan.progressPercent}%` }} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment History ({loan.payments.length})
          </h3>
          {loan.payments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {loan.payments.map((payment, index) => (
                <div key={`${payment.paidAtLabel}-${index}`} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <span className="text-xs text-muted-foreground">{payment.paidAtLabel}</span>
                  <span className="num font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(payment.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <PaymentSchedule loan={loan} />
      </CardContent>
    </Card>
  );
}

function InterestLoanCard({ loan }: { loan: PublicVattiLoan }) {
  const isRunVati = loan.category === "WEEKLY_RUN_VATI";
  const categoryLabel = LOAN_CATEGORY_LABELS[loan.category] ?? loan.category;
  const toneClass = LOAN_CATEGORY_TONES[loan.category] ?? "";

  return (
    <Card className={`overflow-hidden ${isRunVati ? "border-amber-200/80 dark:border-amber-900/60" : "border-blue-200/80 dark:border-blue-900/60"}`}>
      <CardHeader className={`border-b border-border/60 pb-4 ${isRunVati ? "bg-amber-50/40 dark:bg-amber-950/20" : "bg-blue-50/40 dark:bg-blue-950/20"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneClass}`}>
                {isRunVati ? <Coins className="h-3 w-3" /> : <Percent className="h-3 w-3" />}
                {categoryLabel}
              </span>
              <span className="num text-xs font-medium text-muted-foreground">{loan.reference}</span>
            </div>
            <CardTitle className="mt-2 text-lg">
              {isRunVati ? "Weekly Interest Account" : "Monthly Interest Account"}
              {loan.interestRate ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({loan.interestRate}% / {isRunVati ? "week" : "month"})
                </span>
              ) : null}
            </CardTitle>
          </div>
          <StatusPill status={loan.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Original Principal</p>
            <p className="num mt-1 text-base font-semibold">{formatINR(loan.originalPrincipal)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Interest Collected</p>
            <p className="num mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-300">
              {formatINR(loan.totalInterestCollected)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-[11px] uppercase tracking-wide text-amber-800 dark:text-amber-300">Pending Interest</p>
            <p className="num mt-1 text-base font-bold text-amber-900 dark:text-amber-200">{formatINR(loan.pendingInterest)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Principal Repaid</p>
            <p className="num mt-1 text-base font-semibold">{formatINR(loan.principalRepaid)}</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-accent/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining Principal</p>
            <p className="num mt-1 text-base font-bold text-primary">{formatINR(loan.remainingPrincipal)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next Cycle Due</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
              {loan.nextDueDate ? (
                <>
                  <CalendarClock className="h-3.5 w-3.5 text-primary" />
                  {formatDateISO(loan.nextDueDate)}
                </>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {isRunVati
            ? "Weekly interest payments cover interest charges only and do not reduce the principal balance."
            : "Monthly interest payments cover interest charges only and do not reduce the principal balance."}
        </p>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isRunVati ? "Weekly Interest Payment History" : "Interest Payment History"} ({loan.payments.length})
          </h3>
          {loan.payments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {loan.payments.map((payment, index) => (
                <div key={`${payment.paidAtLabel}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{payment.paidAtLabel}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Interest: <span className="num font-medium text-amber-700 dark:text-amber-300">{formatINR(payment.interestAmount)}</span>
                      {" · "}
                      Principal: <span className="num font-medium text-foreground">{formatINR(payment.principalAmount)}</span>
                    </p>
                  </div>
                  <span className="num font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(payment.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PublicTrackingView({ data }: { data: PublicTrackingData }) {
  const [selectedRef, setSelectedRef] = React.useState<string>("ALL");

  const visibleLoans: PublicTrackedLoan[] = React.useMemo(() => {
    if (selectedRef === "ALL") return data.loans;
    return data.loans.filter((loan) => loan.reference === selectedRef);
  }, [data.loans, selectedRef]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Siva Thul Finance – Payment Status
                </h1>
                <p className="text-xs text-muted-foreground sm:text-sm">View your loan repayment progress</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Read-only view
            </Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer Name</p>
              <p className="mt-1 break-words text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                {data.customerName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Loans</p>
              <p className="num mt-0.5 text-sm font-medium text-foreground">
                {data.summary.activeLoans} active · {data.summary.totalLoans} total
              </p>
            </div>
          </div>

          {data.summary.totalLoans > 0 && (
            <div className="mt-4 grid gap-2.5 rounded-xl bg-muted/40 p-3.5 sm:grid-cols-3">
              {data.summary.hasThavanai && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Thavanai Remaining</p>
                  <p className="num mt-0.5 text-sm font-semibold">{formatINR(data.summary.thavanaiRemaining)}</p>
                </div>
              )}
              {data.summary.hasInterestLoans && (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining Principal</p>
                    <p className="num mt-0.5 text-sm font-semibold">{formatINR(data.summary.vattiRemainingPrincipal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending Interest</p>
                    <p className="num mt-0.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                      {formatINR(data.summary.vattiPendingInterest)}
                    </p>
                  </div>
                </>
              )}
              <div className={data.summary.hasThavanai && data.summary.hasInterestLoans ? "sm:col-span-3 border-t border-border/60 pt-2 flex items-center justify-between" : ""}>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Combined Remaining Balance</p>
                <p className="num mt-0.5 text-base font-bold text-primary">{formatINR(data.summary.totalRemaining)}</p>
              </div>
            </div>
          )}
        </header>

        {/* Simple loan selector when customer has multiple loans */}
        {data.loans.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedRef("ALL")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selectedRef === "ALL"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
            >
              All Loans ({data.loans.length})
            </button>
            {data.loans.map((loan) => (
              <button
                key={loan.reference}
                type="button"
                onClick={() => setSelectedRef(loan.reference)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selectedRef === loan.reference
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
              >
                {LOAN_CATEGORY_LABELS[loan.category] ?? loan.category} · {loan.reference}
              </button>
            ))}
          </div>
        )}

        {/* Loan Cards */}
        {visibleLoans.length === 0 ? (
          <Card className="p-8 text-center">
            <Landmark className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No active or completed loans to display</p>
            <p className="mt-1 text-xs text-muted-foreground">Please check back later or contact your lender for details.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {visibleLoans.map((loan) =>
              loan.category === "THAVANAI" ? (
                <ThavanaiCard key={loan.reference} loan={loan} />
              ) : (
                <InterestLoanCard key={loan.reference} loan={loan} />
              ),
            )}
          </div>
        )}

        <footer className="mt-8 text-center text-[11px] text-muted-foreground">
          Refresh this page anytime to see your latest updated balances and payment history.
        </footer>
      </div>
    </div>
  );
}
