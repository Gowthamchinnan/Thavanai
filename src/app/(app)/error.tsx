"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} homeHref="/dashboard" homeLabel="Go to dashboard" />;
}
