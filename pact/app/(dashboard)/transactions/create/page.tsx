"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, AlertCircle, Sparkles, ShieldCheck } from "lucide-react";

const CATEGORIES = [
  "Freelance Development",
  "Design & Creative",
  "Custom Manufacturing",
  "Consulting & Advisory",
  "Artistic Commission",
  "Bespoke Merchandise",
  "Other Custom Commerce",
];

export default function CreateTransactionPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = React.useState<"buyer" | "seller">(
    "buyer"
  );
  const [selectedCategory, setSelectedCategory] = React.useState(CATEGORIES[0]);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const payload = {
      title: String(formData.get("title") || ""),
      category: selectedCategory,
      description: String(formData.get("description") || ""),
      userRole: selectedRole,
      targetBudget: Number(formData.get("targetBudget") || 0),
      currency: String(formData.get("currency") || "INR"),
    };

    try {
      const response = await fetch("/api/transactions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        transactionId?: string;
        error?: string;
      };

      if (!response.ok || !data.transactionId) {
        setError(data.error || "Unable to create transaction.");
        setIsPending(false);
        return;
      }

      router.push(`/transactions/${data.transactionId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Network error creating transaction."
      );
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="assurance">New Transaction</Badge>
            <Badge variant="outline">Step 1 of 2</Badge>
          </div>
          <CardTitle className="text-2xl font-black">
            Create Custom Commerce Transaction
          </CardTitle>
          <CardDescription>
            Establish the baseline parameters. Once created, you will receive an invite code to share with your counter-party.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">
                    Unable to create transaction
                  </strong>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-foreground select-none">
                Your Role in this Transaction
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedRole("buyer")}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 active:scale-95 cursor-pointer ${
                    selectedRole === "buyer"
                      ? "border-emerald-500/40 bg-emerald-500/10 ring-2 ring-emerald-500/20"
                      : "border-zinc-800/80 bg-zinc-950/65 hover:border-zinc-700 hover:bg-zinc-900/80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-zinc-100">
                      I am the Buyer
                    </span>
                    {selectedRole === "buyer" && (
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Purchasing custom deliverables or hiring services. You will fund and approve milestones.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole("seller")}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 active:scale-95 cursor-pointer ${
                    selectedRole === "seller"
                      ? "border-emerald-500/40 bg-emerald-500/10 ring-2 ring-emerald-500/20"
                      : "border-zinc-800/80 bg-zinc-950/65 hover:border-zinc-700 hover:bg-zinc-900/80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-zinc-100">
                      I am the Seller
                    </span>
                    {selectedRole === "seller" && (
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Delivering custom work, goods, or services. You will submit proof and receive disbursements.
                  </p>
                </button>
              </div>
              <input type="hidden" name="userRole" value={selectedRole} />
            </div>

            {/* Transaction Title */}
            <div className="space-y-2">
              <Input
                id="title"
                name="title"
                label="Transaction Title"
                placeholder="e.g. Bespoke Mobile App Prototype or Custom Walnut Dining Table"
                required
                helperText="A clear, identifiable title for both parties"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label
                htmlFor="category"
                className="block text-sm font-medium text-foreground select-none"
              >
                Category
              </label>
              <select
                id="category"
                name="category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 transition-all duration-200 cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Budget & Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Input
                  id="targetBudget"
                  name="targetBudget"
                  type="number"
                  step="0.01"
                  min="1"
                  label="Target Budget"
                  placeholder="50000"
                  className="font-mono tabular-nums tracking-tight"
                  required
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="currency"
                  className="block text-sm font-medium text-zinc-200 select-none"
                >
                  Currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  defaultValue="INR"
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-sm font-mono tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 transition-all duration-200 cursor-pointer"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-200 select-none"
              >
                Scope Overview & Initial Notes (Optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="Outline initial deliverables, key constraints, or link to external requirements. The PACT AI will analyze chat conversations to build structured agreement clauses."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 transition-all duration-200"
              />
            </div>

            {/* Assurance Banner */}
            <div className="p-3.5 rounded-xl bg-zinc-950/65 border border-zinc-800/80 flex items-center gap-3 text-xs text-zinc-400">
              <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
              <span>
                PACT generates an{" "}
                <span className="font-mono tracking-tight text-zinc-200">
                  8-character
                </span>{" "}
                invite code immediately upon creation. Your counterpart can join in seconds.
              </span>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between items-center pt-2">
            <Link href="/dashboard">
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </Link>

            <Button
              type="submit"
              variant="assurance"
              isLoading={isPending}
              className="gap-2"
            >
              <span>Create Transaction & Get Invite Code</span>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
