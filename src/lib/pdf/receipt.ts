import type { AppSettings } from "@prisma/client";
import {
  PDF_COLORS,
  contentWidth,
  drawKeyValueGrid,
  drawPageFooter,
  drawRule,
  renderPdf,
} from "@/lib/pdf/base";
import { formatINR } from "@/lib/money";
import { formatDateISO, formatDateTimeIndia } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";

export interface ReceiptPdfData {
  payment: {
    receiptNumber: string;
    amount: string;
    paidAt: Date;
    mode: string;
    status: string;
    notes: string | null;
    voidedAt: Date | null;
    voidReason: string | null;
  };
  customer: { fullName: string; mobile: string; code: string; address: string | null };
  loan: { reference: string; totalRepayment: string };
  totalPaid: string;
  remaining: string;
  nextDue: { sequence: number; dueDate: string; amount: string } | null;
}

export async function buildReceiptPdf(data: ReceiptPdfData, settings: AppSettings): Promise<Buffer> {
  return renderPdf((doc) => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const voided = data.payment.status === "VOIDED";

    doc.font("Heading").fontSize(18).fillColor(PDF_COLORS.teal).text(settings.businessName, left, 44, {
      width: width * 0.62,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text("Loan and installment collection", left, 68, {
      width: width * 0.62,
      lineBreak: false,
    });

    doc.font("Heading").fontSize(13).fillColor(PDF_COLORS.ink).text("PAYMENT RECEIPT", left, 44, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text(data.payment.receiptNumber, left, 62, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc.text(`Issued ${formatDateTimeIndia(new Date())}`, left, 74, { width, align: "right", lineBreak: false });

    drawRule(doc, 92);

    if (voided) {
      doc.save().roundedRect(left, 102, width, 38, 6).fill("#fff1f2").restore();
      doc.font("Heading").fontSize(10).fillColor(PDF_COLORS.rose).text("VOIDED PAYMENT RECEIPT", left + 12, 108, {
        width,
        lineBreak: false,
      });
      doc
        .font("Body")
        .fontSize(8)
        .fillColor(PDF_COLORS.rose)
        .text(
          `Voided ${data.payment.voidedAt ? formatDateTimeIndia(data.payment.voidedAt) : ""}. Reason: ${data.payment.voidReason ?? "—"}. This payment is excluded from all totals.`,
          left + 12,
          121,
          { width: width - 24, lineBreak: false, ellipsis: true },
        );
    }

    let y = voided ? 154 : 112;

    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("PAYMENT DATE", left, y, { width: width / 2, lineBreak: false });
    doc.font("Heading").fontSize(9.5).fillColor(PDF_COLORS.ink).text(formatDateTimeIndia(data.payment.paidAt), left, y + 12, {
      width: width / 2,
      lineBreak: false,
    });
    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("PAYMENT MODE", left + width / 2, y, { width: width / 2, lineBreak: false });
    doc
      .font("Heading")
      .fontSize(9.5)
      .fillColor(PDF_COLORS.ink)
      .text(PAYMENT_MODE_LABELS[data.payment.mode] ?? data.payment.mode, left + width / 2, y + 12, {
        width: width / 2,
        lineBreak: false,
      });

    y += 38;

    doc.save().roundedRect(left, y, width, 58, 8).fill(PDF_COLORS.tealSoft).restore();
    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.teal).text("AMOUNT RECEIVED", left + 16, y + 12, { width, lineBreak: false });
    doc
      .font("Heading")
      .fontSize(24)
      .fillColor(voided ? PDF_COLORS.rose : PDF_COLORS.teal)
      .text(formatINR(data.payment.amount), left + 16, y + 24, { width: width - 32, lineBreak: false });

    y += 76;

    const halfWidth = (width - 16) / 2;
    doc.save().roundedRect(left, y, halfWidth, 86, 6).lineWidth(0.8).strokeColor(PDF_COLORS.line).stroke().restore();
    doc.save().roundedRect(left + halfWidth + 16, y, halfWidth, 86, 6).lineWidth(0.8).strokeColor(PDF_COLORS.line).stroke().restore();

    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text("CUSTOMER", left + 12, y + 12, { lineBreak: false });
    doc.font("Heading").fontSize(10).fillColor(PDF_COLORS.ink).text(data.customer.fullName, left + 12, y + 24, {
      width: halfWidth - 24,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.muted).text(`${data.customer.code} · ${data.customer.mobile}`, left + 12, y + 40, {
      width: halfWidth - 24,
      lineBreak: false,
    });
    if (data.customer.address) {
      doc.fontSize(8).text(data.customer.address, left + 12, y + 55, { width: halfWidth - 24, lineBreak: false, ellipsis: true });
    }

    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text("LOAN", left + halfWidth + 28, y + 12, { lineBreak: false });
    doc
      .font("Heading")
      .fontSize(10)
      .fillColor(PDF_COLORS.ink)
      .text(data.loan.reference, left + halfWidth + 28, y + 24, {
        width: halfWidth - 24,
        lineBreak: false,
      });
    doc
      .font("Body")
      .fontSize(8.5)
      .fillColor(PDF_COLORS.muted)
      .text(`Contractual repayment ${formatINR(data.loan.totalRepayment)}`, left + halfWidth + 28, y + 40, {
        width: halfWidth - 24,
        lineBreak: false,
      });
    doc.text(`Remaining balance ${formatINR(data.remaining)}`, left + halfWidth + 28, y + 55, {
      width: halfWidth - 24,
      lineBreak: false,
    });

    y += 106;

    doc.font("Heading").fontSize(10).fillColor(PDF_COLORS.ink).text("Account position", left, y);
    y += 18;
    y = drawKeyValueGrid(
      doc,
      [
        { label: "Total repayments received to date", value: formatINR(data.totalPaid) },
        { label: "Remaining contractual balance", value: formatINR(data.remaining) },
        { label: "Next outstanding installment", value: data.nextDue ? `#${data.nextDue.sequence}` : "None" },
        {
          label: "Next installment amount and due date",
          value: data.nextDue
            ? `${formatINR(data.nextDue.amount)} · ${formatDateISO(data.nextDue.dueDate)}`
            : "Fully repaid",
        },
      ],
      { y },
    );

    if (data.payment.notes) {
      y += 8;
      doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("PAYMENT NOTES", left, y, { lineBreak: false });
      doc.font("Body").fontSize(9).fillColor(PDF_COLORS.ink).text(data.payment.notes, left, y + 12, {
        width,
        lineBreak: false,
        ellipsis: true,
      });
      y += 34;
    }

    if (settings.receiptHeader) {
      y += 12;
      doc.font("Body").fontSize(9).fillColor(PDF_COLORS.ink).text(settings.receiptHeader, left, y, {
        width,
        align: "center",
        lineBreak: false,
        ellipsis: true,
      });
      y += 18;
    }

    const disclaimer =
      settings.receiptFooter ||
      "This is a manually recorded payment receipt. No automatic payment was collected. Please retain this receipt for your records.";
    const boxY = Math.max(y + 10, doc.page.height - 190);
    doc.save().roundedRect(left, boxY, width, 68, 6).fill(PDF_COLORS.slateSoft).restore();
    doc.font("Body").fontSize(8).fillColor(PDF_COLORS.muted).text("NOTE", left + 12, boxY + 10, { lineBreak: false });
    doc.font("Body").fontSize(8.5).fillColor(PDF_COLORS.ink).text(disclaimer, left + 12, boxY + 23, {
      width: width - 24,
      height: 38,
    });

    doc
      .font("Body")
      .fontSize(7.5)
      .fillColor(PDF_COLORS.muted)
      .text(
        `Generated ${formatDateTimeIndia(new Date())} from persisted records. Voided payments are not included in totals.`,
        left,
        doc.page.height - 112,
        { width, align: "center", lineBreak: false },
      );

    drawPageFooter(doc, `${settings.businessName} · ${data.payment.receiptNumber}`);
  });
}
