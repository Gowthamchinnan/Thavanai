import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Landmark,
  Percent,
  ReceiptIndianRupee,
  TriangleAlert,
  User,
  Coins,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getLoanDetail } from "@/lib/services/loans";
import { getSettings } from "@/lib/services/settings";
import { formatINR, percent } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia, indiaDateTimeInputNow } from "@/lib/dates";
import {
  FREQUENCY_LABELS,
  INTEREST_CALCULATION_METHOD_LABELS,
  LOAN_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
} from "@/lib/constants";
import { installmentOutstanding } from "@/lib/installments";
import { buildPaymentWhatsAppMessage, buildStatementWhatsAppMessage } from "@/lib/whatsapp";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LoanCategoryBadge,
  LoanStatusBadge,
  InstallmentStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import { LoanActionButtons } from "@/components/shared/loan-action-buttons";
import { PaymentForm } from "@/components/forms/payment-form";
import { WhatsAppShareButton, DownloadPdfButton } from "@/components/shared/whatsapp-share";
import { VoidPaymentButton } from "@/components/shared/void-payment-button";

export const metadata: Metadata = { title: "Loan Detail" };
export const dynamic = "force-dynamic";

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getLoanDetail(id);
  if (!detail) notFound();
  const settings = await getSettings();
  const { loan, customer, stats, installments, interestPeriods, payments } = detail;

  const isThavanai = loan.category === "THAVANAI";
  const isMonthlyVatti = loan.category === "MONTHLY_VATTI";

  const statementMessage = buildStatementWhatsAppMessage({
    businessName: settings.businessName,
    customerName: customer.fullName,
    loanReference: loan.reference,
    category: loan.category,
    totalRepayment: isThavanai ? formatINR(loan.totalRepayment) : undefined,
    totalPaid: formatINR(stats.collected),
    remainingBalance: formatINR(stats.outstanding),
    outstandingPrincipal: !isThavanai ? formatINR(stats.outstandingPrincipal) : undefined,
    pendingInterest: !isThavanai ? formatINR(stats.interestPending) : undefined,
    nextDueAmount: stats.nextDueAmount ? formatINR(stats.nextDueAmount) : null,
    nextDueDate: stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null,
    loanStatus: LOAN_STATUS_LABELS[loan.status] ?? loan.status,
  });

  const progress = isThavanai
    ? Math.min(100, percent(stats.collected, loan.totalRepayment))
    : Math.min(100, percent(stats.principalPaid, loan.nominalAmount));

  function paymentMessage(payment: (typeof payments)[number]): string {
    return buildPaymentWhatsAppMessage({
      businessName: settings.businessName,
      customerName: customer.fullName,
      loanReference: loan.reference,
      category: loan.category,
      receiptNumber: payment.receiptNumber,
      amount: formatINR(payment.amount),
      principalAmount: payment.principalAmount ? formatINR(payment.principalAmount) : null,
      interestAmount: payment.interestAmount ? formatINR(payment.interestAmount) : null,
      paymentDate: formatDateTimeIndia(payment.paidAt),
      totalPaid: formatINR(stats.collected),
      remainingBalance: formatINR(stats.outstanding),
      outstandingPrincipal: !isThavanai ? formatINR(payment.newPrincipal ?? stats.outstandingPrincipal) : null,
      pendingInterest: !isThavanai ? formatINR(payment.newInterest ?? stats.interestPending) : null,
      nextDueAmount: stats.nextDueAmount ? formatINR(stats.nextDueAmount) : null,
      nextDueDate: stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null,
    });
  }

  const sortedInstallments = [...installments].sort((a, b) => a.sequence - b.sequence);
  const sortedInterestPeriods = [...interestPeriods].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-6">
      <PageHeader
        title={loan.reference}
        description={
          isThavanai
            ? `${customer.fullName} · ${customer.mobile} · ${FREQUENCY_LABELS[loan.frequency]} installment schedule`
            : isMonthlyVatti
            ? `${customer.fullName} · ${customer.mobile} · Monthly interest @ ${loan.interestRate}% / month`
            : `${customer.fullName} · ${customer.mobile} · Weekly Run Vati @ ${loan.interestRate}% / week`
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/loans">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <DownloadPdfButton href={`/api/loans/${loan.id}/statement`} label="Statement PDF" />
            <WhatsAppShareButton
              mobile={customer.mobile}
              message={statementMessage}
              pdfUrl={`/api/loans/${loan.id}/statement`}
              fileName={`${loan.reference}-statement.pdf`}
              label="Share statement"
            />
            <LoanActionButtons loanId={loan.id} reference={loan.reference} status={loan.status} />
          </>
        }
      />

      {/* Badges bar */}
      <div className="flex flex-wrap items-center gap-2">
        <LoanCategoryBadge category={loan.category} />
        <LoanStatusBadge status={loan.status} />
        <Badge variant="outline">
          <User className="mr-1 h-3 w-3" />
          <Link href={`/customers/${customer.id}`} className="hover:underline">
            {customer.fullName} ({customer.code})
          </Link>
        </Badge>
        {isThavanai ? (
          <>
            <Badge variant="outline">{FREQUENCY_LABELS[loan.frequency]}</Badge>
            <Badge variant="outline">{loan.installmentCount} installments</Badge>
          </>
        ) : isMonthlyVatti ? (
          <>
            <Badge variant="outline">
              <Percent className="mr-1 h-3 w-3" /> {loan.interestRate?.toString()}% / month
            </Badge>
            <Badge variant="outline">
              Day {loan.collectionDay ?? 1} of month
            </Badge>
          </>
        ) : (
          <>
            <Badge variant="outline">
              <Coins className="mr-1 h-3 w-3" /> {loan.interestRate?.toString()}% / week
            </Badge>
            <Badge variant="outline">
              Day {loan.collectionDay ?? 1} of week
            </Badge>
          </>
        )}
        {loan.status === "ACTIVE" && stats.overdueCount > 0 ? (
          <Badge variant="destructive">
            <TriangleAlert className="mr-1 h-3 w-3" /> {stats.overdueCount} overdue · {formatINR(stats.overdueAmount)}
          </Badge>
        ) : null}
      </div>

      {/* Key Stats Cards */}
      {isThavanai ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nominal loan</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.nominalAmount)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Upfront deduction</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.deductionAmount)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net cash disbursed</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.netDisbursed)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contractual repayment</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.totalRepayment)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total collected</p>
            <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(stats.collected)}</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-accent/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining balance</p>
            <p className="num mt-1 text-lg font-bold text-primary">{formatINR(stats.outstanding)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected gross margin</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(stats.expectedGrossMargin)}</p>
            <p className="text-[10px] text-muted-foreground">Deduction / margin spread</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</p>
            <p className={`num mt-1 text-lg font-semibold ${stats.overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
              {formatINR(stats.overdueAmount)}
            </p>
            <p className="text-[10px] text-muted-foreground">{stats.overdueCount} installment(s)</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">1. Original Principal</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.nominalAmount)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">2. Upfront Deduction</p>
            <p className="num mt-1 text-lg font-semibold">{formatINR(loan.deductionAmount)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">3. Actual Cash Disbursed</p>
            <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(loan.netDisbursed)}</p>
            <p className="text-[10px] text-muted-foreground">Principal - Upfront deduction</p>
          </div>

          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">4. {isMonthlyVatti ? "Monthly" : "Weekly"} Interest</p>
            <p className="num mt-1 text-lg font-semibold">{loan.interestRate ? `${loan.interestRate.toString()}%` : "—"} / {isMonthlyVatti ? "month" : "week"}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">5. Total Interest Collected</p>
            <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(stats.interestPaid)}</p>
            <p className="text-[10px] text-muted-foreground">Interest never reduces principal</p>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-[11px] uppercase tracking-wide text-amber-800 dark:text-amber-300">6. Pending Interest</p>
            <p className="num mt-1 text-lg font-bold text-amber-900 dark:text-amber-200">{formatINR(stats.interestPending)}</p>
            <p className="text-[10px] text-muted-foreground">Accrued unpaid interest</p>
          </div>

          <div className="card-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">7. Total Principal Repaid</p>
            <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(stats.principalPaid)}</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-accent/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">8. Remaining Principal</p>
            <p className="num mt-1 text-xl font-bold text-primary">{formatINR(stats.outstandingPrincipal)}</p>
            <p className="text-[10px] text-muted-foreground">Original principal - Principal repaid</p>
          </div>
          <div className="card-surface p-4 flex flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">9. Loan Status</p>
              <div className="mt-2 flex items-center gap-2">
                <LoanStatusBadge status={loan.status} className="text-xs px-2.5 py-1" />
                <span className="text-xs text-muted-foreground">
                  {loan.status === "ACTIVE" ? "Active loan" : loan.status === "COMPLETED" ? "Closed (Fully settled)" : loan.status}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Total Exposure: {formatINR(stats.outstanding)} (Prin + Int)
            </p>
          </div>
        </div>
      )}

      {/* Progress Bar Card */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {isThavanai ? (
              <>
                <span className="num font-semibold text-foreground">{progress}%</span> of contractual repayment collected ({formatINR(stats.collected)} / {formatINR(loan.totalRepayment)})
              </>
            ) : (
              <>
                <span className="num font-semibold text-foreground">{progress}%</span> of principal repaid ({formatINR(stats.principalPaid)} / {formatINR(loan.nominalAmount)})
              </>
            )}
          </span>
          <span className="text-muted-foreground">
            {stats.paidInstallments} of {loan.installmentCount} {isThavanai ? "installments" : "interest cycles"} settled
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      {/* Agreed Loan Terms Card & Collection Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agreed loan terms</CardTitle>
            <p className="text-xs text-muted-foreground">
              {loan.activatedAt
                ? `Activated ${formatDateTimeIndia(loan.activatedAt)}. Category: ${loan.category}.`
                : "Draft — schedule will be generated upon activation."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Loan Category</p>
              <p className="font-semibold">{loan.category}</p>
            </div>
            {isThavanai ? (
              <>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installment amount</p>
                  <p className="num font-medium">{formatINR(loan.installmentAmount)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Schedule</p>
                  <p className="font-medium">
                    {FREQUENCY_LABELS[loan.frequency]} · {loan.installmentCount} installments
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">First due date</p>
                  <p className="font-medium">
                    {loan.firstDueDate ? formatDateISO(loan.firstDueDate.toISOString().slice(0, 10)) : "—"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Interest Rate</p>
                  <p className="num font-semibold text-primary">
                    {loan.interestRate?.toString()}% {isMonthlyVatti ? "per month" : "per week"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Calculation Method</p>
                  <p className="font-medium">
                    {INTEREST_CALCULATION_METHOD_LABELS[loan.interestType ?? "FLAT_SIMPLE"]}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collection Day</p>
                  <p className="font-medium">
                    {isMonthlyVatti ? `Day ${loan.collectionDay ?? 1} of each month` : `Day ${loan.collectionDay ?? 1} of each week`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Maturity Date</p>
                  <p className="font-medium">
                    {loan.maturityDate ? formatDateISO(loan.maturityDate.toISOString().slice(0, 10)) : "Open-ended / flexible"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Principal Arrangement</p>
                  <p className="font-medium capitalize">{loan.principalRepaymentArrangement || "Flexible partial/full"}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Start date</p>
              <p className="font-medium">{formatDateISO(loan.startDate.toISOString().slice(0, 10))}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disbursement date</p>
              <p className="font-medium">
                {loan.disbursementDate ? formatDateISO(loan.disbursementDate.toISOString().slice(0, 10)) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next due</p>
              <p className="font-medium">
                {stats.nextDueDate
                  ? `${formatDateISO(stats.nextDueDate)} · ${formatINR(stats.nextDueAmount ?? "0")}`
                  : "Fully repaid / up-to-date"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="font-medium">{formatDateTimeIndia(loan.createdAt)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Collection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash received</p>
              <p className="num text-lg font-semibold">{formatINR(stats.collected)}</p>
              {!isThavanai && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Prin: {formatINR(stats.principalPaid)} | Int: {formatINR(stats.interestPaid)}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-accent/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining balance</p>
              <p className="num text-lg font-bold text-primary">{formatINR(stats.outstanding)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Manual cash collections only. No payment gateway or automatic UPI is connected.
            </p>
            {loan.terms && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contractual terms</p>
                <p className="mt-1 whitespace-pre-line text-xs">{loan.terms}</p>
              </div>
            )}
            {loan.notes && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Internal notes</p>
                <p className="mt-1 whitespace-pre-line text-xs">{loan.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Record Payment Form */}
      {loan.status === "ACTIVE" && (
        <Card id="record" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIndianRupee className="h-4 w-4 text-primary" /> Record Manual Payment
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {customer.fullName} · {loan.reference} ({loan.category}). All collections are manual entries.
            </p>
          </CardHeader>
          <CardContent>
            <PaymentForm
              loanId={loan.id}
              loanReference={loan.reference}
              customerName={customer.fullName}
              category={loan.category}
              outstanding={stats.outstanding}
              installmentAmount={loan.installmentAmount ? loan.installmentAmount.toString() : "0"}
              principalOutstanding={stats.outstandingPrincipal}
              interestPending={stats.interestPending}
              nextDueDate={stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null}
              nowInput={indiaDateTimeInputNow()}
              loanStatus={loan.status}
            />
          </CardContent>
        </Card>
      )}

      {/* Schedule Table (Installment schedule for Thavanai, Interest periods schedule for Vatti/RV) */}
      {isThavanai ? (
        <Card>
          <CardHeader>
            <CardTitle>Installment schedule</CardTitle>
            <p className="text-xs text-muted-foreground">
              Final installment absorbs any remainder. Status is recomputed from payments and the current date.
            </p>
          </CardHeader>
          <CardContent>
            {sortedInstallments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                This loan is a draft. Activate it to generate the installment schedule.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Due date</th>
                      <th className="px-2 py-2 text-right">Scheduled</th>
                      <th className="px-2 py-2 text-right">Paid</th>
                      <th className="px-2 py-2 text-right">Outstanding</th>
                      <th className="px-2 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedInstallments.map((installment) => (
                      <tr key={installment.id} className={installment.status === "OVERDUE" ? "bg-rose-50/50 dark:bg-rose-950/10" : undefined}>
                        <td className="px-2 py-2.5 text-muted-foreground">{installment.sequence}</td>
                        <td className="px-2 py-2.5">{formatDateISO(installment.dueDate.toISOString().slice(0, 10))}</td>
                        <td className="num px-2 py-2.5 text-right">{formatINR(installment.scheduledAmount)}</td>
                        <td className="num px-2 py-2.5 text-right">{formatINR(installment.paidAmount)}</td>
                        <td className="num px-2 py-2.5 text-right font-medium">
                          {formatINR(installmentOutstanding(installment.scheduledAmount, installment.paidAmount))}
                        </td>
                        <td className="px-2 py-2.5">
                          <InstallmentStatusBadge status={installment.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Interest cycle schedule</CardTitle>
            <p className="text-xs text-muted-foreground">
              Calculated cycles ({isMonthlyVatti ? "monthly" : "weekly"}). Collections are allocated to the oldest unpaid interest cycles first.
            </p>
          </CardHeader>
          <CardContent>
            {sortedInterestPeriods.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                This loan is a draft. Activate it to generate the interest schedule.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Cycle #</th>
                      <th className="px-2 py-2 text-left">Period Range</th>
                      <th className="px-2 py-2 text-left">Due Date</th>
                      <th className="px-2 py-2 text-right">Principal Base</th>
                      <th className="px-2 py-2 text-right">Rate</th>
                      <th className="px-2 py-2 text-right">Scheduled Interest</th>
                      <th className="px-2 py-2 text-right">Paid Interest</th>
                      <th className="px-2 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedInterestPeriods.map((period) => (
                      <tr key={period.id} className={period.status === "OVERDUE" ? "bg-rose-50/50 dark:bg-rose-950/10" : undefined}>
                        <td className="px-2 py-2.5 text-muted-foreground">#{period.sequence}</td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground">
                          {formatDateISO(period.fromDate.toISOString().slice(0, 10))} → {formatDateISO(period.dueDate.toISOString().slice(0, 10))}
                        </td>
                        <td className="px-2 py-2.5 font-medium">{formatDateISO(period.dueDate.toISOString().slice(0, 10))}</td>
                        <td className="num px-2 py-2.5 text-right">{formatINR(period.principalBase)}</td>
                        <td className="num px-2 py-2.5 text-right text-xs">{period.interestRate?.toString()}%</td>
                        <td className="num px-2 py-2.5 text-right font-medium">{formatINR(period.scheduledAmount)}</td>
                        <td className="num px-2 py-2.5 text-right text-emerald-700 dark:text-emerald-400 font-medium">
                          {formatINR(period.paidAmount)}
                        </td>
                        <td className="px-2 py-2.5">
                          <InstallmentStatusBadge status={period.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Collection Ledger Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Collection ledger</CardTitle>
            <p className="text-xs text-muted-foreground">
              Immutable posted payments; manual corrections use auditable reversals.
            </p>
          </div>
          <Badge variant="outline">{payments.length} entries</Badge>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded for this loan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Receipt</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-left">Breakdown / Allocation</th>
                    <th className="px-2 py-2 text-left">Balances Snapshot</th>
                    <th className="px-2 py-2 text-left">Mode</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment.id} className={payment.status === "VOIDED" ? "text-muted-foreground opacity-70" : undefined}>
                      <td className="px-2 py-2.5">
                        <Link href={`/payments/${payment.id}`} className="num text-xs font-semibold hover:underline">
                          {payment.receiptNumber}
                        </Link>
                        {payment.notes && <p className="max-w-[160px] truncate text-[10px] text-muted-foreground">{payment.notes}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{formatDateTimeIndia(payment.paidAt)}</td>
                      <td className={`num px-2 py-2.5 text-right font-semibold ${payment.status === "VOIDED" ? "line-through" : ""}`}>
                        {formatINR(payment.amount)}
                      </td>
                      <td className="px-2 py-2.5 text-xs">
                        {isThavanai ? (
                          payment.allocations.length > 0 ? (
                            payment.allocations.map((a) => `#${a.installment.sequence} ${formatINR(a.amount)}`).join(" · ")
                          ) : (
                            "—"
                          )
                        ) : (
                          <div>
                            <span className="font-medium">Prin: {formatINR(payment.principalAmount ?? "0")}</span>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="font-medium text-amber-700 dark:text-amber-400">Int: {formatINR(payment.interestAmount ?? "0")}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {payment.newPrincipal != null ? (
                          <div>
                            <span>Prin: {formatINR(payment.previousPrincipal ?? "0")} → {formatINR(payment.newPrincipal)}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}</td>
                      <td className="px-2 py-2.5">
                        <PaymentStatusBadge status={payment.status} />
                        {payment.reversal && (
                          <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-rose-600 dark:text-rose-400">
                            {payment.reversal.reason}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/payments/${payment.id}`}>
                              <FileText className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {payment.status === "POSTED" && (
                            <>
                              <WhatsAppShareButton
                                mobile={customer.mobile}
                                message={paymentMessage(payment)}
                                pdfUrl={`/api/payments/${payment.id}/receipt`}
                                fileName={`${payment.receiptNumber}.pdf`}
                                label=""
                                variant="ghost"
                                size="icon"
                              />
                              <VoidPaymentButton
                                paymentId={payment.id}
                                receiptNumber={payment.receiptNumber}
                                amount={formatINR(payment.amount)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Landmark className="h-3.5 w-3.5" /> Manual cash collections only. Payment modes other than cash are recorded for
        bookkeeping and are not processed online.
      </p>
    </div>
  );
}
