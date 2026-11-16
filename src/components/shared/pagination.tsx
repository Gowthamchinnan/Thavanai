import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function hrefWith(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "" && key !== "page") search.set(key, value);
  }
  search.set("page", String(page));
  return `${basePath}?${search.toString()}`;
}

export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) {
    return <p className="mt-4 text-xs text-muted-foreground">{total} record{total === 1 ? "" : "s"}</p>;
  }
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total} record{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <Link
          href={hrefWith(basePath, params, prev)}
          aria-disabled={page <= 1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
        <Link
          href={hrefWith(basePath, params, next)}
          aria-disabled={page >= totalPages}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= totalPages && "pointer-events-none opacity-50")}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
