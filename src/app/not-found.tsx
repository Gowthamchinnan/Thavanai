import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        The record or page you requested does not exist, or it was removed. Check the address and try again.
      </p>
      <div className="mt-5 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/loans">Browse loans</Link>
        </Button>
      </div>
    </div>
  );
}
