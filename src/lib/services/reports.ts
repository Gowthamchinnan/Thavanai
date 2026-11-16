import { prisma } from "@/lib/db";
import type { LoanStatus } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { buildWorkbookBuffer, type SheetSpec } from "@/lib/excel";
import {
  formatDateISO,
  getIndiaMonthRange,
  getIndiaTodayISO,
  indiaDayRangeUTC,
  isValidISODate,
} from "@/lib/dates";
import { collectedByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";
import { LOAN_STATUS_LABELS, FREQUENCY_LABELS, PAYMENT_MODE_LABELS, REPORT_TYPE_OPTIONS } from "@/lib/constants";
import { getSettings } from "@/lib/services/settings";

export type ReportType = (typeof REPORT_TYPE_OPTIONS)[number]["value"];

export function isReportType(value: string): value is ReportType {
  return REPORT_TYPE_OPTIONS.some((t) => t.value === value);
}

function resolveRange(from?: string | null, to?: string | null) {
  const today = getIndiaTodayISO();
  const defaultFrom = getIndiaMonthRange().from;
  const f = from && isValidISODate(from) ? from : defaultFrom;
  const t = to && isValidISODate(to) ? to : today;
  const [startDate, endDate] = f <= t ? [f, t] : [t, f];
  return {
    from: startDate,
    to: endDate,
    start: indiaDayRangeUTC(startDate).start,
    end: indiaDayRangeUTC(endDate).end,
  };
}

const moneyNotes = [
  "All amounts are in Indian Rupees (INR) and recorded with two decimal places.",
  "Expected gross margin is contractual repayment minus net cash disbursed. It is not guaranteed profit.",
  "Cash collected is money actually received and recorded by the administrator; it is not the same as margin.",
];

export async function generateReport(
  type: ReportType,
  params: { from?: string | null; to?: string | null },
): Promise<{ filename: string; buffer: Buffer; sheetNames: string[] }> {
  await syncInstallmentStatuses();
  const settings = await getSettings();
  const generatedAt = new Date();
  const today = getIndiaTodayISO();
  const specs: SheetSpec[] = [];

  if (type === "customers") {
    const customers = await prisma.customer.findMany({
      include: { loans: { select: { id: true, status: true, totalRepayment: true } } },
      orderBy: { createdAt: "desc" },
    });
    const collected = await collectedByLoan(customers.flatMap((c) => c.loans.map((l) => l.id)));
    const rows = customers.map((customer) => {
      const active = customer.loans.filter((l) => l.status === "ACTIVE");
      const outstanding = sumMoney(active.map((l) => outstandingFrom(l.totalRepayment, collected.get(l.id) ?? "0")));
      return {
        code: customer.code,
        name: customer.fullName,
        mobile: customer.mobile,
        alternateMobile: customer.alternateMobile ?? "",
        address: customer.address ?? "",
        totalLoans: customer.loans.length,
        activeLoans: active.length,
        outstanding: money(outstanding),
        status: customer.archivedAt ? "Archived" : "Active",
        createdAt: formatDateISO(customer.createdAt.toISOString().slice(0, 10)),
      };
    });
    specs.push({
      name: "Customers",
      title: "Customer list",
      columns: [
        { header: "Customer code", key: "code", width: 14 },
        { header: "Full name", key: "name", width: 24 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Alternate mobile", key: "alternateMobile", width: 16 },
        { header: "Address", key: "address", width: 30 },
        { header: "Total loans", key: "totalLoans", width: 10, integer: true },
        { header: "Active loans", key: "activeLoans", width: 10, integer: true },
        { header: "Outstanding (active)", key: "outstanding", width: 18, money: true },
        { header: "Record status", key: "status", width: 12 },
        { header: "Created", key: "createdAt", width: 14 },
      ],
      rows,
      totals: {
        name: `${rows.length} customers`,
        totalLoans: rows.reduce((sum, r) => sum + r.totalLoans, 0),
        activeLoans: rows.reduce((sum, r) => sum + r.activeLoans, 0),
        outstanding: money(sumMoney(rows.map((r) => r.outstanding))),
      },
      notes: moneyNotes,
    });
  }

  if (type === "active-loans" || type === "outstanding" || type === "margin") {
    const statuses: LoanStatus[] = type === "active-loans" || type === "outstanding" ? ["ACTIVE"] : ["ACTIVE", "COMPLETED", "WRITTEN_OFF"];
    const loans = await prisma.loan.findMany({
      where: { status: { in: statuses } },
      include: { customer: { select: { fullName: true, mobile: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });
    const collected = await collectedByLoan(loans.map((l) => l.id));
    const rows = loans
      .map((loan) => {
        const paid = collected.get(loan.id) ?? "0";
        return {
          id: loan.id,
          reference: loan.reference,
          customer: loan.customer.fullName,
          code: loan.customer.code,
          mobile: loan.customer.mobile,
          status: LOAN_STATUS_LABELS[loan.status] ?? loan.status,
          frequency: FREQUENCY_LABELS[loan.frequency] ?? loan.frequency,
          nominal: money(loan.nominalAmount),
          deduction: money(loan.deductionAmount),
          netDisbursed: money(loan.netDisbursed),
          totalRepayment: money(loan.totalRepayment),
          collected: paid,
          outstanding: outstandingFrom(loan.totalRepayment, paid),
          expectedMargin: money(D(loan.totalRepayment).minus(D(loan.netDisbursed))),
          cashSurplus: money(D(paid).minus(D(loan.netDisbursed))),
          startDate: loan.startDate.toISOString().slice(0, 10),
          installmentCount: loan.installmentCount,
          installmentAmount: money(loan.installmentAmount),
        };
      })
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));

    const columns = [
      { header: "Loan reference", key: "reference", width: 16 },
      { header: "Customer", key: "customer", width: 24 },
      { header: "Customer code", key: "code", width: 13 },
      { header: "Mobile", key: "mobile", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Frequency", key: "frequency", width: 11 },
      { header: "Nominal amount", key: "nominal", width: 15, money: true },
      { header: "Deduction", key: "deduction", width: 13, money: true },
      { header: "Net cash disbursed", key: "netDisbursed", width: 17, money: true },
      { header: "Contractual repayment", key: "totalRepayment", width: 19, money: true },
      { header: "Cash collected", key: "collected", width: 15, money: true },
      { header: "Outstanding", key: "outstanding", width: 15, money: true },
      { header: "Expected gross margin", key: "expectedMargin", width: 19, money: true },
      { header: "Collected less net disbursed", key: "cashSurplus", width: 22, money: true },
      { header: "Installments", key: "installmentCount", width: 11, integer: true },
      { header: "Installment amount", key: "installmentAmount", width: 17, money: true },
      { header: "Start date", key: "startDate", width: 12 },
    ];
    const title =
      type === "active-loans" ? "Active loan report" : type === "outstanding" ? "Outstanding loan report" : "Expected margin vs cash collected";
    specs.push({
      name: type === "margin" ? "Margin vs collected" : "Loans",
      title,
      columns,
      rows,
      totals: {
        customer: `${rows.length} loans`,
        nominal: money(sumMoney(rows.map((r) => r.nominal))),
        deduction: money(sumMoney(rows.map((r) => r.deduction))),
        netDisbursed: money(sumMoney(rows.map((r) => r.netDisbursed))),
        totalRepayment: money(sumMoney(rows.map((r) => r.totalRepayment))),
        collected: money(sumMoney(rows.map((r) => r.collected))),
        outstanding: money(sumMoney(rows.map((r) => r.outstanding))),
        expectedMargin: money(sumMoney(rows.map((r) => r.expectedMargin))),
        cashSurplus: money(sumMoney(rows.map((r) => r.cashSurplus))),
      },
      notes: moneyNotes,
    });
  }

  if (type === "collections") {
    const range = resolveRange(params.from, params.to);
    const payments = await prisma.payment.findMany({
      where: { status: "POSTED", paidAt: { gte: range.start, lt: range.end } },
      include: {
        customer: { select: { fullName: true, mobile: true } },
        loan: { select: { reference: true, frequency: true } },
      },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });
    const voided = await prisma.payment.count({
      where: { status: "VOIDED", paidAt: { gte: range.start, lt: range.end } },
    });

    const daily = new Map<string, { count: number; total: ReturnType<typeof D> }>();
    for (const payment of payments) {
      const day = getIndiaTodayISO(payment.paidAt);
      const current = daily.get(day) ?? { count: 0, total: D(0) };
      current.count += 1;
      current.total = current.total.plus(D(payment.amount));
      daily.set(day, current);
    }
    const summaryRows = Array.from(daily.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, value]) => ({ day, count: value.count, total: money(value.total) }));

    specs.push({
      name: "Daily summary",
      title: "Collection report — daily summary",
      subtitle: `${formatDateISO(range.from)} to ${formatDateISO(range.to)}`,
      columns: [
        { header: "Payment date", key: "day", width: 14 },
        { header: "Payments", key: "count", width: 12, integer: true },
        { header: "Cash collected", key: "total", width: 18, money: true },
      ],
      rows: summaryRows,
      totals: { day: `${payments.length} payments`, count: payments.length, total: money(sumMoney(payments.map((p) => p.amount))) },
      notes: [...moneyNotes, `Voided payments in range (excluded from totals): ${voided}.`],
    });

    specs.push({
      name: "Payments",
      title: "Collection report — payment detail",
      subtitle: `${formatDateISO(range.from)} to ${formatDateISO(range.to)}`,
      columns: [
        { header: "Receipt number", key: "receipt", width: 18 },
        { header: "Payment date", key: "paidAt", width: 20 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Loan reference", key: "loan", width: 16 },
        { header: "Frequency", key: "frequency", width: 11 },
        { header: "Mode", key: "mode", width: 18 },
        { header: "Amount received", key: "amount", width: 16, money: true },
        { header: "Notes", key: "notes", width: 30 },
      ],
      rows: payments.map((payment) => ({
        receipt: payment.receiptNumber,
        paidAt: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(payment.paidAt),
        customer: payment.customer.fullName,
        mobile: payment.customer.mobile,
        loan: payment.loan.reference,
        frequency: FREQUENCY_LABELS[payment.loan.frequency] ?? payment.loan.frequency,
        mode: PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode,
        amount: money(payment.amount),
        notes: payment.notes ?? "",
      })),
      totals: { customer: `${payments.length} payments`, amount: money(sumMoney(payments.map((p) => p.amount))) },
      notes: moneyNotes,
    });
  }

  if (type === "overdue") {
    const range = params.from || params.to ? resolveRange(params.from, params.to) : null;
    const installments = await prisma.installment.findMany({
      where: {
        status: "OVERDUE",
        loan: { status: "ACTIVE" },
        ...(range ? { dueDate: { gte: indiaDayRangeUTC(range.from).start, lt: range.end } } : {}),
      },
      include: {
        loan: { include: { customer: { select: { fullName: true, mobile: true, code: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
    });
    const collected = await collectedByLoan(Array.from(new Set(installments.map((i) => i.loanId))));
    const rows = installments.map((installment) => {
      const dueDate = installment.dueDate.toISOString().slice(0, 10);
      return {
        reference: installment.loan.reference,
        customer: installment.loan.customer.fullName,
        mobile: installment.loan.customer.mobile,
        sequence: installment.sequence,
        dueDate,
        scheduled: money(installment.scheduledAmount),
        paid: money(installment.paidAmount),
        outstanding: money(D(installment.scheduledAmount).minus(D(installment.paidAmount))),
        daysOverdue: Math.max(0, Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000)),
        loanBalance: outstandingFrom(installment.loan.totalRepayment, collected.get(installment.loanId) ?? "0"),
        frequency: FREQUENCY_LABELS[installment.loan.frequency],
      };
    });
    specs.push({
      name: "Overdue installments",
      title: "Overdue installments report",
      subtitle: range ? `${formatDateISO(range.from)} to ${formatDateISO(range.to)}` : `As of ${formatDateISO(today)}`,
      columns: [
        { header: "Loan reference", key: "reference", width: 16 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Installment #", key: "sequence", width: 12, integer: true },
        { header: "Due date", key: "dueDate", width: 12 },
        { header: "Scheduled", key: "scheduled", width: 14, money: true },
        { header: "Already paid", key: "paid", width: 14, money: true },
        { header: "Overdue amount", key: "outstanding", width: 16, money: true },
        { header: "Days overdue", key: "daysOverdue", width: 12, integer: true },
        { header: "Loan balance", key: "loanBalance", width: 16, money: true },
        { header: "Frequency", key: "frequency", width: 11 },
      ],
      rows,
      totals: {
        customer: `${rows.length} installments`,
        scheduled: money(sumMoney(rows.map((r) => r.scheduled))),
        paid: money(sumMoney(rows.map((r) => r.paid))),
        outstanding: money(sumMoney(rows.map((r) => r.outstanding))),
      },
      notes: moneyNotes,
    });
  }

  if (type === "ledger") {
    const loans = await prisma.loan.findMany({
      include: { customer: { select: { fullName: true, mobile: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });
    const collected = await collectedByLoan(loans.map((l) => l.id));
    const loanRows = loans.map((loan) => {
      const paid = collected.get(loan.id) ?? "0";
      return {
        reference: loan.reference,
        customer: loan.customer.fullName,
        mobile: loan.customer.mobile,
        status: LOAN_STATUS_LABELS[loan.status],
        frequency: FREQUENCY_LABELS[loan.frequency],
        nominal: money(loan.nominalAmount),
        deduction: money(loan.deductionAmount),
        netDisbursed: money(loan.netDisbursed),
        totalRepayment: money(loan.totalRepayment),
        collected: paid,
        outstanding: outstandingFrom(loan.totalRepayment, paid),
        createdAt: formatDateISO(loan.createdAt.toISOString().slice(0, 10)),
      };
    });
    specs.push({
      name: "Loan ledger",
      title: "Loan ledger report",
      columns: [
        { header: "Loan reference", key: "reference", width: 16 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Status", key: "status", width: 13 },
        { header: "Frequency", key: "frequency", width: 11 },
        { header: "Nominal", key: "nominal", width: 14, money: true },
        { header: "Deduction", key: "deduction", width: 13, money: true },
        { header: "Net disbursed", key: "netDisbursed", width: 15, money: true },
        { header: "Contractual repayment", key: "totalRepayment", width: 19, money: true },
        { header: "Collected", key: "collected", width: 14, money: true },
        { header: "Outstanding", key: "outstanding", width: 14, money: true },
        { header: "Created", key: "createdAt", width: 12 },
      ],
      rows: loanRows,
      totals: {
        customer: `${loanRows.length} loans`,
        nominal: money(sumMoney(loanRows.map((r) => r.nominal))),
        deduction: money(sumMoney(loanRows.map((r) => r.deduction))),
        netDisbursed: money(sumMoney(loanRows.map((r) => r.netDisbursed))),
        totalRepayment: money(sumMoney(loanRows.map((r) => r.totalRepayment))),
        collected: money(sumMoney(loanRows.map((r) => r.collected))),
        outstanding: money(sumMoney(loanRows.map((r) => r.outstanding))),
      },
      notes: moneyNotes,
    });

    const payments = await prisma.payment.findMany({
      where: { status: "POSTED" },
      include: {
        customer: { select: { fullName: true, mobile: true } },
        loan: { select: { reference: true } },
      },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });
    specs.push({
      name: "Payment ledger",
      title: "Payment ledger (posted payments)",
      columns: [
        { header: "Receipt", key: "receipt", width: 18 },
        { header: "Date", key: "date", width: 20 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Loan", key: "loan", width: 16 },
        { header: "Mode", key: "mode", width: 18 },
        { header: "Amount", key: "amount", width: 15, money: true },
      ],
      rows: payments.map((payment) => ({
        receipt: payment.receiptNumber,
        date: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(payment.paidAt),
        customer: payment.customer.fullName,
        mobile: payment.customer.mobile,
        loan: payment.loan.reference,
        mode: PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode,
        amount: money(payment.amount),
      })),
      totals: { customer: `${payments.length} payments`, amount: money(sumMoney(payments.map((p) => p.amount))) },
    });
  }

  const buffer = await buildWorkbookBuffer(specs, {
    businessName: settings.businessName,
    generatedAt,
    filters: params.from || params.to ? undefined : "Default reporting period",
  });

  return {
    filename: `thavanai-${type}-${today}.xlsx`,
    buffer,
    sheetNames: specs.map((s) => s.name),
  };
}
