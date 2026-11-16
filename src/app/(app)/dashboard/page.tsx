import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  PiggyBank,
  ReceiptIndianRupee,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { getDashboardData } from "@/lib/services/dashboard";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import { INSTALLMENT_STATUS_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CollectionTrendChart,
  LoanStatusChart,
  RepaymentCompositionChart,
} from "@/components/dashboard/dashboard-charts";
import { InstallmentStatusBadge } from "@/components/shared/status-badge";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { stats } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A live view of loan exposure, manual cash collections and upcoming installments."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/customers/new">
                <UserPlus className="h-4 w-4" /> Add customer
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/loans/new">
                <Wallet className="h-4 w-4" /> Create loan
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/loans?status=ACTIVE">
                <ReceiptIndianRupee className="h-4 w-4" /> Record payment
              </Link>
            </Button>
          </>
        }
      />

      {(stats.overdueCount > 0 || stats.dueTodayCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/collections/overdue"
            className="group flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 transition-colors hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:hover:bg-rose-950/50"
          >
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                <TriangleAlert className="h-3.5 w-3.5" /> Overdue collections
              </p>
              <p className="num mt-1 text-xl font-semibold text-rose-900 dark:text-rose-100">{formatINR(stats.overdueOutstanding)}</p>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
                {stats.overdueCount} installment{stats.overdueCount === 1 ? "" : "s"} past due
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-rose-500 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/collections/today"
            className="group flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
          >
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                <CalendarClock className="h-3.5 w-3.5" /> Due today
              </p>
              <p className="num mt-1 text-xl font-semibold text-blue-900 dark:text-blue-100">{formatINR(stats.dueTodayOutstanding)}</p>
              <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
                {stats.dueTodayCount} installment{stats.dueTodayCount === 1 ? "" : "s"} due · {formatDateISO(data.today)}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-blue-500 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active customers" value={String(stats.activeCustomers)} hint="Customers with an active loan" icon={Users} />
        <StatCard label="Active loans" value={String(stats.activeLoans)} hint={`${formatINR(stats.activeNominalAmount, { decimals: false })} nominal`} icon={Wallet} />
        <StatCard
          label="Remaining outstanding"
          value={formatINR(stats.activeOutstanding)}
          hint="Contractual balance not yet collected"
          icon={Landmark}
          tone="soft"
        />
        <StatCard
          label="Collected this month"
          value={formatINR(stats.collectedMonth)}
          hint="Posted manual collections"
          icon={PiggyBank}
          tone="primary"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Contractual repayment" value={formatINR(stats.activeContractualRepayment)} hint="Active loans only" icon={CircleDollarSign} />
        <StatCard label="Actual cash disbursed" value={formatINR(stats.activeNetDisbursed)} hint="Net of upfront deductions" icon={Landmark} />
        <StatCard
          label="Expected gross margin"
          value={formatINR(stats.expectedGrossMargin)}
          hint="Repayment commitment minus net cash disbursed. Not guaranteed profit."
          icon={PiggyBank}
          tone="blue"
        />
        <StatCard label="Lifetime collections" value={formatINR(stats.lifetimeCollected)} hint="All posted payments, all loans" icon={ReceiptIndianRupee} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash collected</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">Today </span>
              <span className="num font-semibold">{formatINR(stats.collectedToday)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">This week </span>
              <span className="num font-semibold">{formatINR(stats.collectedWeek)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">This month </span>
              <span className="num font-semibold">{formatINR(stats.collectedMonth)}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Collection trend</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Posted cash collections over the last 14 days (Asia/Kolkata).</p>
            </div>
            <Badge variant="secondary">{formatINR(stats.lifetimeCollected, { decimals: false })} lifetime</Badge>
          </CardHeader>
          <CardContent>
            <CollectionTrendChart data={data.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loan status</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">All loans by current status.</p>
          </CardHeader>
          <CardContent>
            <LoanStatusChart statusCounts={data.statusCounts} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expected margin vs cash collected</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Expected gross margin is not realised profit. Cash collected is actual money recorded; advance deductions are
              never counted as collections.
            </p>
          </CardHeader>
          <CardContent>
            <RepaymentCompositionChart data={{ ...data.chartMargin, expectedMargin: data.chartMargin.expectedMargin }} />
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span>Contractual repayment (active): {formatINR(stats.activeContractualRepayment)}</span>
              <span>Cash collected (active): {formatINR(stats.activeCollected)}</span>
              <span>Net cash disbursed (active): {formatINR(stats.activeNetDisbursed)}</span>
              <span>Expected gross margin (active): {formatINR(stats.expectedGrossMargin)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Due today</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/collections/today">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.dueToday.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing due today"
                description="No active installment is scheduled for today."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <div className="divide-y divide-border">
                {data.dueToday.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/loans/${row.loan.id}`} className="block truncate text-sm font-medium hover:underline">
                        {row.customer.fullName}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {row.loan.reference} · installment #{row.sequence} · {INSTALLMENT_STATUS_LABELS[row.status]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-semibold">{formatINR(row.outstanding)}</p>
                      <p className="text-[10px] text-muted-foreground">balance {formatINR(row.loanBalance)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent payment activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/payments">
                All payments <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentPayments.length === 0 ? (
              <EmptyState
                icon={ReceiptIndianRupee}
                title="No collections yet"
                description="Record the first manual payment from a loan page to see it here."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <div className="divide-y divide-border">
                {data.recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{payment.customer.fullName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {payment.receiptNumber} · {payment.loan.reference} · {formatDateTimeIndia(new Date(payment.paidAt))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num text-sm font-semibold">{formatINR(payment.amount)}</span>
                      <Button asChild variant="ghost" size="icon" aria-label="View receipt">
                        <Link href={`/payments/${payment.id}`}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Next 7 days</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/collections/upcoming">All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-lg bg-accent/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scheduled</p>
              <p className="num text-lg font-semibold text-primary">{formatINR(stats.upcomingOutstanding)}</p>
              <p className="text-[11px] text-muted-foreground">{stats.upcomingCount} installments due in the next 7 days</p>
            </div>
            {data.upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No upcoming installments.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.upcoming.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/loans/${row.loan.id}`} className="block truncate text-sm hover:underline">
                        {row.customer.fullName}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">{formatDateISO(row.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-medium">{formatINR(row.outstanding)}</p>
                      <InstallmentStatusBadge status={row.status} className="mt-0.5 text-[9px]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Need a report?</p>
            <p className="text-xs text-muted-foreground">Export collections, outstanding balances, overdue installments and loan ledgers to Excel.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">
              <FileSpreadsheet className="h-4 w-4" /> Open reports
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
