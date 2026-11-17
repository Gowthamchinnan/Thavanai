import type { Metadata } from "next";
import { CollectionsView } from "@/components/collections/collections-view";

export const metadata: Metadata = { title: "Upcoming" };
export const dynamic = "force-dynamic";

export default async function CollectionsUpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; frequency?: string; from?: string; to?: string; page?: string }>;
}) {
  return <CollectionsView scope="upcoming" searchParams={await searchParams} />;
}
