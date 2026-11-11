import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { seedHackathonDemoTransaction } from "@/lib/demo/seed";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to load demo data." },
        { status: 401 }
      );
    }

    const profileSync = await ensureUserProfile(supabase, user);
    if (!profileSync.profile) {
      return NextResponse.json(
        {
          error:
            profileSync.error ||
            "Unable to synchronize your user profile before seeding demo data.",
        },
        { status: 500 }
      );
    }

    const result = await seedHackathonDemoTransaction({
      supabase,
      creatorId: user.id,
      buyerId: user.id,
      primaryRole:
        profileSync.profile.role === "seller" ? "seller" : "buyer",
    });

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      inviteCode: result.inviteCode,
      warnings: result.warnings,
      message:
        result.warnings.length > 0
          ? "Seeded '20 Custom Hoodies' core transaction with non-fatal warnings."
          : "Seeded '20 Custom Hoodies' transaction with full PACT workspace data.",
    });
  } catch (err) {
    console.error("Unexpected error in /api/demo/seed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error seeding hackathon demo data.",
      },
      { status: 500 }
    );
  }
}
