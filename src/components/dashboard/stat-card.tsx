import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  default: "bg-card text-foreground",
  primary: "bg-primary text-primary-foreground",
  soft: "bg-accent/70 text-foreground",
  rose: "bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100",
  amber: "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
  blue: "bg-blue-50 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  valueClassName?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border p-4 shadow-sm", TONES[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
        {Icon ? <Icon className="h-4 w-4 opacity-60" /> : null}
      </div>
      <p className={cn("num mt-2 text-xl font-semibold tracking-tight sm:text-2xl", valueClassName)}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] opacity-70">{hint}</p> : null}
    </div>
  );
}
