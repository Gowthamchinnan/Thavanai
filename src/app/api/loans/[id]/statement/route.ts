import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth-guard";
import { getLoanDetail } from "@/lib/services/loans";
import { getSettings } from "@/lib/services/settings";
import { buildStatementPdf } from "@/lib/pdf/statement";
import { money } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const detail = await getLoanDetail(id);
  if (!detail) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const settings = await getSettings();
  const { loan, customer, installments, payments, stats } = detail;

  const pdf = await buildStatementPdf(
    {
      customer: {
        fullName: customer.fullName,
        mobile: customer.mobile,
        code: customer.code,
        address: customer.address,
        alternateMobile: customer.alternateMobile,
      },
      loan: {
        reference: loan.reference,
        status: loan.status,
        frequency: loan.frequency,
        nominalAmount: money(loan.nominalAmount),
        deductionAmount: money(loan.deductionAmount),
        netDisbursed: money(loan.netDisbursed),
        totalRepayment: money(loan.totalRepayment),
        installmentAmount: money(loan.installmentAmount),
        installmentCount: loan.installmentCount,
        startDate: loan.startDate.toISOString().slice(0, 10),
        firstDueDate: loan.firstDueDate.toISOString().slice(0, 10),
        disbursementDate: loan.disbursementDate ? loan.disbursementDate.toISOString().slice(0, 10) : null,
        notes: loan.notes,
        terms: loan.terms,
        createdAt: loan.createdAt,
      },
      installments: installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: installment.dueDate.toISOString().slice(0, 10),
        scheduledAmount: money(installment.scheduledAmount),
        paidAmount: money(installment.paidAmount),
        status: installment.status,
      })),
      payments: payments.map((payment) => ({
        receiptNumber: payment.receiptNumber,
        paidAt: payment.paidAt,
        amount: money(payment.amount),
        mode: payment.mode,
        status: payment.status,
        notes: payment.notes,
        reversal: payment.reversal ? { reason: payment.reversal.reason } : null,
      })),
      stats: {
        collected: stats.collected,
        outstanding: stats.outstanding,
        expectedGrossMargin: stats.expectedGrossMargin,
        overdueAmount: stats.overdueAmount,
        overdueCount: stats.overdueCount,
        nextDueDate: stats.nextDueDate,
        nextDueAmount: stats.nextDueAmount,
        nextDueSequence: stats.nextDueSequence,
      },
    },
    settings,
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${loan.reference}-statement.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
