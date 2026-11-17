"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoanForm } from "@/components/forms/loan-form";

interface CustomerOption {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
}

export interface LoanCreateDialogProps {
  customers: CustomerOption[];
  today: string;
  initialCustomerId?: string;
  initialCategory?: "THAVANAI" | "MONTHLY_VATTI" | "WEEKLY_RUN_VATI";
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (loanId: string) => void;
}

export function LoanCreateDialog({
  customers,
  today,
  initialCustomerId,
  initialCategory = "THAVANAI",
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
}: LoanCreateDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (isControlled && controlledOnOpenChange) {
        controlledOnOpenChange(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }
    },
    [isControlled, controlledOnOpenChange],
  );

  const handleSuccess = React.useCallback(
    (newLoanId: string) => {
      setOpen(false);
      router.refresh();
      if (onCreated) {
        onCreated(newLoanId);
      }
    },
    [setOpen, router, onCreated],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm">
            <Wallet className="h-4 w-4" /> Create loan
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create Loan</DialogTitle>
          <DialogDescription>
            Issue a Thavanai (Installment), Vatti (Monthly), or Run Vati (Weekly) loan account.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {open && (
            <LoanForm
              customers={customers}
              today={today}
              initialCustomerId={initialCustomerId}
              initialCategory={initialCategory}
              isDialog={true}
              onSuccess={handleSuccess}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
