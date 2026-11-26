"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} homeHref="/login" homeLabel="Go to sign in" />;
}
