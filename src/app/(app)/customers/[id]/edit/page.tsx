import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerForm } from "@/components/forms/customer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Edit customer" };
export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${customer.fullName}`}
        description={`${customer.code} · Customer record changes are audited.`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/customers/${customer.id}`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm
            mode="edit"
            customer={{
              id: customer.id,
              fullName: customer.fullName,
              mobile: customer.mobile,
              alternateMobile: customer.alternateMobile ?? "",
              address: customer.address ?? "",
              notes: customer.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
