import type { Metadata } from "next";
import Link from "next/link";
import { Search, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { listLoans } from "@/lib/services/loans";
import { searchCustomers } from "@/lib/services/customers";
import { formatINR } from "@/lib/money";
import { formatDateISO, getIndiaTodayISO } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, SelectNative } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { LoanCategoryBadge, LoanStatusBadge } from "@/components/shared/status-badge";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { LoanCreateDialog } from "@/components/forms/loan-create-dialog";

export const metadata: Metadata = { title: "Loans" };
export const dynamic = "force-dynamic";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; frequency?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const today = getIndiaTodayISO();
  const [result, customers] = await Promise.all([
    listLoans({
      q: sp.q,
      category: sp.category ?? "ALL",
      status: sp.status ?? "ALL",
      frequency: sp.frequency ?? "ALL",
      page: Number(sp.page ?? 1) || 1,
    }),
    searchCustomers("", 200),
  ]);

  return (
    <div>
      <PageHeader
        title="Loans"
        description="Comprehensive portfolio across Thavanai, Vatti, and Run Vati accounts."
        actions={
          <div className="flex items-center gap-2">
            <LoanCreateDialog customers={customers} today={today} />
            <Button asChild variant="outline" size="sm">
              <Link href="/loans/new">
                <Wallet className="h-4 w-4" /> Full page
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matched loans</p>
          <p className="num mt-1 text-xl font-semibold">{result.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Disbursed</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(result.summary.totalDisbursed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Repayment Commitment</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(result.summary.totalRepayment)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected / Outstanding</p>
          <p className="num mt-1 text-sm font-semibold">
            <span className="text-emerald-700 dark:text-emerald-400">{formatINR(result.summary.totalCollected)}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-primary">{formatINR(result.summary.totalOutstanding)}</span>
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
          <div className="space-y-1.5 sm:w-44">
            <label htmlFor="loan-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <SelectNative id="loan-category" name="category" defaultValue={sp.category ?? "ALL"}>
              <option value="ALL">All categories</option>
              <option value="THAVANAI">Thavanai (Installment)</option>
              <option value="MONTHLY_VATTI">Vatti (Monthly)</option>
              <option value="WEEKLY_RUN_VATI">Run Vati (Weekly)</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 sm:w-36">
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
          <div className="space-y-1.5 sm:w-32">
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
            {(sp.q || (sp.category && sp.category !== "ALL") || (sp.status && sp.status !== "ALL") || (sp.frequency && sp.frequency !== "ALL")) && (
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
          title={sp.q || sp.category !== "ALL" ? "No loans match your filters" : "No loans yet"}
          description={sp.q || sp.category !== "ALL" ? "Try adjusting category or search parameters." : "Create a loan under Thavanai, Vatti, or Run Vati."}
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
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Disbursed</th>
                    <th className="px-4 py-3 text-right">Repayment</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3 text-left">Next due</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((loan) => (
                    <tr key={loan.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/loans/${loan.id}`} className="hover:underline">
                          {loan.reference}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {FREQUENCY_LABELS[loan.frequency] ?? loan.frequency}
                          {loan.installmentCount ? ` · ${loan.installmentCount} inst.` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${loan.customer.id}`} className="hover:underline">
                          {loan.customer.fullName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {loan.customer.code} · {loan.customer.mobile}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <LoanCategoryBadge category={loan.category} />
                      </td>
                      <td className="px-4 py-3">
                        <LoanStatusBadge status={loan.status} />
                      </td>
                      <td className="num px-4 py-3 text-right">{formatINR(loan.netDisbursed)}</td>
                      <td className="num px-4 py-3 text-right">{formatINR(loan.totalRepayment)}</td>
                      <td className="num px-4 py-3 text-right text-emerald-700 dark:text-emerald-400">{formatINR(loan.collected)}</td>
                      <td className="num px-4 py-3 text-right font-medium">{formatINR(loan.outstanding)}</td>
                      <td className="px-4 py-3 text-xs">
                        {loan.nextDueDate ? (
                          <>
                            <p className="font-medium text-foreground">{formatDateISO(loan.nextDueDate)}</p>
                            <p className="num text-muted-foreground">{loan.nextDueAmount ? formatINR(loan.nextDueAmount) : ""}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/loans/${loan.id}`}>View</Link>
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
              <Link key={loan.id} href={`/loans/${loan.id}`} className="card-surface block p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{loan.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {loan.customer.fullName} · {loan.customer.mobile}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LoanCategoryBadge category={loan.category} />
                    <LoanStatusBadge status={loan.status} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Disbursed:</span>{" "}
                    <span className="num font-medium">{formatINR(loan.netDisbursed)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Outstanding:</span>{" "}
                    <span className="num font-semibold text-primary">{formatINR(loan.outstanding)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Collected:</span>{" "}
                    <span className="num font-medium text-emerald-700 dark:text-emerald-400">{formatINR(loan.collected)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Next due:</span>{" "}
                    <span className="num font-medium">{loan.nextDueDate ? formatDateISO(loan.nextDueDate) : "—"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            basePath="/loans"
            params={{ q: sp.q, category: sp.category, status: sp.status, frequency: sp.frequency }}
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
