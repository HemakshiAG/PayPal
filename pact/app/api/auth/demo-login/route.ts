import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { provisionAndSignInDemoRole } from "@/lib/auth/demo-provision";

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

function resolveSafeRedirectPath(
  requestedPath: string | null,
  fallbackPath: string
): string {
  if (!requestedPath) return fallbackPath;
  const trimmed = requestedPath.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/auth")
  ) {
    return fallbackPath;
  }
  return trimmed;
}

function applyPendingCookies(
  response: NextResponse,
  pendingCookies: Map<string, PendingCookie>
): NextResponse {
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawRole = searchParams.get("role")?.trim().toLowerCase();

  if (rawRole !== "buyer" && rawRole !== "seller") {
    return NextResponse.redirect(
      new URL("/login?error=Invalid+demo+role", request.url)
    );
  }

  // Track every cookie mutation from Supabase SSR so all Set-Cookie headers
  // land directly on the final HTTP redirect response.
  const pendingCookies = new Map<string, PendingCookie>();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          const merged = new Map<string, { name: string; value: string }>();
          request.cookies.getAll().forEach((c) => {
            merged.set(c.name, { name: c.name, value: c.value });
          });
          pendingCookies.forEach((c) => {
            merged.set(c.name, { name: c.name, value: c.value });
          });
          return Array.from(merged.values());
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.set(name, { name, value, options });
          });
        },
      },
    }
  );

  try {
    const result = await provisionAndSignInDemoRole(supabase, rawRole);

    const nextParam = searchParams.get("next");
    const defaultTarget =
      nextParam === "workspace" && result.demoTransactionId
        ? `/transactions/${result.demoTransactionId}`
        : "/dashboard";
    const targetPath = resolveSafeRedirectPath(
      searchParams.get("redirectTo"),
      defaultTarget
    );

    const redirectResponse = NextResponse.redirect(
      new URL(targetPath, request.url)
    );
    return applyPendingCookies(redirectResponse, pendingCookies);
  } catch (err) {
    console.error("[demo-login] Failed server-side demo sign-in:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to initialize demo session.";
    const errorResponse = NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(errorMessage)}`,
        request.url
      )
    );
    return applyPendingCookies(errorResponse, pendingCookies);
  }
}

