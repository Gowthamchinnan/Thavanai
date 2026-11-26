import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, ReceiptText, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getPaymentDetail } from "@/lib/services/payments";
import { getSettings } from "@/lib/services/settings";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { buildPaymentWhatsAppMessage } from "@/lib/whatsapp";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LoanCategoryBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { WhatsAppShareButton, DownloadPdfButton } from "@/components/shared/whatsapp-share";
import { VoidPaymentButton } from "@/components/shared/void-payment-button";

export const metadata: Metadata = { title: "Payment Receipt" };
export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getPaymentDetail(id);
  if (!detail) notFound();
  const settings = await getSettings();
  const { payment, customer, loan, totalPaid, principalPaid, interestPaid, remaining, nextDue } = detail;
  const posted = payment.status === "POSTED";
  const isVatti = loan.category === "MONTHLY_VATTI" || loan.category === "WEEKLY_RUN_VATI";

  const message = buildPaymentWhatsAppMessage({
    businessName: settings.businessName,
    customerName: customer.fullName,
    loanReference: loan.reference,
    category: loan.category,
    receiptNumber: payment.receiptNumber,
    amount: formatINR(payment.amount),
    principalAmount: payment.principalAmount ? formatINR(payment.principalAmount) : null,
    interestAmount: payment.interestAmount ? formatINR(payment.interestAmount) : null,
    paymentDate: formatDateTimeIndia(payment.paidAt),
    totalPaid: formatINR(totalPaid),
    remainingBalance: formatINR(remaining),
    outstandingPrincipal: isVatti ? formatINR(payment.newPrincipal ?? "0") : null,
    pendingInterest: isVatti ? formatINR(payment.newInterest ?? "0") : null,
    nextDueAmount: nextDue ? formatINR(nextDue.amount) : null,
    nextDueDate: nextDue ? formatDateISO(nextDue.dueDate) : null,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Receipt ${payment.receiptNumber}`}
        description={`${customer.fullName} · loan ${loan.reference}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/loans/${loan.id}`}>
                <ArrowLeft className="h-4 w-4" /> Back to loan
              </Link>
            </Button>
            {posted ? (
              <>
                <DownloadPdfButton href={`/api/payments/${payment.id}/receipt`} label="Receipt PDF" />
                <WhatsAppShareButton
                  mobile={customer.mobile}
                  message={message}
                  pdfUrl={`/api/payments/${payment.id}/receipt`}
                  fileName={`${payment.receiptNumber}.pdf`}
                  label="Share receipt"
                />
                <VoidPaymentButton paymentId={payment.id} receiptNumber={payment.receiptNumber} amount={formatINR(payment.amount)} />
              </>
            ) : null}
          </>
        }
      />

      {!posted ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-800 dark:text-rose-300">
            <TriangleAlert className="h-4 w-4" /> This receipt was voided and is excluded from all totals
          </p>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">
            {payment.reversal?.reason ?? payment.voidReason ?? "No reason recorded."}
            {payment.reversal ? ` · Reversed ${formatDateTimeIndia(payment.reversal.reversedAt)}` : ""}
          </p>
          <p className="mt-2 text-[11px] text-rose-700/80 dark:text-rose-400/80">
            The original payment remains visible for audit. Record a replacement payment from the loan page if needed.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{settings.businessName}</p>
              <CardTitle className="mt-1 flex items-center gap-2 text-lg">
                <ReceiptText className="h-5 w-5 text-primary" /> Payment receipt
              </CardTitle>
              <div className="mt-1 flex items-center gap-2">
                <span className="num text-xs text-muted-foreground">{payment.receiptNumber}</span>
                <LoanCategoryBadge category={loan.category} className="text-[10px]" />
              </div>
            </div>
            <PaymentStatusBadge status={payment.status} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-accent/60 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount received</p>
              <p className={`num mt-1 text-3xl font-semibold ${posted ? "text-primary" : "text-muted-foreground line-through"}`}>
                {formatINR(payment.amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTimeIndia(payment.paidAt)} · {PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}
              </p>

              {isVatti && (
                <div className="mt-3 flex flex-wrap gap-4 border-t border-border/50 pt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Principal portion: </span>
                    <span className="num font-semibold">{formatINR(payment.principalAmount ?? "0")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Interest portion: </span>
                    <span className="num font-semibold text-amber-700 dark:text-amber-400">{formatINR(payment.interestAmount ?? "0")}</span>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</p>
                <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                  {customer.fullName}
                </Link>
                <p className="num text-xs text-muted-foreground">{customer.code}</p>
                <p className="num text-xs text-muted-foreground">{customer.mobile}</p>
                {customer.address ? <p className="mt-1 text-xs text-muted-foreground">{customer.address}</p> : null}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Loan</p>
                <Link href={`/loans/${loan.id}`} className="font-medium hover:underline">
                  {loan.reference}
                </Link>
                {isVatti ? (
                  <>
                    <p className="num text-xs text-muted-foreground">Principal disbursed: {formatINR(loan.nominalAmount)}</p>
                    <p className="num text-xs text-muted-foreground">Remaining balance: {formatINR(remaining)}</p>
                  </>
                ) : (
                  <>
                    <p className="num text-xs text-muted-foreground">Contractual repayment {formatINR(loan.totalRepayment)}</p>
                    <p className="num text-xs text-muted-foreground">Remaining balance {formatINR(remaining)}</p>
                  </>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {isVatti ? "Interest Cycle Allocation" : "Allocated to installments"}
              </p>
              {isVatti ? (
                payment.interestAllocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {Number(payment.principalAmount) > 0 ? "Direct principal reduction (no interest periods allocated)." : "No cycle allocations recorded."}
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {payment.interestAllocations.map((allocation) => (
                      <div key={allocation.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>Interest cycle #{allocation.interestPeriod.sequence}</span>
                        <span className="num font-medium">{formatINR(allocation.amount)}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : payment.allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No installment allocations recorded.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {payment.allocations.map((allocation) => (
                    <div key={allocation.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>Installment #{allocation.installment.sequence}</span>
                      <span className="num font-medium">{formatINR(allocation.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isVatti && payment.newPrincipal != null && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Balance Snapshot</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Principal: </span>
                    <span className="num font-medium">{formatINR(payment.previousPrincipal ?? "0")} → {formatINR(payment.newPrincipal)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pending Interest: </span>
                    <span className="num font-medium">{formatINR(payment.previousInterest ?? "0")} → {formatINR(payment.newInterest ?? "0")}</span>
                  </div>
                </div>
              </div>
            )}

            {payment.notes ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment notes</p>
                <p className="mt-1 whitespace-pre-line text-sm">{payment.notes}</p>
              </div>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              Recorded by {payment.createdBy?.name ?? "Administrator"} on {formatDateTimeIndia(payment.createdAt)}. This receipt
              reflects a manually recorded offline payment; no online payment gateway was connected.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleCheck className="h-4 w-4 text-primary" /> Account position
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Total paid to date</span>
                <span className="num font-semibold">{formatINR(totalPaid)}</span>
              </div>
              {isVatti && (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Principal repaid</span>
                    <span className="num font-medium">{formatINR(principalPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Interest collected</span>
                    <span className="num font-medium text-amber-700 dark:text-amber-400">{formatINR(interestPaid)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Remaining balance</span>
                <span className="num font-semibold text-primary">{formatINR(remaining)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Loan status</span>
                <span className="font-medium">{loan.status.toLowerCase().replace("_", " ")}</span>
              </div>
              <Separator />
              {nextDue ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Next {isVatti ? "cycle due" : "installment"}
                  </p>
                  <p className="num mt-1 font-medium">
                    #{nextDue.sequence} · {formatINR(nextDue.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Due {formatDateISO(nextDue.dueDate)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No further dues remain for this loan account.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Correction policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Posted payments are immutable. Corrections void the original receipt with a documented reason, automatically restore principal and interest balances, and maintain a full audit trail.</p>
              <p>A replacement manual payment can be recorded with a fresh receipt number.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
