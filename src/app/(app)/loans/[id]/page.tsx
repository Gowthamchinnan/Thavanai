import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Landmark,
  ReceiptIndianRupee,
  TriangleAlert,
  User,
} from "lucide-react";
import { getLoanDetail } from "@/lib/services/loans";
import { getSettings } from "@/lib/services/settings";
import { formatINR, percent } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia, indiaDateTimeInputNow } from "@/lib/dates";
import {
  FREQUENCY_LABELS,
  LOAN_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
} from "@/lib/constants";
import { installmentOutstanding } from "@/lib/installments";
import { buildPaymentWhatsAppMessage, buildStatementWhatsAppMessage } from "@/lib/whatsapp";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoanStatusBadge, InstallmentStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { LoanActionButtons } from "@/components/shared/loan-action-buttons";
import { PaymentForm } from "@/components/forms/payment-form";
import { WhatsAppShareButton, DownloadPdfButton } from "@/components/shared/whatsapp-share";
import { VoidPaymentButton } from "@/components/shared/void-payment-button";

export const metadata: Metadata = { title: "Loan detail" };
export const dynamic = "force-dynamic";

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getLoanDetail(id);
  if (!detail) notFound();
  const settings = await getSettings();
  const { loan, customer, stats, installments, payments } = detail;

  const statementMessage = buildStatementWhatsAppMessage({
    businessName: settings.businessName,
    customerName: customer.fullName,
    loanReference: loan.reference,
    totalRepayment: formatINR(loan.totalRepayment),
    totalPaid: formatINR(stats.collected),
    remainingBalance: formatINR(stats.outstanding),
    nextDueAmount: stats.nextDueAmount ? formatINR(stats.nextDueAmount) : null,
    nextDueDate: stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null,
    loanStatus: LOAN_STATUS_LABELS[loan.status] ?? loan.status,
  });
  const progress = Math.min(100, percent(stats.collected, loan.totalRepayment));

  function paymentMessage(payment: (typeof payments)[number]): string {
    return buildPaymentWhatsAppMessage({
      businessName: settings.businessName,
      customerName: customer.fullName,
      loanReference: loan.reference,
      receiptNumber: payment.receiptNumber,
      amount: formatINR(payment.amount),
      paymentDate: formatDateTimeIndia(payment.paidAt),
      totalPaid: formatINR(stats.collected),
      remainingBalance: formatINR(stats.outstanding),
      nextDueAmount: stats.nextDueAmount ? formatINR(stats.nextDueAmount) : null,
      nextDueDate: stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null,
    });
  }

  const sortedInstallments = [...installments].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-5">
      <PageHeader
        title={loan.reference}
        description={`${customer.fullName} · ${customer.mobile} · ${FREQUENCY_LABELS[loan.frequency]} schedule`}
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

      <div className="flex flex-wrap items-center gap-2">
        <LoanStatusBadge status={loan.status} />
        <Badge variant="outline">
          <User className="mr-1 h-3 w-3" />
          <Link href={`/customers/${customer.id}`} className="hover:underline">
            {customer.fullName}
          </Link>
        </Badge>
        <Badge variant="outline">{FREQUENCY_LABELS[loan.frequency]}</Badge>
        <Badge variant="outline">{loan.installmentCount} installments</Badge>
        {loan.status === "ACTIVE" && stats.overdueCount > 0 ? (
          <Badge variant="destructive">
            <TriangleAlert className="mr-1 h-3 w-3" /> {stats.overdueCount} overdue · {formatINR(stats.overdueAmount)}
          </Badge>
        ) : null}
      </div>

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
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(stats.collected)}</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-accent/70 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining balance</p>
          <p className="num mt-1 text-lg font-semibold text-primary">{formatINR(stats.outstanding)}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected gross margin</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(stats.expectedGrossMargin)}</p>
          <p className="text-[10px] text-muted-foreground">Not guaranteed profit</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</p>
          <p className={`num mt-1 text-lg font-semibold ${stats.overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
            {formatINR(stats.overdueAmount)}
          </p>
          <p className="text-[10px] text-muted-foreground">{stats.overdueCount} installment(s)</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            <span className="num font-semibold text-foreground">{progress}%</span> of contractual repayment collected
          </span>
          <span className="text-muted-foreground">
            {stats.paidInstallments} of {loan.installmentCount} installments paid
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agreed loan terms</CardTitle>
            <p className="text-xs text-muted-foreground">
              {loan.activatedAt
                ? `Activated ${formatDateTimeIndia(loan.activatedAt)}. Terms are immutable after activation.`
                : "Draft — no schedule exists until the loan is activated."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
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
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Start date</p>
              <p className="font-medium">{formatDateISO(loan.startDate.toISOString().slice(0, 10))}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">First due date</p>
              <p className="font-medium">{formatDateISO(loan.firstDueDate.toISOString().slice(0, 10))}</p>
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
                  : "Fully repaid"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="font-medium">{formatDateTimeIndia(loan.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created by</p>
              <p className="font-medium">{loan.createdBy?.name ?? "Administrator"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Collection status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash received</p>
              <p className="num text-lg font-semibold">{formatINR(stats.collected)}</p>
            </div>
            <div className="rounded-lg bg-accent/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining</p>
              <p className="num text-lg font-semibold text-primary">{formatINR(stats.outstanding)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Collections are manual records only. No automatic payment is collected and no online payment gateway is connected.
            </p>
            {loan.terms ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contractual terms</p>
                <p className="mt-1 whitespace-pre-line text-xs">{loan.terms}</p>
              </div>
            ) : null}
            {loan.notes ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Internal notes</p>
                <p className="mt-1 whitespace-pre-line text-xs">{loan.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {loan.status === "ACTIVE" ? (
        <Card id="record" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIndianRupee className="h-4 w-4 text-primary" /> Record manual payment
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {customer.fullName} · {loan.reference}. Amounts are allocated to the oldest unpaid installments first.
            </p>
          </CardHeader>
          <CardContent>
            <PaymentForm
              loanId={loan.id}
              loanReference={loan.reference}
              customerName={customer.fullName}
              outstanding={stats.outstanding}
              installmentAmount={loan.installmentAmount.toString()}
              nextDueDate={stats.nextDueDate ? formatDateISO(stats.nextDueDate) : null}
              nowInput={indiaDateTimeInputNow()}
              loanStatus={loan.status}
            />
          </CardContent>
        </Card>
      ) : null}

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

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Collection ledger</CardTitle>
            <p className="text-xs text-muted-foreground">Immutable posted payments; corrections are voided with a reason.</p>
          </div>
          <Badge variant="outline">{payments.length} entries</Badge>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded for this loan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Receipt</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-left">Mode</th>
                    <th className="px-2 py-2 text-left">Allocated to</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment.id} className={payment.status === "VOIDED" ? "text-muted-foreground" : undefined}>
                      <td className="px-2 py-2.5">
                        <Link href={`/payments/${payment.id}`} className="num text-xs font-medium hover:underline">
                          {payment.receiptNumber}
                        </Link>
                        {payment.notes ? <p className="max-w-[160px] truncate text-[10px] text-muted-foreground">{payment.notes}</p> : null}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{formatDateTimeIndia(payment.paidAt)}</td>
                      <td className={`num px-2 py-2.5 text-right font-medium ${payment.status === "VOIDED" ? "line-through" : ""}`}>
                        {formatINR(payment.amount)}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}</td>
                      <td className="px-2 py-2.5 text-[11px]">
                        {payment.allocations.length
                          ? payment.allocations.map((allocation) => `#${allocation.installment.sequence} ${formatINR(allocation.amount)}`).join(" · ")
                          : "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <PaymentStatusBadge status={payment.status} />
                        {payment.reversal ? (
                          <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-rose-600 dark:text-rose-400">{payment.reversal.reason}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/payments/${payment.id}`}>
                              <FileText className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {payment.status === "POSTED" ? (
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
                              <VoidPaymentButton paymentId={payment.id} receiptNumber={payment.receiptNumber} amount={formatINR(payment.amount)} />
                            </>
                          ) : null}
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
        offline bookkeeping and are not processed online.
      </p>
    </div>
  );
}
