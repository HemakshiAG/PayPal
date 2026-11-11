"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { signUp, AuthActionResult } from "@/app/actions/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
} from "@/components/ui";
import { AlertCircle } from "lucide-react";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signUp,
    null
  );
  const [selectedRole, setSelectedRole] = React.useState<"buyer" | "seller" | "both">("both");

  return (
    <Card className="shadow-lg border-border/80">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-xl font-bold">Create your account</CardTitle>
        <CardDescription>
          Join PACT to agree with certainty, predict complications, and protect custom transactions
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state?.error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Input
              id="fullName"
              name="fullName"
              type="text"
              label="Full Name"
              placeholder="e.g. Alex Morgan"
              required
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Input
              id="email"
              name="email"
              type="email"
              label="Email Address"
              placeholder="name@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Input
              id="password"
              name="password"
              type="password"
              label="Password (min. 6 characters)"
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground select-none">
              Primary Role in Custom Commerce
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "buyer", label: "Buyer" },
                { value: "seller", label: "Seller" },
                { value: "both", label: "Both" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedRole(item.value as "buyer" | "seller" | "both")}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    selectedRole === item.value
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="role" value={selectedRole} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            variant="assurance"
            className="w-full h-11"
            isLoading={isPending}
          >
            Create PACT Account
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

