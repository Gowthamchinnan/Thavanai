import type { AppSettings } from "@prisma/client";
import {
  PDF_COLORS,
  contentWidth,
  drawKeyValueGrid,
  drawPageFooter,
  drawRule,
  drawTable,
  renderPdf,
} from "@/lib/pdf/base";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import {
  FREQUENCY_LABELS,
  INSTALLMENT_STATUS_LABELS,
  LOAN_STATUS_LABELS,
  LOAN_CATEGORY_LABELS,
  PAYMENT_MODE_LABELS,
  INTEREST_CALCULATION_METHOD_LABELS,
} from "@/lib/constants";

export interface StatementPdfData {
  customer: { fullName: string; mobile: string; code: string; address: string | null; alternateMobile: string | null };
  loan: {
    reference: string;
    category: string;
    status: string;
    frequency: string;
    nominalAmount: string;
    deductionAmount: string;
    netDisbursed: string;
    totalRepayment: string;
    installmentAmount: string;
    installmentCount: number;
    interestRate?: string | null;
    interestType?: string | null;
    collectionDay?: number | null;
    maturityDate?: string | null;
    startDate: string;
    firstDueDate?: string | null;
    disbursementDate: string | null;
    notes: string | null;
    terms: string | null;
    createdAt: Date;
  };
  installments: {
    sequence: number;
    dueDate: string;
    scheduledAmount: string;
    paidAmount: string;
    status: string;
  }[];
  interestPeriods?: {
    sequence: number;
    dueDate: string;
    principalBase: string;
    interestRate: string;
    scheduledAmount: string;
    paidAmount: string;
    status: string;
  }[];
  payments: {
    receiptNumber: string;
    paidAt: Date;
    amount: string;
    principalAmount?: string;
    interestAmount?: string;
    mode: string;
    status: string;
    notes: string | null;
    reversal?: { reason: string } | null;
  }[];
  stats: {
    collected: string;
    outstanding: string;
    principalPaid?: string;
    interestPaid?: string;
    outstandingPrincipal?: string;
    interestAccrued?: string;
    interestPending?: string;
    expectedGrossMargin: string;
    overdueAmount: string;
    overdueCount: number;
    nextDueDate: string | null;
    nextDueAmount: string | null;
    nextDueSequence: number | null;
  };
}

export async function buildStatementPdf(data: StatementPdfData, settings: AppSettings): Promise<Buffer> {
  return renderPdf((doc) => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 40;
    const category = data.loan.category || "THAVANAI";
    let y = 44;

    doc.font("Heading").fontSize(18).fillColor(PDF_COLORS.teal).text(settings.businessName, left, y, {
      width: width * 0.62,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text(
      `${LOAN_CATEGORY_LABELS[category] ?? category} · Loan Statement`,
      left,
      y + 24,
      { width: width * 0.62, lineBreak: false },
    );

    doc.font("Heading").fontSize(13).fillColor(PDF_COLORS.ink).text("LOAN STATEMENT", left, y, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text(data.loan.reference, left, y + 18, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc.text(`Generated ${formatDateTimeIndia(new Date())}`, left, y + 30, { width, align: "right", lineBreak: false });

    drawRule(doc, 92);
    y = 108;

    const halfWidth = (width - 16) / 2;
    doc.save().roundedRect(left, y, halfWidth, 74, 6).lineWidth(0.8).strokeColor(PDF_COLORS.line).stroke().restore();
    doc.save().roundedRect(left + halfWidth + 16, y, halfWidth, 74, 6).lineWidth(0.8).strokeColor(PDF_COLORS.line).stroke().restore();

    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text("CUSTOMER", left + 12, y + 10, { lineBreak: false });
    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text(data.customer.fullName, left + 12, y + 22, {
      width: halfWidth - 24,
      lineBreak: false,
      ellipsis: true,
    });
    doc
      .font("Body")
      .fontSize(8.5)
      .fillColor(PDF_COLORS.muted)
      .text(`${data.customer.code} · ${data.customer.mobile}${data.customer.alternateMobile ? ` · Alt ${data.customer.alternateMobile}` : ""}`, left + 12, y + 38, {
        width: halfWidth - 24,
        lineBreak: false,
        ellipsis: true,
      });
    if (data.customer.address) {
      doc.fontSize(8).text(data.customer.address, left + 12, y + 52, {
        width: halfWidth - 24,
        lineBreak: false,
        ellipsis: true,
      });
    }

    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text("LOAN ACCOUNT", left + halfWidth + 28, y + 10, { lineBreak: false });
    doc
      .font("Heading")
      .fontSize(10.5)
      .fillColor(PDF_COLORS.ink)
      .text(`${data.loan.reference} · ${LOAN_STATUS_LABELS[data.loan.status] ?? data.loan.status}`, left + halfWidth + 28, y + 22, {
        width: halfWidth - 24,
        lineBreak: false,
        ellipsis: true,
      });

    if (category === "THAVANAI") {
      doc
        .font("Body")
        .fontSize(8.5)
        .fillColor(PDF_COLORS.muted)
        .text(
          `${FREQUENCY_LABELS[data.loan.frequency] ?? data.loan.frequency} · ${data.loan.installmentCount} installments of ${formatINR(data.loan.installmentAmount)}`,
          left + halfWidth + 28,
          y + 38,
          { width: halfWidth - 24, lineBreak: false, ellipsis: true },
        );
      doc.text(
        `Started ${formatDateISO(data.loan.startDate)}${data.loan.firstDueDate ? ` · First due ${formatDateISO(data.loan.firstDueDate)}` : ""}`,
        left + halfWidth + 28,
        y + 52,
        { width: halfWidth - 24, lineBreak: false, ellipsis: true },
      );
    } else {
      doc
        .font("Body")
        .fontSize(8.5)
        .fillColor(PDF_COLORS.muted)
        .text(
          `${LOAN_CATEGORY_LABELS[category] ?? category} · Rate: ${data.loan.interestRate ?? "—"}% · ${INTEREST_CALCULATION_METHOD_LABELS[data.loan.interestType ?? "FLAT_SIMPLE"] ?? ""}`,
          left + halfWidth + 28,
          y + 38,
          { width: halfWidth - 24, lineBreak: false, ellipsis: true },
        );
      doc.text(
        `Started ${formatDateISO(data.loan.startDate)}${data.loan.maturityDate ? ` · Maturity ${formatDateISO(data.loan.maturityDate)}` : ""}`,
        left + halfWidth + 28,
        y + 52,
        { width: halfWidth - 24, lineBreak: false, ellipsis: true },
      );
    }

    y += 94;

    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Loan terms & position", left, y);
    y += 18;

    const termsGrid =
      category === "THAVANAI"
        ? [
            { label: "Nominal loan amount", value: formatINR(data.loan.nominalAmount) },
            { label: "Upfront deduction", value: formatINR(data.loan.deductionAmount) },
            { label: "Net cash disbursed", value: formatINR(data.loan.netDisbursed) },
            { label: "Contractual total repayment", value: formatINR(data.loan.totalRepayment) },
            { label: "Installment amount", value: formatINR(data.loan.installmentAmount) },
            { label: "Number of installments", value: String(data.loan.installmentCount) },
            { label: "Frequency", value: FREQUENCY_LABELS[data.loan.frequency] ?? data.loan.frequency },
            { label: "Disbursement date", value: data.loan.disbursementDate ? formatDateISO(data.loan.disbursementDate) : "—" },
            { label: "Expected gross margin", value: formatINR(data.stats.expectedGrossMargin), emphasize: true },
            { label: "Total collected", value: formatINR(data.stats.collected), emphasize: true },
            { label: "Remaining balance", value: formatINR(data.stats.outstanding), emphasize: true },
            {
              label: "Overdue",
              value: `${formatINR(data.stats.overdueAmount)} across ${data.stats.overdueCount} installment(s)`,
            },
          ]
        : [
            { label: "Principal amount", value: formatINR(data.loan.nominalAmount) },
            { label: "Interest percentage", value: `${data.loan.interestRate ?? "0"}% (${category === "MONTHLY_VATTI" ? "Monthly" : "Weekly"})` },
            { label: "Calculation method", value: INTEREST_CALCULATION_METHOD_LABELS[data.loan.interestType ?? "FLAT_SIMPLE"] ?? data.loan.interestType ?? "Flat Simple" },
            { label: "Net cash disbursed", value: formatINR(data.loan.netDisbursed) },
            { label: "Principal repaid to date", value: formatINR(data.stats.principalPaid ?? "0.00") },
            { label: "Outstanding principal", value: formatINR(data.stats.outstandingPrincipal ?? data.stats.outstanding), emphasize: true },
            { label: "Accrued interest to date", value: formatINR(data.stats.interestAccrued ?? "0.00") },
            { label: "Interest collected to date", value: formatINR(data.stats.interestPaid ?? "0.00") },
            { label: "Pending unpaid interest", value: formatINR(data.stats.interestPending ?? "0.00"), emphasize: true },
            { label: "Total collected", value: formatINR(data.stats.collected), emphasize: true },
            { label: "Total outstanding balance", value: formatINR(data.stats.outstanding), emphasize: true },
            {
              label: "Overdue interest",
              value: `${formatINR(data.stats.overdueAmount)} across ${data.stats.overdueCount} period(s)`,
            },
          ];

    y = drawKeyValueGrid(doc, termsGrid, { y });

    y += 4;
    if (data.loan.terms) {
      y += 6;
      doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("CONTRACTUAL TERMS", left, y, { lineBreak: false });
      y += 12;
      doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.ink).text(data.loan.terms, left, y, { width });
      y = doc.y + 10;
    }
    if (data.loan.notes) {
      doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("NOTES", left, y, { lineBreak: false });
      y += 12;
      doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.ink).text(data.loan.notes, left, y, { width });
      y = doc.y + 10;
    }

    const ensureSpace = (needed: number) => {
      if (y + needed > bottomLimit()) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    ensureSpace(70);

    // Schedule table: Installments for Thavanai, InterestPeriods for Vatti
    if (category === "THAVANAI") {
      doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Installment schedule", left, y);
      y += 18;
      y = drawTable(doc, {
        y,
        columns: [
          { header: "#", width: 28, align: "center" },
          { header: "Due date", width: 90 },
          { header: "Scheduled", width: 92, align: "right" },
          { header: "Paid", width: 92, align: "right" },
          { header: "Outstanding", width: 92, align: "right" },
          { header: "Status", width: 92 },
        ],
        rows: data.installments.map((inst) => [
          String(inst.sequence),
          formatDateISO(inst.dueDate),
          formatINR(inst.scheduledAmount),
          formatINR(inst.paidAmount),
          formatINR(Math.max(0, Number(inst.scheduledAmount) - Number(inst.paidAmount)).toFixed(2).toString()),
          INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status,
        ]),
        emptyText: "No installments have been generated for this loan.",
        maxFirstRows: 1000,
      });
    } else {
      doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text(
        category === "MONTHLY_VATTI" ? "Monthly interest schedule" : "Weekly interest schedule",
        left,
        y,
      );
      y += 18;
      const periods = data.interestPeriods || [];
      y = drawTable(doc, {
        y,
        columns: [
          { header: "#", width: 28, align: "center" },
          { header: "Due date", width: 85 },
          { header: "Principal base", width: 85, align: "right" },
          { header: "Rate", width: 55, align: "right" },
          { header: "Interest due", width: 75, align: "right" },
          { header: "Paid", width: 75, align: "right" },
          { header: "Pending", width: 75, align: "right" },
          { header: "Status", width: 68 },
        ],
        rows: periods.map((p) => [
          String(p.sequence),
          formatDateISO(p.dueDate),
          formatINR(p.principalBase),
          `${p.interestRate}%`,
          formatINR(p.scheduledAmount),
          formatINR(p.paidAmount),
          formatINR(Math.max(0, Number(p.scheduledAmount) - Number(p.paidAmount)).toFixed(2).toString()),
          INSTALLMENT_STATUS_LABELS[p.status] ?? p.status,
        ]),
        emptyText: "No interest periods recorded.",
        maxFirstRows: 1000,
      });
    }

    y += 16;
    ensureSpace(70);
    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Payment history", left, y);
    y += 18;

    if (category === "THAVANAI") {
      y = drawTable(doc, {
        y,
        columns: [
          { header: "Receipt", width: 116 },
          { header: "Payment date", width: 108 },
          { header: "Amount", width: 86, align: "right" },
          { header: "Mode", width: 90 },
          { header: "Status", width: 78 },
        ],
        rows: data.payments.map((payment) => [
          payment.receiptNumber,
          formatDateTimeIndia(payment.paidAt),
          formatINR(payment.amount),
          PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode,
          payment.status === "VOIDED" ? "Voided" : "Posted",
        ]),
        emptyText: "No payments have been recorded for this loan.",
        maxFirstRows: 1000,
      });
    } else {
      y = drawTable(doc, {
        y,
        columns: [
          { header: "Receipt", width: 100 },
          { header: "Payment date", width: 100 },
          { header: "Principal paid", width: 75, align: "right" },
          { header: "Interest paid", width: 75, align: "right" },
          { header: "Total received", width: 75, align: "right" },
          { header: "Mode", width: 75 },
          { header: "Status", width: 65 },
        ],
        rows: data.payments.map((payment) => [
          payment.receiptNumber,
          formatDateTimeIndia(payment.paidAt),
          formatINR(payment.principalAmount ?? "0"),
          formatINR(payment.interestAmount ?? "0"),
          formatINR(payment.amount),
          PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode,
          payment.status === "VOIDED" ? "Voided" : "Posted",
        ]),
        emptyText: "No payments have been recorded for this loan.",
        maxFirstRows: 1000,
      });
    }

    y += 22;
    ensureSpace(100);
    const disclaimer =
      settings.receiptFooter ||
      "This statement is generated from manually recorded collections. It is not an automatic debit or demand notice.";
    doc.save().roundedRect(left, y, width, 58, 6).fill(PDF_COLORS.slateSoft).restore();
    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("IMPORTANT", left + 12, y + 9, { lineBreak: false });
    doc.font("Body").fontSize(8.2).fillColor(PDF_COLORS.ink).text(disclaimer, left + 12, y + 22, {
      width: width - 24,
      height: 32,
    });

    drawPageFooter(doc, `${settings.businessName} · Statement ${data.loan.reference}`);
  });
}
