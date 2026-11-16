"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { voidPaymentAction } from "@/app/actions/payments";

export function VoidPaymentButton({ paymentId, receiptNumber, amount }: { paymentId: string; receiptNumber: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const result = await voidPaymentAction({ paymentId, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Payment voided.");
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40">
          <Undo2 className="h-4 w-4" /> Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void receipt {receiptNumber}?</DialogTitle>
          <DialogDescription>
            The payment of {amount} will be reversed from the ledger, installment allocations and balances. The original
            receipt remains visible as voided. Record a replacement payment afterwards if needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-sm font-medium">
            Reason for correction <span className="text-rose-600">*</span>
          </label>
          <Input
            id="void-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Amount entered incorrectly"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep payment
          </Button>
          <Button variant="destructive" onClick={run} disabled={pending || reason.trim().length < 5}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Void payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
