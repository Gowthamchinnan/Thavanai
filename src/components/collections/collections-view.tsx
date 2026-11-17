import Link from "next/link";
import {
  CalendarDays,
  CalendarClock,
  Clock3,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { listCollections, type CollectionScope } from "@/lib/services/collections";
import { formatINR } from "@/lib/money";
import { formatDateISO } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, SelectNative } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { InstallmentStatusBadge, LoanCategoryBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

const SCOPES: { key: CollectionScope; label: string; href: string; icon: typeof CalendarDays }[] = [
  { key: "today", label: "Due today", href: "/collections/today", icon: CalendarClock },
  { key: "overdue", label: "Overdue", href: "/collections/overdue", icon: TriangleAlert },
  { key: "upcoming", label: "Upcoming", href: "/collections/upcoming", icon: Clock3 },
];

const META: Record<Exclude<CollectionScope, "all">, { title: string; description: string; empty: string }> = {
  today: {
    title: "Due today",
    description: "Installments and interest cycles whose India due date is today. Record each manual collection as it is received.",
    empty: "No installments or interest cycles are due today. Check upcoming collections for what is next.",
  },
  overdue: {
    title: "Overdue",
    description: "Unpaid installments and interest cycles past their due date, oldest first. Follow up manually and record collections.",
    empty: "No overdue installments or interest cycles right now.",
  },
  upcoming: {
    title: "Upcoming",
    description: "Future installments and interest cycles across active loans, including partially paid ones.",
    empty: "No upcoming collections. Create or activate a loan to build a schedule.",
  },
};

export async function CollectionsView({
  scope,
  searchParams,
}: {
  scope: Exclude<CollectionScope, "all">;
  searchParams: { q?: string; category?: string; frequency?: string; from?: string; to?: string; page?: string };
}) {
  const result = await listCollections({
    scope,
    q: searchParams.q,
    category: searchParams.category ?? "ALL",
    frequency: searchParams.frequency ?? "ALL",
    from: searchParams.from,
    to: searchParams.to,
    page: Number(searchParams.page ?? 1) || 1,
  });
  const meta = META[scope];
  const hasFilters = Boolean(
    searchParams.q ||
      (searchParams.category && searchParams.category !== "ALL") ||
      (searchParams.frequency && searchParams.frequency !== "ALL") ||
      searchParams.from ||
      searchParams.to,
  );

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button asChild size="sm">
            <Link href="/loans/new">
              <Wallet className="h-4 w-4" /> New loan
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {SCOPES.map((item) => {
          const Icon = item.icon;
          const active = item.key === scope;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due items</p>
          <p className="num mt-1 text-xl font-semibold">{result.summary.count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scheduled amount</p>
          <p className="num mt-1 text-lg font-semibold">{formatINR(result.summary.scheduledTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Still to collect</p>
          <p className="num mt-1 text-lg font-bold text-primary">{formatINR(result.summary.outstanding)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">India date</p>
          <p className="mt-1 text-sm font-semibold">{formatDateISO(result.today)}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="collection-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="collection-search"
                name="q"
                defaultValue={searchParams.q ?? ""}
                placeholder="Customer name, mobile, code or loan reference"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5 lg:w-44">
            <label htmlFor="collection-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <SelectNative id="collection-category" name="category" defaultValue={searchParams.category ?? "ALL"}>
              <option value="ALL">All categories</option>
              <option value="THAVANAI">Thavanai (Installment)</option>
              <option value="MONTHLY_VATTI">Vatti (Monthly)</option>
              <option value="WEEKLY_RUN_VATI">Run Vati (Weekly)</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 lg:w-36">
            <label htmlFor="collection-frequency" className="text-xs font-medium text-muted-foreground">
              Frequency
            </label>
            <SelectNative id="collection-frequency" name="frequency" defaultValue={searchParams.frequency ?? "ALL"}>
              <option value="ALL">All</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5 lg:w-36">
            <label htmlFor="collection-from" className="text-xs font-medium text-muted-foreground">
              Due from
            </label>
            <Input id="collection-from" name="from" type="date" defaultValue={searchParams.from ?? ""} />
          </div>
          <div className="space-y-1.5 lg:w-36">
            <label htmlFor="collection-to" className="text-xs font-medium text-muted-foreground">
              Due to
            </label>
            <Input id="collection-to" name="to" type="date" defaultValue={searchParams.to ?? ""} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Search className="h-4 w-4" /> Filter
            </Button>
            {hasFilters && (
              <Button asChild variant="ghost" size="sm">
                <Link href={SCOPES.find((s) => s.key === scope)?.href ?? "/collections/today"}>Reset</Link>
              </Button>
            )}
          </div>
        </form>
      </Card>

      {result.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={hasFilters ? "Nothing matches these filters" : "Nothing pending here"}
          description={hasFilters ? "Try widening the date range or clearing the search." : meta.empty}
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
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Loan</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Cycle / Installment</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-right">Scheduled</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">To collect</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((item) => (
                    <tr key={item.id} className={item.status === "OVERDUE" ? "bg-rose-50/40 dark:bg-rose-950/10" : undefined}>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${item.customer.id}`} className="font-semibold hover:underline">
                          {item.customer.fullName}
                        </Link>
                        <p className="num text-[11px] text-muted-foreground">{item.customer.mobile}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/loans/${item.loan.id}`} className="text-xs font-semibold hover:underline">
                          {item.loan.reference}
                        </Link>
                        <p className="num text-[11px] text-muted-foreground">Balance {formatINR(item.loanBalance)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <LoanCategoryBadge category={item.category} className="text-[10px]" />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        #{item.sequence} {item.loan.installmentCount > 0 ? `of ${item.loan.installmentCount}` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {formatDateISO(item.dueDate)}
                        {item.overdueDays > 0 && (
                          <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{item.overdueDays} day(s) late</p>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right">{formatINR(item.scheduledAmount)}</td>
                      <td className="num px-4 py-3 text-right text-emerald-700 dark:text-emerald-400 font-medium">{formatINR(item.paidAmount)}</td>
                      <td className="num px-4 py-3 text-right font-bold text-primary">{formatINR(item.outstandingAmount)}</td>
                      <td className="px-4 py-3">
                        <InstallmentStatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild size="sm">
                            <Link href={`/loans/${item.loan.id}#record`}>Collect</Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/loans/${item.loan.id}`}>Open</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {result.items.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/customers/${item.customer.id}`} className="font-semibold hover:underline">
                      {item.customer.fullName}
                    </Link>
                    <p className="num text-xs text-muted-foreground">{item.customer.mobile}</p>
                  </div>
                  <InstallmentStatusBadge status={item.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link href={`/loans/${item.loan.id}`} className="num font-semibold text-foreground hover:underline">
                    {item.loan.reference}
                  </Link>
                  <LoanCategoryBadge category={item.category} className="text-[10px]" />
                  <span>
                    #{item.sequence}
                  </span>
                  <span>Due {formatDateISO(item.dueDate)}</span>
                  {item.overdueDays > 0 && (
                    <span className="font-medium text-rose-600 dark:text-rose-400">{item.overdueDays} day(s) late</span>
                  )}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">To collect</p>
                    <p className="num text-base font-bold text-primary">{formatINR(item.outstandingAmount)}</p>
                    <p className="num text-[10px] text-muted-foreground">
                      {formatINR(item.paidAmount)} paid of {formatINR(item.scheduledAmount)}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/loans/${item.loan.id}#record`}>Collect</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            basePath={`/collections/${scope}`}
            params={{
              q: searchParams.q,
              category: searchParams.category ?? "ALL",
              frequency: searchParams.frequency ?? "ALL",
              from: searchParams.from,
              to: searchParams.to,
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
