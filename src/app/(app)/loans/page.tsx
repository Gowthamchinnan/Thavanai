import type { Metadata } from "next";
import Link from "next/link";
import { Search, Wallet } from "lucide-react";
import { listLoans } from "@/lib/services/loans";
import { formatINR } from "@/lib/money";
import { formatDateISO } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, SelectNative } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { LoanStatusBadge } from "@/components/shared/status-badge";
import { FREQUENCY_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Loans" };
export const dynamic = "force-dynamic";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; frequency?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const result = await listLoans({
    q: sp.q,
    status: sp.status ?? "ALL",
    frequency: sp.frequency ?? "ALL",
    page: Number(sp.page ?? 1) || 1,
  });

  return (
    <div>
      <PageHeader
        title="Loans"
        description="Every loan with its agreed repayment commitment, net disbursement and current collection balance."
        actions={
          <Button asChild size="sm">
            <Link href="/loans/new">
              <Wallet className="h-4 w-4" /> Create loan
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matched loans</p>
          <p className="num mt-1 text-xl font-semibold">{result.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contractual repayment</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(result.summary.totalRepayment)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net disbursed</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(result.summary.totalDisbursed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected / outstanding</p>
          <p className="num mt-1 text-sm font-semibold">
            {formatINR(result.summary.totalCollected)} <span className="text-muted-foreground">/ {formatINR(result.summary.totalOutstanding)}</span>
          </p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="loan-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="loan-search" name="q" defaultValue={sp.q ?? ""} placeholder="Loan reference, customer name or mobile" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5 sm:w-40">
            <label htmlFor="loan-status" className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <SelectNative id="loan-status" name="status" defaultValue={sp.status ?? "ALL"}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="COMPLETED">Completed</option>
              <option value="WRITTEN_OFF">Written off</option>
              <option value="CANCELLED">Cancelled</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 sm:w-36">
            <label htmlFor="loan-frequency" className="text-xs font-medium text-muted-foreground">
              Frequency
            </label>
            <SelectNative id="loan-frequency" name="frequency" defaultValue={sp.frequency ?? "ALL"}>
              <option value="ALL">All</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </SelectNative>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Search className="h-4 w-4" /> Filter
            </Button>
            {(sp.q || (sp.status && sp.status !== "ALL") || (sp.frequency && sp.frequency !== "ALL")) && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/loans">Reset</Link>
              </Button>
            )}
          </div>
        </form>
      </Card>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={sp.q ? "No loans match your filters" : "No loans yet"}
          description={sp.q ? "Try another reference, customer or status." : "Create a loan with custom amounts, deduction and repayment schedule."}
          actionHref="/loans/new"
          actionLabel="Create loan"
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Loan</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Schedule</th>
                    <th className="px-4 py-3 text-right">Net disbursed</th>
                    <th className="px-4 py-3 text-right">Repayment</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3 text-left">Next due</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((loan) => (
                    <tr key={loan.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/loans/${loan.id}`} className="font-medium hover:underline">
                          {loan.reference}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">Since {formatDateISO(loan.startDate)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${loan.customer.id}`} className="hover:underline">
                          {loan.customer.fullName}
                        </Link>
                        <p className="num text-[11px] text-muted-foreground">{loan.customer.mobile}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {FREQUENCY_LABELS[loan.frequency]}
                        <p className="text-[11px] text-muted-foreground">
                          {loan.installmentCount} × {formatINR(loan.installmentAmount)}
                        </p>
                      </td>
                      <td className="num px-4 py-3 text-right">{formatINR(loan.netDisbursed)}</td>
                      <td className="num px-4 py-3 text-right">{formatINR(loan.totalRepayment)}</td>
                      <td className="num px-4 py-3 text-right">{formatINR(loan.collected)}</td>
                      <td className="num px-4 py-3 text-right font-semibold">{formatINR(loan.outstanding)}</td>
                      <td className="px-4 py-3 text-xs">
                        {loan.nextDueDate ? (
                          <>
                            {formatDateISO(loan.nextDueDate)}
                            <p className="num text-[11px] text-muted-foreground">{formatINR(loan.nextDueAmount ?? "0")}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <LoanStatusBadge status={loan.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/loans/${loan.id}`}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {result.items.map((loan) => (
              <Link key={loan.id} href={`/loans/${loan.id}`} className="card-surface block p-4 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{loan.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {loan.customer.fullName} · {loan.customer.mobile}
                    </p>
                  </div>
                  <LoanStatusBadge status={loan.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Disbursed</p>
                    <p className="num font-medium">{formatINR(loan.netDisbursed)}</p>
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
                {loan.nextDueDate ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Next due {formatDateISO(loan.nextDueDate)} · {formatINR(loan.nextDueAmount ?? "0")}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>

          <Pagination
            basePath="/loans"
            params={{ q: sp.q, status: sp.status ?? "ALL", frequency: sp.frequency ?? "ALL" }}
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
