import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptIndianRupee, Search } from "lucide-react";
import { listPayments } from "@/lib/services/payments";
import { formatINR } from "@/lib/money";
import { formatDateTimeIndia } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, SelectNative } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { LoanCategoryBadge, PaymentStatusBadge } from "@/components/shared/status-badge";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; from?: string; to?: string; status?: string; mode?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const result = await listPayments({
    q: sp.q,
    category: sp.category ?? "ALL",
    from: sp.from,
    to: sp.to,
    status: sp.status ?? "ALL",
    mode: sp.mode ?? "ALL",
    page: Number(sp.page ?? 1) || 1,
  });
  const hasFilters = Boolean(
    sp.q ||
      (sp.category && sp.category !== "ALL") ||
      sp.from ||
      sp.to ||
      (sp.status && sp.status !== "ALL") ||
      (sp.mode && sp.mode !== "ALL"),
  );

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Immutable ledger of every manually recorded collection across Thavanai, Vatti, and Run Vati accounts."
        actions={
          <Button asChild size="sm">
            <Link href="/loans">
              <ReceiptIndianRupee className="h-4 w-4" /> Record a collection
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matching entries</p>
          <p className="num mt-1 text-xl font-semibold">{result.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Posted</p>
          <p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(result.summary.postedAmount)}</p>
          <p className="text-[10px] text-muted-foreground">
            Prin: {formatINR(result.summary.principalAmount)} | Int: {formatINR(result.summary.interestAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Voided entries</p>
          <p className="num mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">{result.summary.voidedCount}</p>
          <p className="text-[10px] text-muted-foreground">Excluded from totals</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scope</p>
          <p className="mt-1 text-sm font-medium">{hasFilters ? "Filtered ledger" : "All recorded payments"}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="payment-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="payment-search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Receipt, customer, mobile or loan reference"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5 lg:w-44">
            <label htmlFor="payment-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <SelectNative id="payment-category" name="category" defaultValue={sp.category ?? "ALL"}>
              <option value="ALL">All categories</option>
              <option value="THAVANAI">Thavanai (Installment)</option>
              <option value="MONTHLY_VATTI">Vatti (Monthly)</option>
              <option value="WEEKLY_RUN_VATI">Run Vati (Weekly)</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 lg:w-36">
            <label htmlFor="payment-from" className="text-xs font-medium text-muted-foreground">
              Paid from
            </label>
            <Input id="payment-from" name="from" type="date" defaultValue={sp.from ?? ""} />
          </div>
          <div className="space-y-1.5 lg:w-36">
            <label htmlFor="payment-to" className="text-xs font-medium text-muted-foreground">
              Paid to
            </label>
            <Input id="payment-to" name="to" type="date" defaultValue={sp.to ?? ""} />
          </div>
          <div className="space-y-1.5 lg:w-32">
            <label htmlFor="payment-mode" className="text-xs font-medium text-muted-foreground">
              Mode
            </label>
            <SelectNative id="payment-mode" name="mode" defaultValue={sp.mode ?? "ALL"}>
              <option value="ALL">All</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="UPI">UPI</option>
              <option value="OTHER">Other</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 lg:w-32">
            <label htmlFor="payment-status" className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <SelectNative id="payment-status" name="status" defaultValue={sp.status ?? "ALL"}>
              <option value="ALL">All</option>
              <option value="POSTED">Posted</option>
              <option value="VOIDED">Voided</option>
            </SelectNative>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Search className="h-4 w-4" /> Filter
            </Button>
            {hasFilters && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/payments">Reset</Link>
              </Button>
            )}
          </div>
        </form>
      </Card>

      {result.items.length === 0 ? (
        <EmptyState
          icon={ReceiptIndianRupee}
          title={hasFilters ? "No payments match these filters" : "No payments recorded yet"}
          description={
            hasFilters
              ? "Try adjusting filters or widening the date range."
              : "Payments appear here when you record a manual collection against an active loan."
          }
          actionHref="/loans"
          actionLabel="Browse loans"
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Receipt</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Loan</th>
                    <th className="px-4 py-3 text-left">Paid at</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Mode</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((payment) => (
                    <tr key={payment.id} className={payment.status === "VOIDED" ? "text-muted-foreground opacity-70" : undefined}>
                      <td className="px-4 py-3">
                        <Link href={`/payments/${payment.id}`} className="num text-xs font-semibold hover:underline">
                          {payment.receiptNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <LoanCategoryBadge category={payment.loan.category} className="text-[10px]" />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${payment.customer.id}`} className="hover:underline">
                          {payment.customer.fullName}
                        </Link>
                        <p className="num text-[11px] text-muted-foreground">{payment.customer.mobile}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/loans/${payment.loan.id}`} className="text-xs font-medium hover:underline">
                          {payment.loan.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{formatDateTimeIndia(payment.paidAt)}</td>
                      <td className={`num px-4 py-3 text-right font-semibold ${payment.status === "VOIDED" ? "line-through text-muted-foreground" : ""}`}>
                        {formatINR(payment.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs">{PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}</td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={payment.status} />
                        {payment.reversal && (
                          <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-rose-600 dark:text-rose-400">
                            {payment.reversal.reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/payments/${payment.id}`}>Receipt</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {result.items.map((payment) => (
              <Link key={payment.id} href={`/payments/${payment.id}`} className="card-surface block p-4 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="num text-xs font-semibold">{payment.receiptNumber}</p>
                      <LoanCategoryBadge category={payment.loan.category} className="text-[10px]" />
                    </div>
                    <p className="mt-0.5 text-sm font-medium">{payment.customer.fullName}</p>
                    <p className="num text-[11px] text-muted-foreground">{payment.customer.mobile}</p>
                  </div>
                  <PaymentStatusBadge status={payment.status} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount</p>
                    <p className={`num text-lg font-semibold ${payment.status === "VOIDED" ? "line-through" : ""}`}>
                      {formatINR(payment.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {payment.loan.reference} · {PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}
                    </p>
                  </div>
                  <p className="text-right text-[11px] text-muted-foreground">{formatDateTimeIndia(payment.paidAt)}</p>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            basePath="/payments"
            params={{
              q: sp.q,
              category: sp.category ?? "ALL",
              from: sp.from,
              to: sp.to,
              mode: sp.mode ?? "ALL",
              status: sp.status ?? "ALL",
            }}
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
