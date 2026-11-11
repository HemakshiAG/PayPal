import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTransactionSchema } from "@/validations/transaction";
import { createTransactionForUser } from "@/lib/transactions/service";

export async function POST(request: Request) {
  try {
    const rawBody = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 }
      );
    }

    const normalizedPayload = {
      title: rawBody.title,
      category: rawBody.category || "Other Custom Commerce",
      description:
        typeof rawBody.description === "string" ? rawBody.description : "",
      userRole:
        typeof (rawBody.userRole ?? rawBody.role) === "string"
          ? String(rawBody.userRole ?? rawBody.role)
              .trim()
              .toLowerCase()
          : "buyer",
      targetBudget: rawBody.targetBudget ?? rawBody.totalAmount ?? rawBody.budget,
      currency:
        typeof rawBody.currency === "string" && rawBody.currency.trim()
          ? rawBody.currency.trim().toUpperCase()
          : "INR",
    };

    const validated = createTransactionSchema.safeParse(normalizedPayload);
    if (!validated.success) {
      return NextResponse.json(
        {
          error:
            validated.error.issues?.[0]?.message || "Invalid transaction details.",
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

    const result = await createTransactionForUser(supabase, user, validated.data);

    if (result.error || !result.transactionId) {
      return NextResponse.json(
        { error: result.error || "Unable to create transaction." },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        transactionId: result.transactionId,
        inviteCode: result.inviteCode,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/transactions/create] Unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal error creating transaction.",
      },
      { status: 500 }
    );
  }
}

