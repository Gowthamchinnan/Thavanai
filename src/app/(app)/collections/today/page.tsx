import type { Metadata } from "next";
import { CollectionsView } from "@/components/collections/collections-view";

export const metadata: Metadata = { title: "Due today" };
export const dynamic = "force-dynamic";

export default async function CollectionsTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; frequency?: string; from?: string; to?: string; page?: string }>;
}) {
  return <CollectionsView scope="today" searchParams={await searchParams} />;
}
