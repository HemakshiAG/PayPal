import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinTransactionSchema } from "@/validations/transaction";
import { joinTransactionForUser } from "@/lib/transactions/service";

export async function POST(request: Request) {
  try {
    const rawBody = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const rawInviteCode =
      rawBody?.inviteCode ?? rawBody?.invite_code ?? rawBody?.code;

    const validated = joinTransactionSchema.safeParse({
      inviteCode: rawInviteCode,
    });

    if (!validated.success) {
      return NextResponse.json(
        {
          error:
            validated.error.issues?.[0]?.message ||
            "Invalid invite code format.",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in first." },
        { status: 401 }
      );
    }

    const result = await joinTransactionForUser(
      supabase,
      user,
      validated.data.inviteCode
    );

    if (result.error || !result.transactionId) {
      return NextResponse.json(
        { error: result.error || "Could not join transaction." },
        { status: result.statusCode || 404 }
      );
    }

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      inviteCode: result.inviteCode,
      alreadyJoined: Boolean(result.alreadyJoined),
    });
  } catch (err) {
    console.error("[api/transactions/join] Unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal error joining transaction.",
      },
      { status: 500 }
    );
  }
}

