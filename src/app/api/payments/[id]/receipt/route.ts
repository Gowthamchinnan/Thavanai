import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth-guard";
import { getPaymentDetail } from "@/lib/services/payments";
import { getSettings } from "@/lib/services/settings";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { money } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const detail = await getPaymentDetail(id);
  if (!detail) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const settings = await getSettings();
  const { payment, customer, loan, totalPaid, remaining, nextDue } = detail;

  const pdf = await buildReceiptPdf(
    {
      payment: {
        receiptNumber: payment.receiptNumber,
        amount: money(payment.amount),
        paidAt: payment.paidAt,
        mode: payment.mode,
        status: payment.status,
        notes: payment.notes,
        voidedAt: payment.voidedAt,
        voidReason: payment.voidReason,
      },
      customer: {
        fullName: customer.fullName,
        mobile: customer.mobile,
        code: customer.code,
        address: customer.address,
      },
      loan: {
        reference: loan.reference,
        totalRepayment: money(loan.totalRepayment),
      },
      totalPaid,
      remaining,
      nextDue,
    },
    settings,
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payment.receiptNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
