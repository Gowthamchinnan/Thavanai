import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerForm } from "@/components/forms/customer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "New customer" };
export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add customer"
        description="Only the minimum information needed to manage loans and share receipts is collected. No government identifiers are required."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
          <p className="text-xs text-muted-foreground">A customer code is generated automatically.</p>
        </CardHeader>
        <CardContent>
          <CustomerForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
