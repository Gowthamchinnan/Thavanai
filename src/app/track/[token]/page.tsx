import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShieldOff, Wallet } from "lucide-react";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { isTrackingRateLimited, recordInvalidTrackingAttempt } from "@/lib/tracking";
import { getPublicCustomerTracking } from "@/lib/services/tracking";
import { PublicTrackingView } from "@/components/tracking/public-tracking-view";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Siva Thul Finance – Payment Status",
  description: "View your loan repayment progress",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableView({ rateLimited = false }: { rateLimited?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {rateLimited ? <Wallet className="h-6 w-6" /> : <ShieldOff className="h-6 w-6" />}
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          {rateLimited ? "Too many requests" : "Tracking link unavailable"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rateLimited
            ? "Please wait a few minutes before refreshing this tracking page."
            : "This payment tracking link is invalid, expired, or has been revoked. Please ask your lender for an updated link."}
        </p>
      </Card>
    </div>
  );
}

export default async function PublicTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const ipAddress = clientIpFromHeaders(await headers());
  if (isTrackingRateLimited(ipAddress)) {
    return <UnavailableView rateLimited />;
  }

  const { token } = await params;
  const result = await getPublicCustomerTracking(token);

  if (!result.ok) {
    recordInvalidTrackingAttempt(ipAddress);
    return <UnavailableView />;
  }

  return <PublicTrackingView data={result} />;
}
