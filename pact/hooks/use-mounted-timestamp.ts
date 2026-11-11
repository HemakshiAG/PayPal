"use client";

import * as React from "react";
import {
  formatLocalTimestamp,
  formatUtcTimestamp,
  type TimestampFormatMode,
} from "@/lib/datetime";

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the initial hydration pass, then `true` after client mount.
 * Uses `useSyncExternalStore` so SSR and initial client render stay identical without effect state warnings.
 */
export function useHasMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/**
 * Formats a date/timestamp as deterministic UTC before mount and switches to the browser's locale
 * once mounted to avoid Next.js client/server hydration mismatches.
 */
export function useMountedTimestamp(
  value: string | number | Date | null | undefined,
  mode: TimestampFormatMode = "datetime",
  fallback = "—"
): string {
  const hasMounted = useHasMounted();
  if (!hasMounted) {
    return formatUtcTimestamp(value, mode, fallback);
  }
  return formatLocalTimestamp(value, mode, fallback);
}

