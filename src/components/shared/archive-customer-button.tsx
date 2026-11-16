"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { setCustomerArchivedAction } from "@/app/actions/customers";

export function ArchiveCustomerButton({
  customerId,
  customerName,
  archived,
}: {
  customerId: string;
  customerName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    try {
      const result = await setCustomerArchivedAction(customerId, !archived);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Customer updated.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {archived ? "Restore" : "Archive"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archived ? `Restore ${customerName}?` : `Archive ${customerName}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {archived
              ? "The customer will become selectable for new loans again."
              : "Archived customers keep all financial history but cannot receive new loans. Customers with active or draft loans cannot be archived."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void run();
            }}
            disabled={pending}
            className={archived ? "bg-primary text-primary-foreground hover:opacity-90" : undefined}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {archived ? "Restore customer" : "Archive customer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
