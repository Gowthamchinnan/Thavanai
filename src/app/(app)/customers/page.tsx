import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { listCustomers } from "@/lib/services/customers";
import { formatINR } from "@/lib/money";
import { formatDateISO } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { CustomerCreateDialog } from "@/components/forms/customer-create-dialog";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "archived" || sp.status === "all" ? sp.status : "active";
  const result = await listCustomers({
    q: sp.q,
    status,
    page: Number(sp.page ?? 1) || 1,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Search customer records, review linked loans and open a customer ledger."
        actions={
          <div className="flex items-center gap-2">
            <CustomerCreateDialog />
            <Button asChild variant="outline" size="sm">
              <Link href="/customers/new">
                <UserPlus className="h-4 w-4" /> Full page
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="customer-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="customer-search" name="q" defaultValue={sp.q ?? ""} placeholder="Name, mobile, or customer code" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5 sm:w-44">
            <label htmlFor="customer-status" className="text-xs font-medium text-muted-foreground">
              Record status
            </label>
            <SelectNative id="customer-status" name="status" defaultValue={status}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </SelectNative>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Search className="h-4 w-4" /> Search
            </Button>
            {(sp.q || (sp.status && sp.status !== "active")) && (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link href="/customers">Reset</Link>
              </Button>
            )}
          </div>
        </form>
      </Card>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={sp.q ? "No customers match your search" : "No customers yet"}
          description={
            sp.q
              ? "Try a different name, mobile number or customer code."
              : "Create the first customer to begin issuing flexible loans and recording manual collections."
          }
          actionHref="/customers/new"
          actionLabel="Add customer"
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Mobile</th>
                    <th className="px-4 py-3 text-right">Loans</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3 text-left">Since</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                          {customer.fullName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">{customer.code}</p>
                      </td>
                      <td className="num px-4 py-3 text-muted-foreground">{customer.mobile}</td>
                      <td className="num px-4 py-3 text-right">
                        {customer.activeLoans}
                        <span className="text-muted-foreground"> / {customer.totalLoans}</span>
                      </td>
                      <td className="num px-4 py-3 text-right font-medium">{formatINR(customer.outstanding)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateISO(customer.createdAt.toISOString().slice(0, 10))}</td>
                      <td className="px-4 py-3">
                        {customer.archivedAt ? <Badge variant="secondary">Archived</Badge> : <Badge variant="default">Active</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/customers/${customer.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 md:hidden">
            {result.items.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="card-surface block p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{customer.fullName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {customer.code} · {customer.mobile}
                    </p>
                  </div>
                  {customer.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                    <p className="num text-base font-semibold">{formatINR(customer.outstanding)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Loans</p>
                    <p className="num text-sm">
                      {customer.activeLoans} active / {customer.totalLoans} total
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination basePath="/customers" params={{ q: sp.q, status }} page={result.page} totalPages={result.totalPages} total={result.total} />
        </>
      )}
    </div>
  );
}
