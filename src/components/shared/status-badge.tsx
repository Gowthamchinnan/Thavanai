import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONES,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_TONES,
} from "@/lib/constants";

export function LoanStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", LOAN_STATUS_TONES[status], className)}>
      {LOAN_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function InstallmentStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", INSTALLMENT_STATUS_TONES[status], className)}>
      {INSTALLMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "VOIDED") {
    return (
      <Badge variant="secondary" className="border-0 bg-rose-100 font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        Voided
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="border-0 bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      Posted
    </Badge>
  );
}
