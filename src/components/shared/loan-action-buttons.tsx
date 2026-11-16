"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { activateLoanAction, cancelLoanAction, writeOffLoanAction } from "@/app/actions/loans";

export function LoanActionButtons({ loanId, reference, status }: { loanId: string; reference: string; status: string }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"activate" | "cancel" | "writeoff" | null>(null);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const result =
        dialog === "activate"
          ? await activateLoanAction(loanId)
          : dialog === "cancel"
            ? await cancelLoanAction(loanId)
            : await writeOffLoanAction({ loanId, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Loan updated.");
      setDialog(null);
      setReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (status !== "DRAFT" && status !== "ACTIVE") return null;

  return (
    <>
      {status === "DRAFT" ? (
        <>
          <Button size="sm" onClick={() => setDialog("activate")}>
            <CheckCircle2 className="h-4 w-4" /> Activate loan
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("cancel")}>
            <Ban className="h-4 w-4" /> Cancel draft
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setDialog("writeoff")}>
          <TriangleAlert className="h-4 w-4" /> Write off
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "activate" ? "Activate this loan?" : dialog === "cancel" ? "Cancel this draft?" : "Write off this loan?"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "activate"
                ? `Activating ${reference} generates its full installment schedule and locks the agreed terms. This cannot be undone.`
                : dialog === "cancel"
                  ? `The draft ${reference} will be marked cancelled. No financial records exist yet.`
                  : `Writing off ${reference} stops collections and excludes it from active balances. Existing payments remain in the ledger. This action is audited.`}
            </DialogDescription>
          </DialogHeader>
          {dialog === "writeoff" ? (
            <div className="space-y-2">
              <label htmlFor="writeoff-reason" className="text-sm font-medium">
                Reason for write-off <span className="text-rose-600">*</span>
              </label>
              <Input
                id="writeoff-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="At least 5 characters"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Go back
            </Button>
            <Button
              variant={dialog === "activate" ? "default" : "destructive"}
              onClick={run}
              disabled={pending || (dialog === "writeoff" && reason.trim().length < 5)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {dialog === "activate" ? "Activate" : dialog === "cancel" ? "Cancel draft" : "Write off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
