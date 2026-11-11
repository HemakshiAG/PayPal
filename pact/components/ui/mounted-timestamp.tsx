"use client";

import * as React from "react";
import { formatIsoTimestamp, type TimestampFormatMode } from "@/lib/datetime";
import { useMountedTimestamp } from "@/hooks/use-mounted-timestamp";

export interface MountedTimestampProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  value: string | number | Date | null | undefined;
  mode?: TimestampFormatMode;
  prefix?: string;
  suffix?: string;
  fallback?: string;
}

/**
 * Hydration-safe timestamp element that renders deterministic UTC on SSR/hydration,
 * upgrades to local time after mount, and carries `suppressHydrationWarning`.
 */
export function MountedTimestamp({
  value,
  mode = "datetime",
  prefix = "",
  suffix = "",
  fallback = "—",
  title,
  ...props
}: MountedTimestampProps) {
  const formatted = useMountedTimestamp(value, mode, fallback);
  const isoTitle = title ?? (formatIsoTimestamp(value) || undefined);

  return (
    <span suppressHydrationWarning title={isoTitle} {...props}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

