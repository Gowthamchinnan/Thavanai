import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth-guard";
import { getPaymentDetail } from "@/lib/services/payments";
import { getSettings } from "@/lib/services/settings";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { money, D, sumMoney } from "@/lib/money";
import { getIndiaTodayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const detail = await getPaymentDetail(id);
  if (!detail) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const settings = await getSettings();
  const { payment, customer, loan, totalPaid, principalPaid, interestPaid, remaining, nextDue } = detail;

  const today = getIndiaTodayISO();
  const accruedPeriods = (loan.interestPeriods || []).filter((p) => p.dueDate.toISOString().slice(0, 10) <= today);
  const accruedInterest = money(sumMoney(accruedPeriods.map((p) => p.scheduledAmount)));
  const pendingInterest = money(D(accruedInterest).minus(D(interestPaid ?? "0")).clamp(0, Infinity));
  const outstandingPrincipal = money(D(loan.nominalAmount).minus(D(principalPaid ?? "0")).clamp(0, Infinity));

  const pdf = await buildReceiptPdf(
    {
      payment: {
        receiptNumber: payment.receiptNumber,
        amount: money(payment.amount),
        principalAmount: money(payment.principalAmount),
        interestAmount: money(payment.interestAmount),
        previousPrincipal: payment.previousPrincipal ? money(payment.previousPrincipal) : null,
        newPrincipal: payment.newPrincipal ? money(payment.newPrincipal) : null,
        previousInterest: payment.previousInterest ? money(payment.previousInterest) : null,
        newInterest: payment.newInterest ? money(payment.newInterest) : null,
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
        category: loan.category,
        nominalAmount: money(loan.nominalAmount),
        deductionAmount: money(loan.deductionAmount),
        netDisbursed: money(loan.netDisbursed),
        totalRepayment: money(loan.totalRepayment),
        interestRate: loan.interestRate ? loan.interestRate.toString() : null,
        interestType: loan.interestType,
        collectionDay: loan.collectionDay,
      },
      totalPaid,
      principalPaid,
      interestPaid,
      remaining,
      outstandingPrincipal,
      pendingInterest,
      interestAccrued: accruedInterest,
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
