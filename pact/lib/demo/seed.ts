import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compileAgreementSections } from "@/services/agreement/builder";
import { computeCanonicalAgreementHash } from "@/lib/agreement/hash";
import { logTransactionEvent } from "@/lib/ledger/events";
import type {
  ExtractedTermRow,
  ScenarioResolutionRow,
  ScenarioRow,
} from "@/types/database";

export interface SeedDemoTransactionOptions {
  supabase: SupabaseClient;
  creatorId: string;
  buyerId: string;
  sellerId?: string | null;
  primaryRole?: "buyer" | "seller";
  inviteCode?: string;
  transactionId?: string;
}

export interface SeedDemoTransactionResult {
  transactionId: string;
  inviteCode: string;
  warnings: string[];
}

interface SeedMessageDraft {
  transaction_id: string;
  sender_id: string;
  role: "buyer" | "seller";
  message_text: string;
  timestampIso: string;
}

function generateDemoInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HOOD${suffix}`;
}

async function ensureMinimalProfileExists(
  supabase: SupabaseClient,
  userId: string,
  role: "buyer" | "seller" | "both",
  warnings: string[]
): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        role,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error) {
      console.warn(`[seed] Non-fatal profile ensure warning for ${userId}:`, error.message);
      warnings.push(`Profile sync warning: ${error.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown profile sync error";
    console.warn(`[seed] Non-fatal profile ensure exception for ${userId}:`, msg);
    warnings.push(`Profile sync warning: ${msg}`);
  }
}

/**
 * Inserts sample chat messages across schema variants without blocking transaction creation:
 * - Supports standard `(transaction_id, sender_id, content, created_at)`
 * - Supports omitting `created_at` to rely on PostgreSQL `DEFAULT NOW()`
 * - Supports extended `(role, message_text, content, created_at / sent_at)` schemas
 */
async function insertSampleMessagesWithFallback(
  supabase: SupabaseClient,
  drafts: SeedMessageDraft[],
  warnings: string[]
): Promise<string[]> {
  const candidatePayloads: Array<{
    label: string;
    rows: Array<Record<string, unknown>>;
  }> = [
    {
      label: "core schema + explicit created_at",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        content: m.message_text,
        created_at: m.timestampIso,
      })),
    },
    {
      label: "core schema + PostgreSQL DEFAULT NOW()",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        content: m.message_text,
      })),
    },
    {
      label: "extended schema (role, message_text, content, created_at)",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        role: m.role,
        message_text: m.message_text,
        content: m.message_text,
        created_at: m.timestampIso,
      })),
    },
    {
      label: "extended schema + PostgreSQL DEFAULT NOW()",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        role: m.role,
        message_text: m.message_text,
        content: m.message_text,
      })),
    },
    {
      label: "extended schema + sent_at fallback",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        role: m.role,
        message_text: m.message_text,
        content: m.message_text,
        sent_at: m.timestampIso,
      })),
    },
    {
      label: "minimal content + sent_at fallback",
      rows: drafts.map((m) => ({
        transaction_id: m.transaction_id,
        sender_id: m.sender_id,
        content: m.message_text,
        sent_at: m.timestampIso,
      })),
    },
  ];

  let lastErrorMsg = "Unknown messages insertion failure";

  for (const candidate of candidatePayloads) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert(candidate.rows)
        .select("id");

      if (!error && Array.isArray(data)) {
        return data
          .map((row) => row.id as string)
          .filter((id) => typeof id === "string" && id.length > 0);
      }

      if (error) {
        lastErrorMsg = `${candidate.label}: ${error.message}`;
      }
    } catch (err) {
      lastErrorMsg = `${candidate.label}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  console.warn(
    `[seed] Warning: Failed to seed sample chat messages (continuing without blocking): ${lastErrorMsg}`
  );
  warnings.push(`Messages seed skipped: ${lastErrorMsg}`);
  return [];
}

export async function seedHackathonDemoTransaction({
  supabase,
  creatorId,
  buyerId,
  sellerId,
  primaryRole = "buyer",
  inviteCode: requestedInviteCode,
  transactionId: requestedTransactionId,
}: SeedDemoTransactionOptions): Promise<SeedDemoTransactionResult> {
  const warnings: string[] = [];
  const totalAmount = 1200;
  const currency = "USD";
  const normalizedRequested = requestedInviteCode?.trim().toUpperCase();
  const inviteCode =
    normalizedRequested && normalizedRequested.length >= 6
      ? normalizedRequested
      : generateDemoInviteCode();

  // Guarantee foreign-key profiles exist prior to inserting transactions
  await ensureMinimalProfileExists(supabase, creatorId, primaryRole, warnings);
  if (buyerId !== creatorId) {
    await ensureMinimalProfileExists(supabase, buyerId, "buyer", warnings);
  }
  if (sellerId && sellerId !== creatorId && sellerId !== buyerId) {
    await ensureMinimalProfileExists(supabase, sellerId, "seller", warnings);
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .insert({
      ...(requestedTransactionId ? { id: requestedTransactionId } : {}),
      title: "20 Custom Hoodies",
      description:
        "Custom batch of 20 heavyweight 420GSM organic cotton hoodies in Vintage Charcoal with 3D puff-print chest logo, woven neck labels, and graded S–XL sizing.",
      category: "Custom Manufacturing",
      status: "locked",
      creator_id: creatorId,
      invite_code: inviteCode,
      total_amount: totalAmount,
      currency,
    })
    .select("*")
    .single();

  if (txError || !tx) {
    throw new Error(txError?.message || "Failed to create demo transaction");
  }

  const participantsToInsert =
    sellerId && sellerId !== buyerId
      ? [
          { transaction_id: tx.id, user_id: buyerId, role: "buyer" },
          { transaction_id: tx.id, user_id: sellerId, role: "seller" },
        ]
      : [{ transaction_id: tx.id, user_id: buyerId, role: primaryRole }];

  try {
    const { error: partError } = await supabase
      .from("transaction_participants")
      .upsert(participantsToInsert, {
        onConflict: "transaction_id,user_id",
        ignoreDuplicates: true,
      });

    if (partError) {
      console.warn(
        "[seed] Non-fatal transaction_participants insert warning:",
        partError.message
      );
      warnings.push(`Participants sync warning: ${partError.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal transaction_participants exception:", msg);
    warnings.push(`Participants sync warning: ${msg}`);
  }

  const buyerSender = buyerId;
  const sellerSender = sellerId && sellerId !== buyerId ? sellerId : buyerId;

  const nowMs = Date.now();
  const minMs = 60 * 1000;
  const sampleMessageDrafts: SeedMessageDraft[] = [
    {
      transaction_id: tx.id,
      sender_id: buyerSender,
      role: "buyer",
      message_text:
        "Looking to commission 20 custom hoodies in Vintage Charcoal using 420GSM combed cotton French terry. Size breakdown: 4 Small, 7 Medium, 6 Large, and 3 XL.",
      timestampIso: new Date(nowMs - 180 * minMs).toISOString(),
    },
    {
      transaction_id: tx.id,
      sender_id: sellerSender,
      role: "seller",
      message_text:
        "Decoration requirements confirmed: raised 3D puff-print chest logo (white ink), satin woven neck tag, and individual polybag packing per hoodie.",
      timestampIso: new Date(nowMs - 145 * minMs).toISOString(),
    },
    {
      transaction_id: tx.id,
      sender_id: buyerSender,
      role: "buyer",
      message_text:
        "Agreed price is $1,200.00 USD total ($60 per hoodie) paid via 3 PayPal milestones: 30% deposit ($360), 40% mid-production proof ($480), and 30% on final delivery ($360).",
      timestampIso: new Date(nowMs - 110 * minMs).toISOString(),
    },
    {
      transaction_id: tx.id,
      sender_id: sellerSender,
      role: "seller",
      message_text:
        "Target turnaround is 14 calendar days with a strike-off sample photo shared before running the remaining 19 units, plus tracked courier shipping.",
      timestampIso: new Date(nowMs - 75 * minMs).toISOString(),
    },
    {
      transaction_id: tx.id,
      sender_id: buyerSender,
      role: "buyer",
      message_text:
        "Buyer gets a 48-hour delivery inspection window to verify GSM weight, print curing, and sizing measurements via Evidence Vault photos.",
      timestampIso: new Date(nowMs - 40 * minMs).toISOString(),
    },
  ];

  // 1. Seed sample messages gracefully without blocking workspace launch
  const msgIds = await insertSampleMessagesWithFallback(
    supabase,
    sampleMessageDrafts,
    warnings
  );

  const pickMsgIds = (...indices: number[]): string[] =>
    indices
      .map((idx) => msgIds[idx])
      .filter((id): id is string => typeof id === "string" && id.length > 0);

  // 2. Seed extracted terms gracefully
  let insertedTerms: ExtractedTermRow[] = [];
  try {
    const termPayloads = [
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(0),
        term_key: "Batch Quantity & Size Breakdown",
        term_value: "20 Custom Hoodies — 4 Small, 7 Medium, 6 Large, 3 Extra-Large",
        category: "specification" as const,
        classification: "explicitly_agreed" as const,
        confidence_score: 0.99,
        status: "confirmed" as const,
      },
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(0, 1),
        term_key: "Fabric Weight & Print Spec",
        term_value:
          "420GSM organic cotton French terry in Vintage Charcoal; raised 3D puff-print chest logo and woven neck labels",
        category: "specification" as const,
        classification: "explicitly_agreed" as const,
        confidence_score: 0.97,
        status: "confirmed" as const,
      },
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(2),
        term_key: "Contract Value & Milestone Split",
        term_value:
          "$1,200.00 USD total ($60/unit): 30% Deposit ($360), 40% Mid-Production ($480), 30% Final Acceptance ($360)",
        category: "financial" as const,
        classification: "explicitly_agreed" as const,
        confidence_score: 0.98,
        status: "confirmed" as const,
      },
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(3),
        term_key: "Production & Dispatch Window",
        term_value: "14 calendar days complete production & tracked courier dispatch",
        category: "timeline" as const,
        classification: "explicitly_agreed" as const,
        confidence_score: 0.96,
        status: "confirmed" as const,
      },
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(4),
        term_key: "Post-Delivery Inspection Period",
        term_value:
          "48-hour inspection window to audit print registration, stitching, and size accuracy",
        category: "condition" as const,
        classification: "explicitly_agreed" as const,
        confidence_score: 0.94,
        status: "confirmed" as const,
      },
      {
        transaction_id: tx.id,
        source_message_ids: pickMsgIds(3),
        term_key: "First Strike-Off Sample Sign-Off",
        term_value:
          "High-resolution proof photo of unit #1 required before full 20-unit print batch run",
        category: "condition" as const,
        classification: "ai_recommended" as const,
        confidence_score: 0.91,
        status: "pending" as const,
      },
    ];

    const { data: termRows, error: termError } = await supabase
      .from("extracted_terms")
      .insert(termPayloads)
      .select("*");

    if (termError || !termRows) {
      console.warn(
        "[seed] Non-fatal extracted_terms insert warning:",
        termError?.message
      );
      warnings.push(
        `Extracted terms seed skipped: ${termError?.message || "Unknown error"}`
      );
    } else {
      insertedTerms = termRows as ExtractedTermRow[];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal extracted_terms exception:", msg);
    warnings.push(`Extracted terms seed skipped: ${msg}`);
  }

  // 3. Seed predictive scenarios & contingency resolutions gracefully
  let insertedScenarios: ScenarioRow[] = [];
  let insertedResolutions: ScenarioResolutionRow[] = [];
  try {
    const scenarioPayloads = [
      {
        transaction_id: tx.id,
        category: "material_shortage",
        title: "420GSM Vintage Charcoal Blank Stockout",
        description:
          "Distributor inventory for heavyweight 420GSM Vintage Charcoal fleece runs out mid-procurement before XL sizing is cut.",
        severity: "high",
        status: "resolved",
        consequence_chain: [
          {
            step: 1,
            title: "Dye-Lot Delay Identified",
            description:
              "Mill restock window extends primary sourcing by 5–7 business days.",
            delayDays: 6,
            costImpact: 0,
            actor: "seller",
          },
          {
            step: 2,
            title: "Production Queue Freeze",
            description:
              "Screen-printing press slot slips if substitute GSM fabric is not pre-authorized.",
            delayDays: 3,
            costImpact: 0,
            actor: "system",
          },
          {
            step: 3,
            title: "Retail Launch Risk",
            description:
              "Final 20-hoodie merch drop misses Buyer launch date without pre-approved fallback swatch.",
            delayDays: 7,
            costImpact: 120,
            actor: "buyer",
          },
        ],
        recommended_resolutions: [
          {
            id: "rec-mat-1",
            title: "Pre-Authorized GOTS Alternate Swatch",
            action:
              "Seller presents an equivalent 420GSM Charcoal Melange swatch photo within 24h for Buyer sign-off at $0 surcharge.",
            priceImpactType: "none",
            priceImpactValue: 0,
            timelineImpactDays: 2,
          },
          {
            id: "rec-mat-2",
            title: "Split Batch Priority Dispatch",
            action:
              "Ship available S–L sizes immediately and follow with XL batch via express courier at Seller expense.",
            priceImpactType: "none",
            priceImpactValue: 0,
            timelineImpactDays: 4,
          },
        ],
      },
      {
        transaction_id: tx.id,
        category: "timeline_delay",
        title: "Puff-Print Curing Queue Bottleneck",
        description:
          "3D puff-ink curing throughput slows down during high humidity, jeopardizing the 14-calendar-day dispatch milestone.",
        severity: "medium",
        status: "resolved",
        consequence_chain: [
          {
            step: 1,
            title: "48h Advance Risk Notice",
            description:
              "Seller logs press backlog warning in workspace prior to midpoint due date.",
            delayDays: 2,
            costImpact: 0,
            actor: "seller",
          },
          {
            step: 2,
            title: "Transit Compression Required",
            description:
              "Standard ground shipping would miss Buyer event date by 3 days.",
            delayDays: 3,
            costImpact: 45,
            actor: "system",
          },
        ],
        recommended_resolutions: [
          {
            id: "rec-time-1",
            title: "Grace Window + Express Air Upgrade",
            action:
              "Grant 3-day production extension with mandatory express 2-day courier upgrade and $45 late-dispatch credit.",
            priceImpactType: "discount",
            priceImpactValue: 45,
            timelineImpactDays: 3,
          },
        ],
      },
      {
        transaction_id: tx.id,
        category: "quality_rejection",
        title: "Puff-Print Cracking or Misalignment Variance",
        description:
          "One or more finished hoodies exhibit >3mm logo placement drift or ink cracking after wash test during the 48-hour inspection.",
        severity: "high",
        status: "open",
        consequence_chain: [
          {
            step: 1,
            title: "Inspection Proof Upload",
            description:
              "Buyer logs macro photos in Evidence Vault within 48h of courier delivery.",
            delayDays: 1,
            costImpact: 0,
            actor: "buyer",
          },
          {
            step: 2,
            title: "Milestone 3 Hold",
            description:
              "Final 30% milestone disbursement pauses pending reprint or unit credit calculation.",
            delayDays: 5,
            costImpact: 180,
            actor: "system",
          },
        ],
        recommended_resolutions: [
          {
            id: "rec-qual-1",
            title: "Free Reprint or Per-Unit Credit ($60/hoodie)",
            action:
              "Seller reprints verified defective units within 5 business days at zero cost or credits $60 per rejected unit against Milestone 3.",
            priceImpactType: "discount",
            priceImpactValue: 120,
            timelineImpactDays: 5,
          },
        ],
      },
    ];

    const { data: scenarioRows, error: scenError } = await supabase
      .from("scenarios")
      .insert(scenarioPayloads)
      .select("*");

    if (scenError || !scenarioRows) {
      console.warn(
        "[seed] Non-fatal scenarios insert warning:",
        scenError?.message
      );
      warnings.push(
        `Scenarios seed skipped: ${scenError?.message || "Unknown error"}`
      );
    } else {
      insertedScenarios = scenarioRows as ScenarioRow[];

      const materialScenario = insertedScenarios.find(
        (s) => s.category === "material_shortage"
      );
      const timelineScenario = insertedScenarios.find(
        (s) => s.category === "timeline_delay"
      );

      const resolutionsToInsert: Array<Record<string, unknown>> = [];

      if (materialScenario) {
        resolutionsToInsert.push({
          scenario_id: materialScenario.id,
          transaction_id: tx.id,
          proposed_by: sellerSender,
          agreed_action:
            "Seller presents an equivalent 420GSM Charcoal Melange GOTS swatch photo within 24h for Buyer sign-off at zero price surcharge.",
          price_impact_type: "none",
          price_impact_value: 0,
          timeline_impact_days: 2,
          buyer_approved: true,
          seller_approved: true,
          buyer_approved_at: new Date(nowMs - 30 * minMs).toISOString(),
          seller_approved_at: new Date(nowMs - 28 * minMs).toISOString(),
          status: "accepted",
        });
      }

      if (timelineScenario) {
        resolutionsToInsert.push({
          scenario_id: timelineScenario.id,
          transaction_id: tx.id,
          proposed_by: buyerSender,
          agreed_action:
            "With 48h advance notice, Buyer grants up to 3-day curing extension paired with complimentary express courier upgrade and $45 invoice credit.",
          price_impact_type: "discount",
          price_impact_value: 45,
          timeline_impact_days: 3,
          buyer_approved: true,
          seller_approved: true,
          buyer_approved_at: new Date(nowMs - 25 * minMs).toISOString(),
          seller_approved_at: new Date(nowMs - 24 * minMs).toISOString(),
          status: "accepted",
        });
      }

      if (resolutionsToInsert.length > 0) {
        const { data: resRows, error: resError } = await supabase
          .from("scenario_resolutions")
          .insert(resolutionsToInsert)
          .select("*");

        if (resError) {
          console.warn(
            "[seed] Non-fatal scenario_resolutions insert warning:",
            resError.message
          );
          warnings.push(`Scenario resolutions seed skipped: ${resError.message}`);
        } else if (resRows) {
          insertedResolutions = resRows as ScenarioResolutionRow[];
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal scenarios exception:", msg);
    warnings.push(`Scenarios seed skipped: ${msg}`);
  }

  // 4. Compile & seed immutable versioned agreements + approvals gracefully
  const confirmedTerms = insertedTerms.filter((t) => t.status === "confirmed");
  const txSummary = {
    id: tx.id,
    title: tx.title,
    description: tx.description,
    category: tx.category,
    totalAmount,
    currency,
  };

  let activeVersion: {
    id: string;
    version_number: number;
    content_hash: string;
  } | null = null;
  let activeHash = "";

  try {
    const v1Sections = compileAgreementSections(txSummary, confirmedTerms, []);
    const v1Hash = computeCanonicalAgreementHash(v1Sections);

    const scenariosWithResolutions = insertedScenarios.map((s) => ({
      ...s,
      scenario_resolutions: insertedResolutions.filter(
        (r) => r.scenario_id === s.id
      ),
    }));

    const v2Sections = compileAgreementSections(
      txSummary,
      confirmedTerms,
      scenariosWithResolutions
    );
    const v2Hash = computeCanonicalAgreementHash(v2Sections);
    activeHash = v2Hash;

    const { data: insertedVersions, error: verError } = await supabase
      .from("agreement_versions")
      .insert([
        {
          transaction_id: tx.id,
          version_number: 1,
          content_hash: v1Hash,
          title: "20 Custom Hoodies — Baseline Order Agreement (V1)",
          sections: v1Sections,
          status: "superseded",
          created_by: creatorId,
          created_at: new Date(nowMs - 35 * minMs).toISOString(),
        },
        {
          transaction_id: tx.id,
          version_number: 2,
          content_hash: v2Hash,
          title: "20 Custom Hoodies — Contingency-Protected Agreement (V2)",
          sections: v2Sections,
          status: "active",
          created_by: creatorId,
          created_at: new Date(nowMs - 20 * minMs).toISOString(),
        },
      ])
      .select("*")
      .order("version_number", { ascending: false });

    if (verError || !insertedVersions || insertedVersions.length === 0) {
      console.warn(
        "[seed] Non-fatal agreement_versions insert warning:",
        verError?.message
      );
      warnings.push(
        `Agreement versions seed skipped: ${verError?.message || "Unknown error"}`
      );
    } else {
      const resolvedActive =
        insertedVersions.find((v) => v.status === "active") ||
        insertedVersions[0] ||
        null;
      activeVersion = resolvedActive;

      if (resolvedActive) {
        const approvalPayloads =
          sellerId && sellerId !== buyerId
            ? [
                {
                  agreement_version_id: resolvedActive.id,
                  transaction_id: tx.id,
                  user_id: buyerId,
                  role: "buyer",
                  content_hash: v2Hash,
                },
                {
                  agreement_version_id: resolvedActive.id,
                  transaction_id: tx.id,
                  user_id: sellerId,
                  role: "seller",
                  content_hash: v2Hash,
                },
              ]
            : [
                {
                  agreement_version_id: resolvedActive.id,
                  transaction_id: tx.id,
                  user_id: buyerId,
                  role: primaryRole,
                  content_hash: v2Hash,
                },
              ];

        const { error: appError } = await supabase
          .from("agreement_approvals")
          .insert(approvalPayloads);

        if (appError) {
          console.warn(
            "[seed] Non-fatal agreement_approvals insert warning:",
            appError.message
          );
          warnings.push(`Agreement approvals seed skipped: ${appError.message}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal agreement seeding exception:", msg);
    warnings.push(`Agreement seeding skipped: ${msg}`);
  }

  // 5. Seed PayPal milestones & sample capture receipt gracefully
  let firstMilestone: { id: string; title: string } | null = null;
  const demoOrderId = `DEMO-ORD-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
  const demoCaptureId = `DEMO-CAP-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  try {
    if (activeVersion) {
      const dayMs = 24 * 60 * 60 * 1000;
      const milestonePayloads = [
        {
          transaction_id: tx.id,
          agreement_version_id: activeVersion.id,
          title: "Milestone 1: 30% Initial Deposit & Fleece Sourcing",
          description:
            "30% initial disbursement ($360.00) authorizing procurement of 420GSM Vintage Charcoal French terry fleece.",
          amount: 360.0,
          currency,
          sequence_order: 1,
          status: "paid",
          due_date: new Date(nowMs + 1 * dayMs).toISOString(),
        },
        {
          transaction_id: tx.id,
          agreement_version_id: activeVersion.id,
          title: "Milestone 2: 40% Strike-Off Print & Mid-Production Proof",
          description:
            "40% progress milestone ($480.00) unlocked after Seller uploads strike-off sample and puff-print production photos.",
          amount: 480.0,
          currency,
          sequence_order: 2,
          status: "pending",
          due_date: new Date(nowMs + 7 * dayMs).toISOString(),
        },
        {
          transaction_id: tx.id,
          agreement_version_id: activeVersion.id,
          title: "Milestone 3: 30% Final Dispatch & 48h Inspection Acceptance",
          description:
            "Final 30% settlement ($360.00) released following tracked delivery and completion of Buyer inspection window.",
          amount: 360.0,
          currency,
          sequence_order: 3,
          status: "pending",
          due_date: new Date(nowMs + 14 * dayMs).toISOString(),
        },
      ];

      const { data: insertedMilestones, error: milError } = await supabase
        .from("payment_milestones")
        .insert(milestonePayloads)
        .select("id, title")
        .order("sequence_order", { ascending: true });

      if (milError || !insertedMilestones) {
        console.warn(
          "[seed] Non-fatal payment_milestones insert warning:",
          milError?.message
        );
        warnings.push(
          `Milestones seed skipped: ${milError?.message || "Unknown error"}`
        );
      } else if (insertedMilestones[0]) {
        firstMilestone = insertedMilestones[0];
        const { error: recError } = await supabase.from("payment_records").insert({
          milestone_id: firstMilestone.id,
          transaction_id: tx.id,
          payer_id: buyerId,
          paypal_order_id: demoOrderId,
          paypal_capture_id: demoCaptureId,
          amount: 360.0,
          currency,
          status: "COMPLETED",
          raw_response: {
            id: demoOrderId,
            status: "COMPLETED",
            demo_seed: true,
            capture_id: demoCaptureId,
            note: "Pre-seeded Milestone 1 Deposit receipt for hackathon walkthrough.",
          },
        });

        if (recError) {
          console.warn(
            "[seed] Non-fatal payment_records insert warning:",
            recError.message
          );
          warnings.push(`Payment record seed skipped: ${recError.message}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal milestone/payment seeding exception:", msg);
    warnings.push(`Payment seeding skipped: ${msg}`);
  }

  // 6. Append Evidence Vault genesis audit trail gracefully
  try {
    const pauseTick = () => new Promise((resolve) => setTimeout(resolve, 5));

    await logTransactionEvent(
      tx.id,
      "transaction_created",
      creatorId,
      {
        title: tx.title,
        totalAmount,
        currency,
        category: tx.category,
      },
      supabase
    );

    if (activeVersion) {
      await pauseTick();
      await logTransactionEvent(
        tx.id,
        "agreement_compiled",
        creatorId,
        {
          agreementVersionId: activeVersion.id,
          versionNumber: activeVersion.version_number,
          contentHash: activeHash,
        },
        supabase
      );
      await pauseTick();

      await logTransactionEvent(
        tx.id,
        "agreement_locked",
        buyerId,
        {
          agreementVersionId: activeVersion.id,
          versionNumber: activeVersion.version_number,
          contentHash: activeHash,
        },
        supabase
      );
    }

    if (firstMilestone) {
      await pauseTick();
      await logTransactionEvent(
        tx.id,
        "payment_captured",
        buyerId,
        {
          milestoneId: firstMilestone.id,
          milestoneTitle: firstMilestone.title,
          amount: 360.0,
          currency,
          paypalOrderId: demoOrderId,
          paypalCaptureId: demoCaptureId,
        },
        supabase
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[seed] Non-fatal transaction_events audit warning:", msg);
    warnings.push(`Ledger event seed skipped: ${msg}`);
  }

  return { transactionId: tx.id, inviteCode, warnings };
}
