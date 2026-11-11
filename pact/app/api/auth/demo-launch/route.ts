import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { provisionAndSignInDemoRole } from "@/lib/auth/demo-provision";

const DemoLaunchSchema = z.object({
  role: z.enum(["buyer", "seller"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = DemoLaunchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid demo role. Choose 'buyer' or 'seller'." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const result = await provisionAndSignInDemoRole(supabase, parsed.data.role);

    return NextResponse.json({
      success: true,
      role: result.targetConfig.role,
      email: result.targetConfig.email,
      userId: result.user.id,
      transactionId: result.demoTransactionId,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    console.error("[demo-launch] Failed launching judge demo session:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to initialize demo session.",
      },
      { status: 500 }
    );
  }
}
