"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, AuthActionResult } from "@/app/actions/auth";
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
import { DemoJudgeSwitcher } from "@/components/auth/DemoJudgeSwitcher";

function subscribeLocationSearch(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getQueryErrorSnapshot(): string | null {
  return new URLSearchParams(window.location.search).get("error");
}

function getServerErrorSnapshot(): string | null {
  return null;
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signIn,
    null
  );
  const queryError = React.useSyncExternalStore(
    subscribeLocationSearch,
    getQueryErrorSnapshot,
    getServerErrorSnapshot
  );

  const displayError = state?.error || queryError;

  return (
    <Card className="shadow-lg border-border/80">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-xl font-bold">Welcome back</CardTitle>
        <CardDescription>
          Sign in to access your transaction assurance workspace
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-2">
        <DemoJudgeSwitcher variant="auth" />
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <span className="w-full border-t border-zinc-800/80" />
          </div>
          <div className="relative flex justify-center text-[10px] font-mono uppercase tracking-[0.18em]">
            <span className="bg-zinc-900 px-3 text-zinc-500">
              Or sign in with email
            </span>
          </div>
        </div>
      </div>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {displayError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

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
              label="Password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            variant="assurance"
            className="w-full h-11"
            isLoading={isPending}
          >
            Sign In to PACT
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
