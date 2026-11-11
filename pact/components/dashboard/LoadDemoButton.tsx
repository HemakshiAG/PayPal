"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface LoadDemoButtonProps {
  variant?: "default" | "outline" | "secondary" | "assurance";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function LoadDemoButton({
  variant = "secondary",
  size = "default",
  className = "",
}: LoadDemoButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSeedDemo = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok || !data.transactionId) {
        throw new Error(data.error || "Unable to load hackathon demo data");
      }

      router.push(`/transactions/${data.transactionId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load hackathon demo data"
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleSeedDemo}
        isLoading={isLoading}
        className={`font-semibold cursor-pointer ${className}`}
      >
        <span>{isLoading ? "Loading 20 Custom Hoodies..." : "⚡ Load Hackathon Demo Data"}</span>
      </Button>
      {error && (
        <p className="text-[11px] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}

