"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Badge,
} from "@/components/ui";
import { ArrowLeft, AlertCircle, KeyRound, ShieldCheck } from "lucide-react";

function JoinTransactionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = React.useState(() =>
    (searchParams.get("code") || "").toUpperCase().replace(/\s+/g, "")
  );
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) {
      setError("Invite code must be at least 6 characters.");
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch("/api/transactions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: trimmed }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        transactionId?: string;
        error?: string;
      };

      if (!response.ok || !payload.transactionId) {
        setError(payload.error || "Could not join transaction.");
        setIsPending(false);
        return;
      }

      router.push(`/transactions/${payload.transactionId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error joining workspace."
      );
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <Card className="shadow-lg border-border/80">
        <CardHeader className="space-y-1 text-center">
          <div className="h-12 w-12 mx-auto rounded-xl bg-assurance/10 border border-assurance/20 flex items-center justify-center text-assurance mb-2">
            <KeyRound className="h-6 w-6 text-assurance" />
          </div>
          <Badge variant="assurance" className="w-fit mx-auto mb-1">
            Mutual Assurance
          </Badge>
          <CardTitle className="text-xl font-black">
            Join Existing Transaction
          </CardTitle>
          <CardDescription>
            Enter the 8-character invite code shared by your counter-party to enter the shared workspace.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">
                    Could not join transaction
                  </strong>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Input
                id="inviteCode"
                name="inviteCode"
                label="Invite Code"
                placeholder="e.g. A7X9K2M4"
                value={code}
                onChange={handleCodeChange}
                maxLength={16}
                required
                className="text-center font-mono tracking-widest text-lg uppercase font-bold"
                helperText="Enter the 8-character code provided by the buyer or seller."
              />
            </div>

            <div className="p-3 rounded-lg bg-zinc-950/65 border border-zinc-800/80 flex items-center gap-2.5 text-xs text-zinc-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                You will automatically join as the complementary role (Buyer or Seller).
              </span>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              variant="assurance"
              isLoading={isPending}
              className="w-full h-11 text-sm font-bold"
            >
              Enter Transaction Workspace
            </Button>

            <Link href="/dashboard" className="w-full">
              <Button variant="ghost" type="button" className="w-full text-xs">
                Cancel
              </Button>
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function JoinTransactionPage() {
  return (
    <React.Suspense fallback={null}>
      <JoinTransactionForm />
    </React.Suspense>
  );
}
