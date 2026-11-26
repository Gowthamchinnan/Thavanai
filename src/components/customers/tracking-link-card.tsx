"use client";

import * as React from "react";
import { Copy, ExternalLink, Link2, Loader2, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { AdminTrackingState } from "@/lib/services/tracking";
import {
  generateTrackingLinkAction,
  regenerateTrackingLinkAction,
  revokeTrackingLinkAction,
} from "@/app/actions/tracking";
import { buildTrackingWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function TrackingLinkCard({
  customerId,
  customerMobile,
  initialState,
  originHint,
}: {
  customerId: string;
  customerMobile: string;
  initialState: AdminTrackingState;
  originHint: string;
}) {
  const [state, setState] = React.useState<AdminTrackingState>(initialState);
  const [busyAction, setBusyAction] = React.useState<"generate" | "regenerate" | "revoke" | null>(null);
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const pendingRef = React.useRef(false);

  React.useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const getFullUrl = React.useCallback((): string | null => {
    if (!state.trackingPath) return null;
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : originHint;
    return `${base.replace(/\/$/, "")}${state.trackingPath}`;
  }, [state.trackingPath, originHint]);

  async function handleGenerate() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusyAction("generate");
    try {
      const result = await generateTrackingLinkAction(customerId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setState(result.state);
      toast.success(result.message);
    } catch {
      toast.error("Could not generate tracking link.");
    } finally {
      pendingRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleRegenerate(event: React.MouseEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusyAction("regenerate");
    try {
      const result = await regenerateTrackingLinkAction(customerId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setState(result.state);
      setRegenOpen(false);
      toast.success(result.message);
    } catch {
      toast.error("Could not regenerate tracking link.");
    } finally {
      pendingRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleRevoke(event: React.MouseEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusyAction("revoke");
    try {
      const result = await revokeTrackingLinkAction(customerId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setState(result.state);
      setRevokeOpen(false);
      toast.success(result.message);
    } catch {
      toast.error("Could not revoke tracking link.");
    } finally {
      pendingRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleCopy() {
    const url = getFullUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tracking link copied to clipboard.");
    } catch {
      toast.error("Unable to copy link automatically. Check browser clipboard permissions.");
    }
  }

  function handleShareWhatsApp() {
    const url = getFullUrl();
    if (!url) return;
    const message = buildTrackingWhatsAppMessage(url);
    const waUrl = buildWhatsAppUrl(customerMobile, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast.info("WhatsApp opened with prefilled tracking message. Send the message in WhatsApp.");
  }

  const isBusy = busyAction !== null;
  const isActive = state.status === "ACTIVE" && Boolean(state.trackingPath);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> Customer Payment Tracking
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customer Tracking Link — one permanent read-only link for all of this customer&apos;s loans.
          </p>
        </div>
        {isActive ? (
          <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" /> Active
          </Badge>
        ) : state.status === "REVOKED" ? (
          <Badge variant="secondary" className="gap-1 text-rose-700 dark:text-rose-300">
            <ShieldOff className="h-3 w-3" /> Revoked
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <ShieldAlert className="h-3 w-3" /> Not generated
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isActive ? (
          <>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Active link is ready (token hidden for privacy). Copy or share via WhatsApp — the same link always reflects newly recorded payments.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleCopy} disabled={isBusy}>
                <Copy className="h-3.5 w-3.5" /> Copy Link
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleShareWhatsApp} disabled={isBusy}>
                <ExternalLink className="h-3.5 w-3.5" /> Share via WhatsApp
              </Button>

              <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="sm" variant="outline" disabled={isBusy}>
                    {busyAction === "regenerate" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerate Link
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate tracking link?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This immediately revokes the previous tracking link and creates a new one. Any previously shared link will stop working.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRegenerate} disabled={isBusy}>
                      {busyAction === "regenerate" ? "Regenerating…" : "Regenerate Link"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    disabled={isBusy}
                  >
                    {busyAction === "revoke" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5" />
                    )}
                    Revoke Link
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke tracking link?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The customer will immediately lose access to their tracking page until you generate a new link.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRevoke}
                      disabled={isBusy}
                      className="bg-rose-600 text-white hover:bg-rose-700"
                    >
                      {busyAction === "revoke" ? "Revoking…" : "Revoke Link"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              {state.status === "REVOKED"
                ? "The previous tracking link was revoked. Generate a new link when you are ready to share."
                : "No tracking link has been generated for this customer yet."}
            </p>
            <Button type="button" size="sm" onClick={handleGenerate} disabled={isBusy}>
              {busyAction === "generate" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" /> Generate Link
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
