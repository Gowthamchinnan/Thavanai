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
  PAYMENT_MODE_LABELS,
} from "@/lib/constants";

export interface StatementPdfData {
  customer: { fullName: string; mobile: string; code: string; address: string | null; alternateMobile: string | null };
  loan: {
    reference: string;
    status: string;
    frequency: string;
    nominalAmount: string;
    deductionAmount: string;
    netDisbursed: string;
    totalRepayment: string;
    installmentAmount: string;
    installmentCount: number;
    startDate: string;
    firstDueDate: string;
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
  payments: {
    receiptNumber: string;
    paidAt: Date;
    amount: string;
    mode: string;
    status: string;
    notes: string | null;
    reversal?: { reason: string } | null;
  }[];
  stats: {
    collected: string;
    outstanding: string;
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
    let y = 44;

    doc.font("Heading").fontSize(18).fillColor(PDF_COLORS.teal).text(settings.businessName, left, y, {
      width: width * 0.62,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text("Loan and installment collection", left, y + 24, {
      width: width * 0.62,
      lineBreak: false,
    });

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

    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text("LOAN", left + halfWidth + 28, y + 10, { lineBreak: false });
    doc
      .font("Heading")
      .fontSize(10.5)
      .fillColor(PDF_COLORS.ink)
      .text(`${data.loan.reference} · ${LOAN_STATUS_LABELS[data.loan.status] ?? data.loan.status}`, left + halfWidth + 28, y + 22, {
        width: halfWidth - 24,
        lineBreak: false,
        ellipsis: true,
      });
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
      `Started ${formatDateISO(data.loan.startDate)} · First due ${formatDateISO(data.loan.firstDueDate)}`,
      left + halfWidth + 28,
      y + 52,
      { width: halfWidth - 24, lineBreak: false, ellipsis: true },
    );

    y += 94;

    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Loan terms", left, y);
    y += 18;
    y = drawKeyValueGrid(
      doc,
      [
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
      ],
      { y },
    );

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
      rows: data.installments.map((installment) => [
        String(installment.sequence),
        formatDateISO(installment.dueDate),
        formatINR(installment.scheduledAmount),
        formatINR(installment.paidAmount),
        formatINR(
          Math.max(0, Number(installment.scheduledAmount) - Number(installment.paidAmount)).toFixed(2).toString(),
        ),
        INSTALLMENT_STATUS_LABELS[installment.status] ?? installment.status,
      ]),
      emptyText: "No installments have been generated for this loan.",
      maxFirstRows: 1000,
    });

    y += 16;
    ensureSpace(70);
    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Payment history", left, y);
    y += 18;
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

    y += 22;
    ensureSpace(120);
    doc.font("Heading").fontSize(10.5).fillColor(PDF_COLORS.ink).text("Current position", left, y);
    y += 18;
    y = drawKeyValueGrid(
      doc,
      [
        { label: "Total repayments received", value: formatINR(data.stats.collected) },
        { label: "Remaining contractual balance", value: formatINR(data.stats.outstanding) },
        {
          label: "Next outstanding installment",
          value:
            data.stats.nextDueAmount && data.stats.nextDueDate
              ? `#${data.stats.nextDueSequence ?? ""} · ${formatINR(data.stats.nextDueAmount)} due ${formatDateISO(data.stats.nextDueDate)}`
              : "Fully repaid",
        },
        { label: "Expected gross margin", value: formatINR(data.stats.expectedGrossMargin) },
      ],
      { y },
    );

    y += 12;
    const disclaimer =
      settings.receiptFooter ||
      "This statement is generated from manually recorded collections. It is not a demand notice or an automatic payment request.";
    doc.save().roundedRect(left, y, width, 58, 6).fill(PDF_COLORS.slateSoft).restore();
    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("IMPORTANT", left + 12, y + 9, { lineBreak: false });
    doc.font("Body").fontSize(8.2).fillColor(PDF_COLORS.ink).text(disclaimer, left + 12, y + 22, {
      width: width - 24,
      height: 32,
    });

    drawPageFooter(doc, `${settings.businessName} · Statement ${data.loan.reference}`);
  });
}
