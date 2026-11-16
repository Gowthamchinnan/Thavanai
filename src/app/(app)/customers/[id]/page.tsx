import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Pencil,
  Plus,
  ReceiptIndianRupee,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { getCustomerDetail } from "@/lib/services/customers";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ArchiveCustomerButton } from "@/components/shared/archive-customer-button";
import { LoanStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { FREQUENCY_LABELS, INSTALLMENT_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (!detail) notFound();

  const { customer, loans, payments, stats } = detail;
  const activeLoans = loans.filter((loan) => loan.status === "ACTIVE");

  return (
    <div className="space-y-5">
      <PageHeader
        title={customer.fullName}
        description={`${customer.code} · ${customer.mobile}${customer.alternateMobile ? ` · Alt ${customer.alternateMobile}` : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/customers">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <ArchiveCustomerButton customerId={customer.id} customerName={customer.fullName} archived={Boolean(customer.archivedAt)} />
            <Button asChild size="sm">
              <Link href={`/loans/new?customerId=${customer.id}`}>
                <Plus className="h-4 w-4" /> New loan
              </Link>
            </Button>
          </>
        }
      />

      {customer.archivedAt ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          This customer is archived. New loans are blocked; financial history remains intact.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active loans</p>
          <p className="num mt-1 text-xl font-semibold">{stats.activeLoans}</p>
          <p className="text-[11px] text-muted-foreground">{stats.totalLoans} loans in total</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Aggregate balance</p>
          <p className="num mt-1 text-xl font-semibold">{formatINR(stats.aggregateOutstanding)}</p>
          <p className="text-[11px] text-muted-foreground">Across active loans</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">
            <TriangleAlert className="h-3 w-3" /> Overdue
          </p>
          <p className="num mt-1 text-xl font-semibold text-rose-900 dark:text-rose-100">{formatINR(stats.aggregateOverdue)}</p>
          <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">Active loans</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lifetime collected</p>
          <p className="num mt-1 text-xl font-semibold">{formatINR(stats.lifetimeCollected)}</p>
          <p className="text-[11px] text-muted-foreground">All posted payments</p>
        </div>
      </div>

      {customer.address || customer.notes ? (
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
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Loans</h2>
          <span className="text-xs text-muted-foreground">{activeLoans.length} active</span>
        </div>
        {loans.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No loans for this customer"
            description="Create a loan with custom deduction, repayment total and schedule frequency."
            actionHref={`/loans/new?customerId=${customer.id}`}
            actionLabel="Create loan"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {loans.map((loan) => (
              <Card key={loan.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/loans/${loan.id}`} className="font-medium hover:underline">
                      {loan.reference}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      {FREQUENCY_LABELS[loan.frequency]} · {loan.installmentCount} × {formatINR(loan.installmentAmount)}
                    </p>
                  </div>
                  <LoanStatusBadge status={loan.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Repayment</p>
                    <p className="num font-medium">{formatINR(loan.totalRepayment)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Collected</p>
                    <p className="num font-medium">{formatINR(loan.collected)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                    <p className="num font-semibold">{formatINR(loan.outstanding)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                  <div className="text-muted-foreground">
                    {loan.overdueCount > 0 ? (
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <TriangleAlert className="h-3.5 w-3.5" /> {loan.overdueCount} overdue · {formatINR(loan.overdueAmount)}
                      </span>
                    ) : loan.nextDueDate ? (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" /> Next {formatDateISO(loan.nextDueDate)} · {formatINR(loan.nextDueAmount ?? "0")}
                      </span>
                    ) : (
                      <span>No open installments</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/loans/${loan.id}`}>
                        <FileText className="h-3.5 w-3.5" /> View
                      </Link>
                    </Button>
                    {loan.status === "ACTIVE" ? (
                      <Button asChild size="sm">
                        <Link href={`/loans/${loan.id}#record`}>
                          <ReceiptIndianRupee className="h-3.5 w-3.5" /> Pay
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <p className="text-xs text-muted-foreground">Most recent 100 payments across this customer&apos;s loans.</p>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded for this customer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Receipt</th>
                    <th className="px-2 py-2 text-left">Loan</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-2 py-2.5">
                        <span className="num text-xs font-medium">{payment.receiptNumber}</span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">{payment.loan.reference}</td>
                      <td className="px-2 py-2.5 text-xs">{formatDateTimeIndia(payment.paidAt)}</td>
                      <td className="num px-2 py-2.5 text-right font-medium">{formatINR(payment.amount)}</td>
                      <td className="px-2 py-2.5">
                        <PaymentStatusBadge status={payment.status} />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/payments/${payment.id}`}>Receipt</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          <CalendarClock className="mr-1 h-3 w-3" /> Customer since {formatDateISO(customer.createdAt.toISOString().slice(0, 10))}
        </Badge>
        <Badge variant="outline">All amounts in INR</Badge>
        <Badge variant="outline">{INSTALLMENT_STATUS_LABELS.PAID} installments count toward collections</Badge>
      </div>
    </div>
  );
}
