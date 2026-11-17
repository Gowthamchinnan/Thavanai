import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getIndiaTodayISO } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LoanForm } from "@/components/forms/loan-form";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Create loan" };
export const dynamic = "force-dynamic";

export default async function NewLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, code: true, fullName: true, mobile: true },
  });
  const today = getIndiaTodayISO();
  const preselected = sp.customerId && customers.some((c) => c.id === sp.customerId) ? sp.customerId : undefined;
  const initialCategory =
    sp.category === "MONTHLY_VATTI" || sp.category === "WEEKLY_RUN_VATI" || sp.category === "THAVANAI"
      ? sp.category
      : "THAVANAI";

  return (
    <div>
      <PageHeader
        title="Create loan"
        description="Configure the deduction, contractual repayment total and installment schedule independently for this loan."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/loans">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      {customers.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Add a customer before creating a loan"
          description="Loans are always linked to a customer record. Create a customer, then return to build the schedule."
          actionHref="/customers/new"
          actionLabel="Add customer"
        />
      ) : (
        <LoanForm
          customers={customers}
          today={today}
          initialCustomerId={preselected}
          initialCategory={initialCategory}
        />
      )}
    </div>
  );
}
