import type { Metadata } from "next";
import { CollectionsView } from "@/components/collections/collections-view";

export const metadata: Metadata = { title: "Overdue" };
export const dynamic = "force-dynamic";

export default async function CollectionsOverduePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; frequency?: string; from?: string; to?: string; page?: string }>;
}) {
  return <CollectionsView scope="overdue" searchParams={await searchParams} />;
}
