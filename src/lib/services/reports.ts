import { prisma } from "@/lib/db";
import type { LoanCategory, Prisma } from "@prisma/client";
import { D, money, sumMoney } from "@/lib/money";
import { buildWorkbookBuffer, type SheetSpec } from "@/lib/excel";
import {
  formatDateISO,
  getIndiaMonthRange,
  getIndiaTodayISO,
  indiaDayRangeUTC,
  isValidISODate,
} from "@/lib/dates";
import { paymentBreakdownByLoan, outstandingFrom } from "@/lib/services/balances";
import { syncInstallmentStatuses } from "@/lib/services/status-sync";
import {
  LOAN_STATUS_LABELS,
  LOAN_CATEGORY_LABELS,
  FREQUENCY_LABELS,
  PAYMENT_MODE_LABELS,
  INTEREST_CALCULATION_METHOD_LABELS,
  REPORT_TYPE_OPTIONS,
} from "@/lib/constants";
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
  "Thavanai outstanding represents contractual remaining repayment.",
  "Vatti & Run Vati outstanding represents remaining principal plus accrued unpaid interest.",
  "Never capitalizes unpaid interest silently; simple interest and explicit configuration.",
];

export interface ReportParams {
  from?: string | null;
  to?: string | null;
  customerId?: string | null;
  category?: string | null;
  status?: string | null;
}

export async function generateReport(
  type: ReportType,
  params: ReportParams,
): Promise<{ filename: string; buffer: Buffer; sheetNames: string[] }> {
  await syncInstallmentStatuses();
  const settings = await getSettings();
  const generatedAt = new Date();
  const today = getIndiaTodayISO();
  const specs: SheetSpec[] = [];

  const range = resolveRange(params.from, params.to);

  // Helper to build sheets:
  // 1. Overall Summary Sheet
  async function buildOverallSummarySheet(): Promise<SheetSpec> {
    const [loans, payments, customersCount] = await Promise.all([
      prisma.loan.findMany({
        include: {
          installments: true,
          interestPeriods: true,
          payments: { where: { status: "POSTED" }, select: { amount: true, principalAmount: true, interestAmount: true } },
        },
      }),
      prisma.payment.aggregate({ where: { status: "POSTED" }, _sum: { amount: true, principalAmount: true, interestAmount: true } }),
      prisma.customer.count({ where: { archivedAt: null } }),
    ]);

    const activeLoans = loans.filter((l) => l.status === "ACTIVE");
    const thavanaiActive = activeLoans.filter((l) => l.category === "THAVANAI");
    const vattiActive = activeLoans.filter((l) => l.category === "MONTHLY_VATTI");
    const runVatiActive = activeLoans.filter((l) => l.category === "WEEKLY_RUN_VATI");

    const thavanaiDisbursed = sumMoney(thavanaiActive.map((l) => l.netDisbursed));
    const thavanaiRepayment = sumMoney(thavanaiActive.map((l) => l.totalRepayment));
    const thavanaiCollected = sumMoney(thavanaiActive.flatMap((l) => l.payments.map((p) => p.amount)));
    const thavanaiOutstanding = thavanaiRepayment.minus(thavanaiCollected).clamp(0, Infinity);

    const vattiDisbursed = sumMoney(vattiActive.map((l) => l.nominalAmount));
    const vattiPrincipalPaid = sumMoney(vattiActive.flatMap((l) => l.payments.map((p) => p.principalAmount)));
    const vattiPrincipalOutstanding = vattiDisbursed.minus(vattiPrincipalPaid).clamp(0, Infinity);
    const vattiAccrued = sumMoney(
      vattiActive.flatMap((l) => l.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount)),
    );
    const vattiInterestPaid = sumMoney(vattiActive.flatMap((l) => l.payments.map((p) => p.interestAmount)));
    const vattiInterestPending = vattiAccrued.minus(vattiInterestPaid).clamp(0, Infinity);
    const vattiTotalOutstanding = vattiPrincipalOutstanding.plus(vattiInterestPending);

    const runVatiDisbursed = sumMoney(runVatiActive.map((l) => l.nominalAmount));
    const runVatiPrincipalPaid = sumMoney(runVatiActive.flatMap((l) => l.payments.map((p) => p.principalAmount)));
    const runVatiPrincipalOutstanding = runVatiDisbursed.minus(runVatiPrincipalPaid).clamp(0, Infinity);
    const runVatiAccrued = sumMoney(
      runVatiActive.flatMap((l) => l.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount)),
    );
    const runVatiInterestPaid = sumMoney(runVatiActive.flatMap((l) => l.payments.map((p) => p.interestAmount)));
    const runVatiInterestPending = runVatiAccrued.minus(runVatiInterestPaid).clamp(0, Infinity);
    const runVatiTotalOutstanding = runVatiPrincipalOutstanding.plus(runVatiInterestPending);

    const totalDisbursed = thavanaiDisbursed.plus(vattiDisbursed).plus(runVatiDisbursed);
    const totalCollected = thavanaiCollected
      .plus(vattiPrincipalPaid)
      .plus(vattiInterestPaid)
      .plus(runVatiPrincipalPaid)
      .plus(runVatiInterestPaid);
    const totalOutstanding = thavanaiOutstanding.plus(vattiTotalOutstanding).plus(runVatiTotalOutstanding);

    const summaryRows = [
      {
        metric: "Active Customers",
        thavanai: new Set(thavanaiActive.map((l) => l.customerId)).size,
        monthlyVatti: new Set(vattiActive.map((l) => l.customerId)).size,
        runVati: new Set(runVatiActive.map((l) => l.customerId)).size,
        total: customersCount,
      },
      {
        metric: "Active Loans Count",
        thavanai: thavanaiActive.length,
        monthlyVatti: vattiActive.length,
        runVati: runVatiActive.length,
        total: activeLoans.length,
      },
      {
        metric: "Cash Disbursed (INR)",
        thavanai: money(thavanaiDisbursed),
        monthlyVatti: money(vattiDisbursed),
        runVati: money(runVatiDisbursed),
        total: money(totalDisbursed),
      },
      {
        metric: "Amount Collected (Active Loans, INR)",
        thavanai: money(thavanaiCollected),
        monthlyVatti: money(vattiPrincipalPaid.plus(vattiInterestPaid)),
        runVati: money(runVatiPrincipalPaid.plus(runVatiInterestPaid)),
        total: money(totalCollected),
      },
      {
        metric: "Outstanding Principal / Repayment (INR)",
        thavanai: money(thavanaiOutstanding),
        monthlyVatti: money(vattiPrincipalOutstanding),
        runVati: money(runVatiPrincipalOutstanding),
        total: money(thavanaiOutstanding.plus(vattiPrincipalOutstanding).plus(runVatiPrincipalOutstanding)),
      },
      {
        metric: "Pending Accrued Interest (INR)",
        thavanai: "0.00",
        monthlyVatti: money(vattiInterestPending),
        runVati: money(runVatiInterestPending),
        total: money(vattiInterestPending.plus(runVatiInterestPending)),
      },
      {
        metric: "Total Outstanding Receivables (INR)",
        thavanai: money(thavanaiOutstanding),
        monthlyVatti: money(vattiTotalOutstanding),
        runVati: money(runVatiTotalOutstanding),
        total: money(totalOutstanding),
      },
      {
        metric: "Lifetime Collections (All Posted Payments, INR)",
        thavanai: "—",
        monthlyVatti: "—",
        runVati: "—",
        total: money(payments._sum.amount ?? 0),
      },
    ];

    return {
      name: "Overall Summary",
      title: "Portfolio Financial Summary",
      subtitle: `As of ${formatDateISO(today)}`,
      columns: [
        { header: "Metric", key: "metric", width: 34 },
        { header: "Thavanai (Installments)", key: "thavanai", width: 22 },
        { header: "Vatti", key: "monthlyVatti", width: 20 },
        { header: "Run Vati", key: "runVati", width: 22 },
        { header: "Consolidated Total", key: "total", width: 24 },
      ],
      rows: summaryRows,
      notes: moneyNotes,
    };
  }

  // 2. Thavanai Loans Sheet
  async function buildThavanaiLoansSheet(): Promise<SheetSpec> {
    const loans = await prisma.loan.findMany({
      where: { category: "THAVANAI" },
      include: {
        customer: { select: { fullName: true, mobile: true, code: true } },
        installments: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const breakdowns = await paymentBreakdownByLoan(loans.map((l) => l.id));

    const rows = loans.map((loan) => {
      const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
      const outstanding = outstandingFrom(loan.totalRepayment, b.totalAmount);
      const margin = D(loan.totalRepayment).minus(D(loan.netDisbursed));
      const overdueInsts = loan.installments.filter((i) => i.status === "OVERDUE");
      const overdueAmount = money(sumMoney(overdueInsts.map((i) => D(i.scheduledAmount).minus(D(i.paidAmount)))));

      return {
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
        collected: b.totalAmount,
        outstanding,
        margin: money(margin),
        overdue: overdueAmount,
        installments: loan.installmentCount,
        startDate: loan.startDate.toISOString().slice(0, 10),
      };
    });

    return {
      name: "Thavanai Loans",
      title: "Thavanai (Installment) Loans Report",
      columns: [
        { header: "Reference", key: "reference", width: 16 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Code", key: "code", width: 12 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Frequency", key: "frequency", width: 12 },
        { header: "Nominal", key: "nominal", width: 14, money: true },
        { header: "Deduction", key: "deduction", width: 12, money: true },
        { header: "Net Disbursed", key: "netDisbursed", width: 15, money: true },
        { header: "Contractual Repayment", key: "totalRepayment", width: 19, money: true },
        { header: "Collected", key: "collected", width: 14, money: true },
        { header: "Outstanding", key: "outstanding", width: 14, money: true },
        { header: "Gross Margin", key: "margin", width: 14, money: true },
        { header: "Overdue", key: "overdue", width: 14, money: true },
        { header: "Installments", key: "installments", width: 12, integer: true },
        { header: "Start Date", key: "startDate", width: 12 },
      ],
      rows,
      totals: {
        customer: `${rows.length} loans`,
        netDisbursed: money(sumMoney(rows.map((r) => r.netDisbursed))),
        totalRepayment: money(sumMoney(rows.map((r) => r.totalRepayment))),
        collected: money(sumMoney(rows.map((r) => r.collected))),
        outstanding: money(sumMoney(rows.map((r) => r.outstanding))),
        margin: money(sumMoney(rows.map((r) => r.margin))),
        overdue: money(sumMoney(rows.map((r) => r.overdue))),
      },
      notes: moneyNotes,
    };
  }

  // 3. Vatti Loans Sheet
  async function buildMonthlyVattiLoansSheet(): Promise<SheetSpec> {
    const loans = await prisma.loan.findMany({
      where: { category: "MONTHLY_VATTI" },
      include: {
        customer: { select: { fullName: true, mobile: true, code: true } },
        interestPeriods: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const breakdowns = await paymentBreakdownByLoan(loans.map((l) => l.id));

    const rows = loans.map((loan) => {
      const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
      const outstandingPrincipal = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
      const accrued = sumMoney(
        loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
      );
      const pendingInterest = accrued.minus(D(b.interestAmount)).clamp(0, Infinity);
      const totalOutstanding = outstandingPrincipal.plus(pendingInterest);
      const overduePeriods = loan.interestPeriods.filter((p) => p.status === "OVERDUE");
      const overdueInterest = sumMoney(overduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))));

      return {
        reference: loan.reference,
        customer: loan.customer.fullName,
        code: loan.customer.code,
        mobile: loan.customer.mobile,
        status: LOAN_STATUS_LABELS[loan.status] ?? loan.status,
        principal: money(loan.nominalAmount),
        rate: `${loan.interestRate ?? "0"}% / mo`,
        method: INTEREST_CALCULATION_METHOD_LABELS[loan.interestType ?? "FLAT_SIMPLE"] ?? loan.interestType,
        collectionDay: loan.collectionDay ? `Day ${loan.collectionDay}` : "—",
        principalPaid: b.principalAmount,
        interestPaid: b.interestAmount,
        totalCollected: b.totalAmount,
        outstandingPrincipal: money(outstandingPrincipal),
        interestAccrued: money(accrued),
        pendingInterest: money(pendingInterest),
        totalOutstanding: money(totalOutstanding),
        overdueInterest: money(overdueInterest),
        startDate: loan.startDate.toISOString().slice(0, 10),
      };
    });

    return {
      name: "Vatti Loans",
      title: "Vatti (Monthly Interest Loan) Report",
      columns: [
        { header: "Reference", key: "reference", width: 16 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Code", key: "code", width: 12 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Principal", key: "principal", width: 14, money: true },
        { header: "Monthly Rate", key: "rate", width: 14 },
        { header: "Method", key: "method", width: 24 },
        { header: "Collection Day", key: "collectionDay", width: 14 },
        { header: "Principal Paid", key: "principalPaid", width: 14, money: true },
        { header: "Interest Paid", key: "interestPaid", width: 14, money: true },
        { header: "Total Collected", key: "totalCollected", width: 15, money: true },
        { header: "Outstanding Principal", key: "outstandingPrincipal", width: 18, money: true },
        { header: "Accrued Interest", key: "interestAccrued", width: 16, money: true },
        { header: "Pending Interest", key: "pendingInterest", width: 16, money: true },
        { header: "Total Outstanding", key: "totalOutstanding", width: 18, money: true },
        { header: "Overdue Interest", key: "overdueInterest", width: 16, money: true },
        { header: "Start Date", key: "startDate", width: 12 },
      ],
      rows,
      totals: {
        customer: `${rows.length} loans`,
        principal: money(sumMoney(rows.map((r) => r.principal))),
        principalPaid: money(sumMoney(rows.map((r) => r.principalPaid))),
        interestPaid: money(sumMoney(rows.map((r) => r.interestPaid))),
        totalCollected: money(sumMoney(rows.map((r) => r.totalCollected))),
        outstandingPrincipal: money(sumMoney(rows.map((r) => r.outstandingPrincipal))),
        interestAccrued: money(sumMoney(rows.map((r) => r.interestAccrued))),
        pendingInterest: money(sumMoney(rows.map((r) => r.pendingInterest))),
        totalOutstanding: money(sumMoney(rows.map((r) => r.totalOutstanding))),
        overdueInterest: money(sumMoney(rows.map((r) => r.overdueInterest))),
      },
      notes: moneyNotes,
    };
  }

  // 4. Run Vati Loans Sheet
  async function buildRunVatiLoansSheet(): Promise<SheetSpec> {
    const loans = await prisma.loan.findMany({
      where: { category: "WEEKLY_RUN_VATI" },
      include: {
        customer: { select: { fullName: true, mobile: true, code: true } },
        interestPeriods: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const breakdowns = await paymentBreakdownByLoan(loans.map((l) => l.id));

    const rows = loans.map((loan) => {
      const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
      const outstandingPrincipal = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
      const accrued = sumMoney(
        loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
      );
      const pendingInterest = accrued.minus(D(b.interestAmount)).clamp(0, Infinity);
      const totalOutstanding = outstandingPrincipal.plus(pendingInterest);
      const overduePeriods = loan.interestPeriods.filter((p) => p.status === "OVERDUE");
      const overdueInterest = sumMoney(overduePeriods.map((p) => D(p.scheduledAmount).minus(D(p.paidAmount))));

      return {
        reference: loan.reference,
        customer: loan.customer.fullName,
        code: loan.customer.code,
        mobile: loan.customer.mobile,
        status: LOAN_STATUS_LABELS[loan.status] ?? loan.status,
        principal: money(loan.nominalAmount),
        rate: `${loan.interestRate ?? "0"}% / wk`,
        method: INTEREST_CALCULATION_METHOD_LABELS[loan.interestType ?? "FLAT_SIMPLE"] ?? loan.interestType,
        principalPaid: b.principalAmount,
        interestPaid: b.interestAmount,
        totalCollected: b.totalAmount,
        outstandingPrincipal: money(outstandingPrincipal),
        interestAccrued: money(accrued),
        pendingInterest: money(pendingInterest),
        totalOutstanding: money(totalOutstanding),
        overdueInterest: money(overdueInterest),
        startDate: loan.startDate.toISOString().slice(0, 10),
      };
    });

    return {
      name: "Run Vati Loans",
      title: "Run Vati (Weekly Interest Loan) Report",
      columns: [
        { header: "Reference", key: "reference", width: 16 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Code", key: "code", width: 12 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Principal", key: "principal", width: 14, money: true },
        { header: "Weekly Rate", key: "rate", width: 14 },
        { header: "Method", key: "method", width: 24 },
        { header: "Principal Paid", key: "principalPaid", width: 14, money: true },
        { header: "Interest Paid", key: "interestPaid", width: 14, money: true },
        { header: "Total Collected", key: "totalCollected", width: 15, money: true },
        { header: "Outstanding Principal", key: "outstandingPrincipal", width: 18, money: true },
        { header: "Accrued Interest", key: "interestAccrued", width: 16, money: true },
        { header: "Pending Interest", key: "pendingInterest", width: 16, money: true },
        { header: "Total Outstanding", key: "totalOutstanding", width: 18, money: true },
        { header: "Overdue Interest", key: "overdueInterest", width: 16, money: true },
        { header: "Start Date", key: "startDate", width: 12 },
      ],
      rows,
      totals: {
        customer: `${rows.length} loans`,
        principal: money(sumMoney(rows.map((r) => r.principal))),
        principalPaid: money(sumMoney(rows.map((r) => r.principalPaid))),
        interestPaid: money(sumMoney(rows.map((r) => r.interestPaid))),
        totalCollected: money(sumMoney(rows.map((r) => r.totalCollected))),
        outstandingPrincipal: money(sumMoney(rows.map((r) => r.outstandingPrincipal))),
        interestAccrued: money(sumMoney(rows.map((r) => r.interestAccrued))),
        pendingInterest: money(sumMoney(rows.map((r) => r.pendingInterest))),
        totalOutstanding: money(sumMoney(rows.map((r) => r.totalOutstanding))),
        overdueInterest: money(sumMoney(rows.map((r) => r.overdueInterest))),
      },
      notes: moneyNotes,
    };
  }

  // 5. Payment Collections Sheet
  async function buildPaymentCollectionsSheet(): Promise<SheetSpec> {
    const where: Prisma.PaymentWhereInput = {
      status: "POSTED",
      paidAt: { gte: range.start, lt: range.end },
    };
    if (params.category && params.category !== "ALL") {
      where.loan = { category: params.category as LoanCategory };
    }
    if (params.customerId) {
      where.customerId = params.customerId;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        customer: { select: { fullName: true, mobile: true, code: true } },
        loan: { select: { reference: true, category: true } },
      },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });

    const rows = payments.map((payment) => ({
      receipt: payment.receiptNumber,
      date: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(payment.paidAt),
      customer: payment.customer.fullName,
      code: payment.customer.code,
      mobile: payment.customer.mobile,
      loan: payment.loan.reference,
      category: LOAN_CATEGORY_LABELS[payment.loan.category] ?? payment.loan.category,
      mode: PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode,
      amount: money(payment.amount),
      principal: money(payment.principalAmount),
      interest: money(payment.interestAmount),
      notes: payment.notes ?? "",
    }));

    return {
      name: "Payment Collections",
      title: "Manual Payment Collections Report",
      subtitle: `${formatDateISO(range.from)} to ${formatDateISO(range.to)}`,
      columns: [
        { header: "Receipt #", key: "receipt", width: 18 },
        { header: "Payment Date", key: "date", width: 20 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Code", key: "code", width: 12 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Loan Reference", key: "loan", width: 16 },
        { header: "Category", key: "category", width: 18 },
        { header: "Mode", key: "mode", width: 16 },
        { header: "Total Received", key: "amount", width: 16, money: true },
        { header: "Principal Portion", key: "principal", width: 16, money: true },
        { header: "Interest Portion", key: "interest", width: 16, money: true },
        { header: "Notes", key: "notes", width: 26 },
      ],
      rows,
      totals: {
        customer: `${payments.length} payments`,
        amount: money(sumMoney(payments.map((p) => p.amount))),
        principal: money(sumMoney(payments.map((p) => p.principalAmount))),
        interest: money(sumMoney(payments.map((p) => p.interestAmount))),
      },
      notes: moneyNotes,
    };
  }

  // 6. Outstanding Balances Sheet
  async function buildOutstandingBalancesSheet(): Promise<SheetSpec> {
    const customers = await prisma.customer.findMany({
      where: { archivedAt: null },
      include: {
        loans: {
          where: { status: "ACTIVE" },
          include: {
            installments: true,
            interestPeriods: true,
          },
        },
      },
      orderBy: { fullName: "asc" },
    });

    const allLoanIds = customers.flatMap((c) => c.loans.map((l) => l.id));
    const breakdowns = await paymentBreakdownByLoan(allLoanIds);

    const rows = customers
      .map((c) => {
        let thavanaiBal = D(0);
        let vattiPrincipal = D(0);
        let vattiInterest = D(0);
        let runVatiPrincipal = D(0);
        let runVatiInterest = D(0);

        for (const loan of c.loans) {
          const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
          if (loan.category === "THAVANAI") {
            thavanaiBal = thavanaiBal.plus(D(outstandingFrom(loan.totalRepayment, b.totalAmount)));
          } else if (loan.category === "MONTHLY_VATTI") {
            const pRem = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
            vattiPrincipal = vattiPrincipal.plus(pRem);
            const accrued = sumMoney(
              loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
            );
            const pend = accrued.minus(D(b.interestAmount)).clamp(0, Infinity);
            vattiInterest = vattiInterest.plus(pend);
          } else if (loan.category === "WEEKLY_RUN_VATI") {
            const pRem = D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity);
            runVatiPrincipal = runVatiPrincipal.plus(pRem);
            const accrued = sumMoney(
              loan.interestPeriods.filter((p) => p.dueDate.toISOString().slice(0, 10) <= today).map((p) => p.scheduledAmount),
            );
            const pend = accrued.minus(D(b.interestAmount)).clamp(0, Infinity);
            runVatiInterest = runVatiInterest.plus(pend);
          }
        }

        const totalCustomerOutstanding = thavanaiBal
          .plus(vattiPrincipal)
          .plus(vattiInterest)
          .plus(runVatiPrincipal)
          .plus(runVatiInterest);

        return {
          code: c.code,
          customer: c.fullName,
          mobile: c.mobile,
          activeLoans: c.loans.length,
          thavanaiOutstanding: money(thavanaiBal),
          vattiPrincipal: money(vattiPrincipal),
          vattiInterest: money(vattiInterest),
          vattiTotal: money(vattiPrincipal.plus(vattiInterest)),
          runVatiPrincipal: money(runVatiPrincipal),
          runVatiInterest: money(runVatiInterest),
          runVatiTotal: money(runVatiPrincipal.plus(runVatiInterest)),
          totalOutstanding: money(totalCustomerOutstanding),
        };
      })
      .filter((r) => D(r.totalOutstanding).gt(0));

    return {
      name: "Outstanding Balances",
      title: "Customer Outstanding Balances by Category",
      subtitle: `As of ${formatDateISO(today)}`,
      columns: [
        { header: "Code", key: "code", width: 12 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Active Loans", key: "activeLoans", width: 12, integer: true },
        { header: "Thavanai Balance", key: "thavanaiOutstanding", width: 17, money: true },
        { header: "Vatti (Principal)", key: "vattiPrincipal", width: 22, money: true },
        { header: "Vatti (Interest)", key: "vattiInterest", width: 22, money: true },
        { header: "Vatti (Total)", key: "vattiTotal", width: 20, money: true },
        { header: "Run Vati (Principal)", key: "runVatiPrincipal", width: 22, money: true },
        { header: "Run Vati (Interest)", key: "runVatiInterest", width: 22, money: true },
        { header: "Run Vati (Total)", key: "runVatiTotal", width: 20, money: true },
        { header: "Consolidated Total", key: "totalOutstanding", width: 22, money: true },
      ],
      rows,
      totals: {
        customer: `${rows.length} customers with balance`,
        thavanaiOutstanding: money(sumMoney(rows.map((r) => r.thavanaiOutstanding))),
        vattiPrincipal: money(sumMoney(rows.map((r) => r.vattiPrincipal))),
        vattiInterest: money(sumMoney(rows.map((r) => r.vattiInterest))),
        vattiTotal: money(sumMoney(rows.map((r) => r.vattiTotal))),
        runVatiPrincipal: money(sumMoney(rows.map((r) => r.runVatiPrincipal))),
        runVatiInterest: money(sumMoney(rows.map((r) => r.runVatiInterest))),
        runVatiTotal: money(sumMoney(rows.map((r) => r.runVatiTotal))),
        totalOutstanding: money(sumMoney(rows.map((r) => r.totalOutstanding))),
      },
      notes: moneyNotes,
    };
  }

  // 7. Combined Customer Ledger Sheet
  async function buildCombinedLedgerSheet(): Promise<SheetSpec> {
    const payments = await prisma.payment.findMany({
      where: { status: "POSTED" },
      include: {
        customer: { select: { fullName: true, mobile: true, code: true } },
        loan: { select: { reference: true, category: true } },
      },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });

    const rows = payments.map((p) => ({
      receipt: p.receiptNumber,
      date: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(p.paidAt),
      customer: p.customer.fullName,
      code: p.customer.code,
      loan: p.loan.reference,
      category: LOAN_CATEGORY_LABELS[p.loan.category] ?? p.loan.category,
      mode: PAYMENT_MODE_LABELS[p.mode] ?? p.mode,
      amount: money(p.amount),
      principal: money(p.principalAmount),
      interest: money(p.interestAmount),
      newPrincipal: p.newPrincipal ? money(p.newPrincipal) : "—",
      newInterest: p.newInterest ? money(p.newInterest) : "—",
    }));

    return {
      name: "Combined Ledger",
      title: "Combined Customer Transaction Ledger",
      columns: [
        { header: "Receipt #", key: "receipt", width: 18 },
        { header: "Date", key: "date", width: 20 },
        { header: "Customer", key: "customer", width: 22 },
        { header: "Code", key: "code", width: 12 },
        { header: "Loan", key: "loan", width: 16 },
        { header: "Category", key: "category", width: 18 },
        { header: "Mode", key: "mode", width: 16 },
        { header: "Total Paid", key: "amount", width: 16, money: true },
        { header: "Principal Paid", key: "principal", width: 16, money: true },
        { header: "Interest Paid", key: "interest", width: 16, money: true },
        { header: "Principal After", key: "newPrincipal", width: 18 },
        { header: "Interest After", key: "newInterest", width: 18 },
      ],
      rows,
      totals: {
        customer: `${payments.length} transactions`,
        amount: money(sumMoney(payments.map((p) => p.amount))),
        principal: money(sumMoney(payments.map((p) => p.principalAmount))),
        interest: money(sumMoney(payments.map((p) => p.interestAmount))),
      },
      notes: moneyNotes,
    };
  }

  // 8. Customer List Sheet
  async function buildCustomerListSheet(): Promise<SheetSpec> {
    const customers = await prisma.customer.findMany({
      include: { loans: { select: { id: true, status: true, totalRepayment: true, category: true, nominalAmount: true } } },
      orderBy: { createdAt: "desc" },
    });
    const allLoanIds = customers.flatMap((c) => c.loans.map((l) => l.id));
    const breakdowns = await paymentBreakdownByLoan(allLoanIds);

    const rows = customers.map((c) => {
      const active = c.loans.filter((l) => l.status === "ACTIVE");
      let totalOut = D(0);
      for (const loan of active) {
        const b = breakdowns.get(loan.id) ?? { totalAmount: "0.00", principalAmount: "0.00", interestAmount: "0.00" };
        if (loan.category === "THAVANAI") {
          totalOut = totalOut.plus(D(outstandingFrom(loan.totalRepayment, b.totalAmount)));
        } else {
          totalOut = totalOut.plus(D(loan.nominalAmount).minus(D(b.principalAmount)).clamp(0, Infinity));
        }
      }
      return {
        code: c.code,
        name: c.fullName,
        mobile: c.mobile,
        alternateMobile: c.alternateMobile ?? "",
        address: c.address ?? "",
        totalLoans: c.loans.length,
        activeLoans: active.length,
        outstanding: money(totalOut),
        status: c.archivedAt ? "Archived" : "Active",
        createdAt: formatDateISO(c.createdAt.toISOString().slice(0, 10)),
      };
    });

    return {
      name: "Customer List",
      title: "Customer Directory",
      columns: [
        { header: "Code", key: "code", width: 12 },
        { header: "Name", key: "name", width: 22 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Alt Mobile", key: "alternateMobile", width: 14 },
        { header: "Address", key: "address", width: 28 },
        { header: "Total Loans", key: "totalLoans", width: 12, integer: true },
        { header: "Active Loans", key: "activeLoans", width: 12, integer: true },
        { header: "Outstanding", key: "outstanding", width: 16, money: true },
        { header: "Status", key: "status", width: 12 },
        { header: "Created Date", key: "createdAt", width: 14 },
      ],
      rows,
      totals: {
        name: `${rows.length} customers`,
        totalLoans: rows.reduce((sum, r) => sum + r.totalLoans, 0),
        activeLoans: rows.reduce((sum, r) => sum + r.activeLoans, 0),
        outstanding: money(sumMoney(rows.map((r) => r.outstanding))),
      },
      notes: moneyNotes,
    };
  }

  // Assemble sheets based on report type requested
  if (type === "full-workbook") {
    // 6 Sheets:
    // 1. Overall Summary
    // 2. Thavanai Loans
    // 3. Vatti Loans
    // 4. Run Vati Loans
    // 5. Payment Collections
    // 6. Outstanding Balances
    specs.push(await buildOverallSummarySheet());
    specs.push(await buildThavanaiLoansSheet());
    specs.push(await buildMonthlyVattiLoansSheet());
    specs.push(await buildRunVatiLoansSheet());
    specs.push(await buildPaymentCollectionsSheet());
    specs.push(await buildOutstandingBalancesSheet());
  } else if (type === "thavanai") {
    specs.push(await buildThavanaiLoansSheet());
  } else if (type === "monthly-vatti") {
    specs.push(await buildMonthlyVattiLoansSheet());
  } else if (type === "run-vati") {
    specs.push(await buildRunVatiLoansSheet());
  } else if (type === "collections") {
    specs.push(await buildPaymentCollectionsSheet());
  } else if (type === "ledger") {
    specs.push(await buildCombinedLedgerSheet());
  } else if (type === "outstanding") {
    specs.push(await buildOutstandingBalancesSheet());
  } else if (type === "customers") {
    specs.push(await buildCustomerListSheet());
  }

  const buffer = await buildWorkbookBuffer(specs, {
    businessName: settings.businessName,
    generatedAt,
    filters: params.from || params.to ? undefined : "Default reporting period",
  });

  return {
    filename: `siva-thul-finance-${type}-${today}.xlsx`,
    buffer,
    sheetNames: specs.map((s) => s.name),
  };
}
