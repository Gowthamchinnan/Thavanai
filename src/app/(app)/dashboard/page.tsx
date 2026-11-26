import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Wallet, ReceiptIndianRupee } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getDashboardData } from "@/lib/services/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdmin();
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Dashboard"
        description="Comprehensive live view of Thavanai, Vatti, and Run Vati accounts."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/customers/new">
                <UserPlus className="h-4 w-4" /> Add customer
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/loans/new">
                <Wallet className="h-4 w-4" /> Create loan
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/loans?status=ACTIVE">
                <ReceiptIndianRupee className="h-4 w-4" /> Record collection
              </Link>
            </Button>
          </>
        }
      />

      <DashboardView data={data} />
    </div>
  );
}
