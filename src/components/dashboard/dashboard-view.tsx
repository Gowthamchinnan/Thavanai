"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Coins,
  Landmark,
  Percent,
  PiggyBank,
  ReceiptIndianRupee,
  TriangleAlert,
  Users,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import type { DashboardData } from "@/lib/services/dashboard";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionTrendChart, LoanStatusChart } from "@/components/dashboard/dashboard-charts";
import { LOAN_CATEGORY_LABELS, LOAN_CATEGORY_TONES } from "@/lib/constants";

export function DashboardView({ data }: { data: DashboardData }) {
  const [activeTab, setActiveTab] = React.useState<"overall" | "thavanai" | "monthlyVatti" | "runVati" | "all">("overall");

  const { overall, thavanai, monthlyVatti, trend, statusCounts, dueToday, recentPayments } = data;
  const runVati = data.runVati;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("overall")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === "overall"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Landmark className="h-4 w-4" /> Overall Portfolio
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("thavanai")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === "thavanai"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <ReceiptIndianRupee className="h-4 w-4" /> Thavanai
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">{thavanai.totalLoans}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("monthlyVatti")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === "monthlyVatti"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Percent className="h-4 w-4" /> Vatti
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">{monthlyVatti.activeLoans}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("runVati")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === "runVati"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Coins className="h-4 w-4" /> Run Vati
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">{runVati.activeLoans}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === "all"
              ? "bg-secondary text-secondary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          All Accounts View
        </button>
      </div>

      {/* OVERALL TAB */}
      {(activeTab === "overall" || activeTab === "all") && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" /> Overall Portfolio Dashboard
            </h2>
            <span className="text-xs text-muted-foreground">Consolidated across all 3 loan categories</span>
          </div>

          {/* Overdue & Today Alerts */}
          {(Number(overall.overdueAmount) > 0 || Number(overall.todayCollection) > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/collections/overdue"
                className="group flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 transition-colors hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30"
              >
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    <TriangleAlert className="h-3.5 w-3.5" /> Total Overdue Amount
                  </p>
                  <p className="num mt-1 text-xl font-semibold text-rose-900 dark:text-rose-100">{formatINR(overall.overdueAmount)}</p>
                  <p className="text-xs text-muted-foreground">Across Thavanai, Vatti & Run Vati</p>
                </div>
                <ArrowRight className="h-5 w-5 text-rose-600 transition-transform group-hover:translate-x-0.5 dark:text-rose-400" />
              </Link>

              <Link
                href="/collections/today"
                className="group flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 p-4 transition-colors hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30"
              >
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                    <CalendarClock className="h-3.5 w-3.5" /> Today’s Collections Received
                  </p>
                  <p className="num mt-1 text-xl font-semibold text-teal-900 dark:text-teal-100">{formatINR(overall.todayCollection)}</p>
                  <p className="text-xs text-muted-foreground">This week: {formatINR(overall.weekCollection)} · This month: {formatINR(overall.monthCollection)}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-teal-600 transition-transform group-hover:translate-x-0.5 dark:text-teal-400" />
              </Link>
            </div>
          )}

          {/* Primary Overall Stat Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Cash Disbursed" value={formatINR(overall.cashDisbursed)} hint="Total net cash handed out" icon={Wallet} />
            <StatCard label="Active Collected" value={formatINR(overall.activeCollected)} hint="Received on currently active loans" icon={PiggyBank} tone="soft" />
            <StatCard label="Outstanding Receivables" value={formatINR(overall.outstandingReceivables)} hint="Total pending recovery across categories" icon={CircleDollarSign} tone="primary" />
            <StatCard label="Unique Borrowers" value={String(overall.totalCustomers)} hint={`${overall.activeLoans} active loan accounts`} icon={Users} />
          </div>

          {/* Category Breakdown Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Thavanai Loans</span>
                <ReceiptIndianRupee className="h-4 w-4 text-teal-600" />
              </div>
              <p className="num mt-2 text-xl font-bold">{formatINR(thavanai.remainingBalance)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Remaining repayment balance</p>
              <div className="mt-3 flex items-center justify-between text-xs border-t border-teal-200 dark:border-teal-900/50 pt-2">
                <span>{thavanai.totalLoans} active accounts</span>
                <span className="num font-medium text-emerald-700 dark:text-emerald-400">{formatINR(thavanai.totalCollected)} paid</span>
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Vatti Loans</span>
                <Percent className="h-4 w-4 text-blue-600" />
              </div>
              <p className="num mt-2 text-xl font-bold">{formatINR(monthlyVatti.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Principal: {formatINR(monthlyVatti.outstandingPrincipal)} · Interest: {formatINR(monthlyVatti.interestPending)}</p>
              <div className="mt-3 flex items-center justify-between text-xs border-t border-blue-200 dark:border-blue-900/50 pt-2">
                <span>{monthlyVatti.activeLoans} active accounts</span>
                <span className="num font-medium text-blue-700 dark:text-blue-300">{formatINR(monthlyVatti.interestCollected)} int. paid</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Run Vati Loans</span>
                <Coins className="h-4 w-4 text-amber-600" />
              </div>
              <p className="num mt-2 text-xl font-bold">{formatINR(runVati.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Principal: {formatINR(runVati.outstandingPrincipal)} · Interest: {formatINR(runVati.interestPending)}</p>
              <div className="mt-3 flex items-center justify-between text-xs border-t border-amber-200 dark:border-amber-900/50 pt-2">
                <span>{runVati.activeLoans} active accounts</span>
                <span className="num font-medium text-amber-700 dark:text-amber-300">{formatINR(runVati.interestCollected)} int. paid</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THAVANAI TAB */}
      {(activeTab === "thavanai" || activeTab === "all") && (
        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between border-t border-border pt-4">
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2 text-teal-700 dark:text-teal-300">
              <ReceiptIndianRupee className="h-5 w-5" /> Thavanai (Installments) Dashboard
            </h2>
            <Link href="/loans?category=THAVANAI" className="text-xs text-teal-700 hover:underline">
              View all Thavanai loans →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active Thavanai Loans" value={String(thavanai.totalLoans)} hint="Installment loans active" icon={ReceiptIndianRupee} />
            <StatCard label="Disbursed (Net)" value={formatINR(thavanai.amountDisbursed)} hint="Actual cash disbursed" icon={Wallet} />
            <StatCard label="Total Repayment" value={formatINR(thavanai.repaymentCommitment)} hint="Total contractual repayment" icon={Landmark} />
            <StatCard label="Remaining Balance" value={formatINR(thavanai.remainingBalance)} hint="Outstanding principal & margin" icon={CircleDollarSign} tone="primary" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Collected to Date" value={formatINR(thavanai.totalCollected)} hint="Total collected" icon={PiggyBank} tone="soft" />
            <StatCard
              label="Due Today"
              value={formatINR(thavanai.todayInstallmentsAmount)}
              hint={`${thavanai.todayInstallmentsCount} installment(s)`}
              icon={CalendarClock}
            />
            <StatCard
              label="Overdue Installments"
              value={formatINR(thavanai.overdueInstallmentsAmount)}
              hint={`${thavanai.overdueInstallmentsCount} installment(s) overdue`}
              icon={TriangleAlert}
              tone={Number(thavanai.overdueInstallmentsAmount) > 0 ? "rose" : "default"}
            />
            <StatCard label="Expected Gross Margin" value={formatINR(thavanai.expectedGrossMargin)} hint="Repayment total minus net disbursed" icon={Coins} tone="blue" />
          </div>
        </div>
      )}

      {/* VATTI (MONTHLY) TAB */}
      {(activeTab === "monthlyVatti" || activeTab === "all") && (
        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between border-t border-border pt-4">
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Percent className="h-5 w-5" /> Vatti (Monthly) Dashboard
            </h2>
            <Link href="/loans?category=MONTHLY_VATTI" className="text-xs text-blue-700 hover:underline">
              View all Vatti loans →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active Monthly Loans" value={String(monthlyVatti.activeLoans)} hint="Monthly interest accounts" icon={Percent} />
            <StatCard label="Principal Disbursed" value={formatINR(monthlyVatti.principalDisbursed)} hint="Total principal lent" icon={Landmark} />
            <StatCard label="Outstanding Principal" value={formatINR(monthlyVatti.outstandingPrincipal)} hint="Principal remaining to recover" icon={Wallet} tone="soft" />
            <StatCard label="Total Outstanding" value={formatINR(monthlyVatti.totalOutstanding)} hint="Principal + Pending Interest" icon={CircleDollarSign} tone="primary" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Interest Accrued" value={formatINR(monthlyVatti.interestAccrued)} hint="Accrued to date (no compounding)" icon={Coins} />
            <StatCard label="Interest Collected" value={formatINR(monthlyVatti.interestCollected)} hint="Interest actually received" icon={PiggyBank} tone="blue" />
            <StatCard label="Interest Pending" value={formatINR(monthlyVatti.interestPending)} hint="Accrued but unpaid interest" icon={CalendarClock} />
            <StatCard
              label="Overdue Interest"
              value={formatINR(monthlyVatti.overdueInterest)}
              hint={`${monthlyVatti.overdueCount} cycle(s) overdue`}
              icon={TriangleAlert}
            />
          </div>
        </div>
      )}

      {/* RUN VATI TAB */}
      {(activeTab === "runVati" || activeTab === "all") && (
        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between border-t border-border pt-4">
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Coins className="h-5 w-5" /> Run Vati Dashboard
            </h2>
            <Link href="/loans?category=WEEKLY_RUN_VATI" className="text-xs text-amber-700 hover:underline">
              View all Run Vati loans →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active Weekly Loans" value={String(runVati.activeLoans)} hint="Weekly interest accounts" icon={Coins} />
            <StatCard label="Principal Disbursed" value={formatINR(runVati.principalDisbursed)} hint="Total principal lent" icon={Landmark} />
            <StatCard label="Outstanding Principal" value={formatINR(runVati.outstandingPrincipal)} hint="Principal remaining to recover" icon={Wallet} tone="soft" />
            <StatCard label="Total Outstanding" value={formatINR(runVati.totalOutstanding)} hint="Principal + Pending Interest" icon={CircleDollarSign} tone="primary" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Weekly Interest Accrued" value={formatINR(runVati.weeklyInterestAccrued)} hint="Accrued weekly cycles" icon={Percent} />
            <StatCard label="Interest Collected" value={formatINR(runVati.interestCollected)} hint="Weekly interest collected" icon={PiggyBank} tone="blue" />
            <StatCard label="Interest Pending" value={formatINR(runVati.interestPending)} hint="Accrued but unpaid interest" icon={CalendarClock} />
            <StatCard
              label="Overdue Interest"
              value={formatINR(runVati.overdueInterest)}
              hint={`${runVati.overdueCount} cycle(s) overdue`}
              icon={TriangleAlert}
            />
          </div>
        </div>
      )}

      {/* Charts & Due Today */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <CollectionTrendChart data={trend} />

          {/* Due Today Table */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-teal-600" /> Due today
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/collections/today">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {dueToday.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500/80 mb-2" />
                  <p className="font-medium text-foreground text-sm">All clear for today</p>
                  <p>No installments or interest payments scheduled for collection today.</p>
                </div>
              ) : (
                <div className="divide-y divide-border text-xs">
                  {dueToday.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/customers/${item.customer.id}`} className="font-medium text-foreground hover:underline">
                            {item.customer.fullName}
                          </Link>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${LOAN_CATEGORY_TONES[item.category]}`}>
                            {LOAN_CATEGORY_LABELS[item.category]}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {item.customer.mobile} · {item.loan.reference}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num font-semibold text-primary">{formatINR(item.outstanding)}</p>
                        <Link href={`/loans/${item.loan.id}#record`} className="text-[11px] text-teal-700 hover:underline">
                          Collect →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <LoanStatusChart statusCounts={statusCounts} />

          {/* Recent Payments */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <ReceiptIndianRupee className="h-4 w-4 text-emerald-600" /> Recent collections
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/payments">
                  All <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentPayments.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-border text-xs">
                  {recentPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2">
                      <div>
                        <Link href={`/payments/${p.id}`} className="font-medium text-foreground hover:underline">
                          {p.customer.fullName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {p.receiptNumber} · {p.loan.reference}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(p.amount)}</p>
                        <p className="text-[10px] text-muted-foreground">{p.mode}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
