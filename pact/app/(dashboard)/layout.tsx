import * as React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { signOutAction } from "@/app/actions/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection
  if (!user) {
    redirect("/login");
  }

  // Fetch or auto-sync user profile
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("full_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const profile = existingProfile || (await ensureUserProfile(supabase, user)).profile;

  const displayName = profile?.full_name || user.email?.split("@")[0] || "User";
  const userRole = profile?.role || "both";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-zinc-100 overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-100">
      {/* Top Navbar */}
      <Navbar
        displayName={displayName}
        userRole={userRole}
        userInitial={userInitial}
        signOutAction={signOutAction}
      />

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-pact-fade-up">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/80 py-6 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400 gap-3">
          <p className="font-mono text-[11px] tracking-wider uppercase">© 2026 PACT · PREDICT · AGREE · PROTECT</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Verified Protection</Badge>
            <Badge variant="assurance" pulse className="text-[10px]">SHA-256 Assurance Active</Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}

