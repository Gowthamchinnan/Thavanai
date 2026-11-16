import type { Metadata } from "next";
import { CalendarRange, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { getIndiaMonthRange, getIndiaTodayISO, formatDateISO } from "@/lib/dates";
import { REPORT_TYPE_OPTIONS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportDownloadForm } from "@/components/forms/report-form";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const range = getIndiaMonthRange();
  const today = getIndiaTodayISO();
  const [customers, activeLoans, postedPayments, overdue] = await Promise.all([
    prisma.customer.count(),
    prisma.loan.count({ where: { status: "ACTIVE" } }),
    prisma.payment.count({ where: { status: "POSTED" } }),
    prisma.installment.count({ where: { status: "OVERDUE", loan: { status: "ACTIVE" } } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Server-generated Excel workbooks built from persisted records. Reports are exported on demand and never cached."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customers</p>
          <p className="num mt-1 text-xl font-semibold">{customers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active loans</p>
          <p className="num mt-1 text-xl font-semibold">{activeLoans}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Posted payments</p>
          <p className="num mt-1 text-xl font-semibold">{postedPayments}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue installments</p>
          <p className="num mt-1 text-xl font-semibold">{overdue}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Download a report
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Default range {formatDateISO(range.from)} to {formatDateISO(today)}. Choose a report and range, then download.
            </p>
          </CardHeader>
          <CardContent>
            <ReportDownloadForm defaultFrom={range.from} defaultTo={today} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> What each report contains
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {REPORT_TYPE_OPTIONS.map((report) => (
              <div key={report.value} className="rounded-lg border border-border bg-muted/25 p-3">
                <p className="text-sm font-medium">{report.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{report.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="flex items-start gap-3 pt-5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Reporting integrity</p>
            <p>
              Voided payments are excluded from collection totals but remain in the audit log. All monetary figures use INR with
              two decimal places, and dates use Asia/Kolkata. Expected margin is contractual repayment minus net cash disbursed,
              not proof of profit.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
