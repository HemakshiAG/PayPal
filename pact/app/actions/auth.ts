"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { loginSchema, signupSchema } from "@/validations/auth";

export interface AuthActionResult {
  error?: string;
  success?: boolean;
}

export async function signIn(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const validated = loginSchema.safeParse(rawData);
  if (!validated.success) {
    return { error: validated.error.issues?.[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    await ensureUserProfile(supabase, data.user);
  }

  redirect("/dashboard");
}

export async function signUp(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const rawData = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") || "both",
  };

  const validated = signupSchema.safeParse(rawData);
  if (!validated.success) {
    return { error: validated.error.issues?.[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      data: {
        full_name: validated.data.fullName,
        role: validated.data.role,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user && (data.session || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    await ensureUserProfile(supabase, data.user);
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
