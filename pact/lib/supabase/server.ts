import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for Server Components, Server Actions, and Route Handlers.
 * In Next.js 15/16, cookies() is an async function returning a ReadonlyRequestCookies store.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Invoked from Server Component where cookies cannot be mutated directly.
            // Handled cleanly via middleware session refresh.
          }
        },
      },
    }
  );
}

/**
 * Creates an admin Supabase client with SUPABASE_SERVICE_ROLE_KEY.
 * Strictly used in server contexts (e.g. webhook listeners) and NEVER exposed to frontend.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin client initialization.");
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    serviceKey,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}

