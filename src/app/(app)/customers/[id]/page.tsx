import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getCustomerDetail } from "@/lib/services/customers";
import { getCustomerTrackingStatus } from "@/lib/services/tracking";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ArchiveCustomerButton } from "@/components/shared/archive-customer-button";
import { CustomerDetailView } from "@/components/customers/customer-detail-view";
import { TrackingLinkCard } from "@/components/customers/tracking-link-card";

export const metadata: Metadata = { title: "Customer Profile" };
export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [detail, trackingState, headerStore] = await Promise.all([
    getCustomerDetail(id),
    getCustomerTrackingStatus(id),
    headers(),
  ]);
  if (!detail) notFound();

  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const originHint = host ? `${proto}://${host}` : "";

  const { customer, loans, thavanaiLoans, monthlyVattiLoans, weeklyRunVatiLoans, payments, stats } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.fullName}
        description={`${customer.code} · ${customer.mobile}${customer.alternateMobile ? ` · Alt ${customer.alternateMobile}` : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/customers">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <ArchiveCustomerButton customerId={customer.id} customerName={customer.fullName} archived={Boolean(customer.archivedAt)} />
            <Button asChild size="sm">
              <Link href={`/loans/new?customerId=${customer.id}`}>
                <Plus className="h-4 w-4" /> New loan
              </Link>
            </Button>
          </>
        }
      />

      {customer.archivedAt ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          This customer is archived. New loans are blocked; financial history remains intact.
        </div>
      ) : null}

      <TrackingLinkCard
        customerId={customer.id}
        customerMobile={customer.mobile}
        initialState={trackingState}
        originHint={originHint}
      />

      <CustomerDetailView
        customer={customer}
        loans={loans}
        thavanaiLoans={thavanaiLoans}
        monthlyVattiLoans={monthlyVattiLoans}
        weeklyRunVatiLoans={weeklyRunVatiLoans}
        payments={payments}
        stats={stats}
      />
    </div>
  );
}
