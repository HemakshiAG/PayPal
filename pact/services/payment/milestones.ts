/**
 * PACT Agreement-to-Milestone Schedule Synchronizer
 * Phase 5: PayPal Milestone Payment Integration
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { AgreementSection } from "@/types/agreement";

export interface SyncMilestoneSpec {
  title: string;
  description: string;
  amount: number;
  sequenceOrder: number;
  dueDate: string;
}

/**
 * Generates staged milestone specs from total transaction amount and active agreement sections.
 */
export function buildMilestoneScheduleFromAgreement(
  totalAmount: number,
  currency: string,
  sections: AgreementSection[]
): SyncMilestoneSpec[] {
  // Attempt to derive total from financial section if transaction totalAmount is 0
  let effectiveTotal = totalAmount;
  if (effectiveTotal <= 0) {
    const finSec = sections.find((s) => s.sectionId === "financial_milestones");
    if (finSec) {
      for (const item of finSec.items) {
        const match = item.content.match(/[\d,]+(?:\.\d{2})?/);
        if (match) {
          const parsed = parseFloat(match[0].replace(/,/g, ""));
          if (!isNaN(parsed) && parsed > 0) {
            effectiveTotal = parsed;
            break;
          }
        }
      }
    }
  }

  // Ensure positive minimum for valid milestone creation
  if (effectiveTotal <= 0) {
    effectiveTotal = currency === "INR" ? 3000 : 100;
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Calculate clean rounded splits summing exactly to effectiveTotal
  const m1Amount = Math.round(effectiveTotal * 0.3 * 100) / 100;
  const m2Amount = Math.round(effectiveTotal * 0.4 * 100) / 100;
  const m3Amount = Math.round((effectiveTotal - m1Amount - m2Amount) * 100) / 100;

  return [
    {
      title: "Milestone 1: Initial Deposit & Material Procurement",
      description:
        "30% initial disbursement authorizing project kick-off and procurement of bespoke materials.",
      amount: m1Amount,
      sequenceOrder: 1,
      dueDate: new Date(now + 2 * dayMs).toISOString(),
    },
    {
      title: "Milestone 2: Production Progress & Midpoint Verification",
      description:
        "40% progress disbursement upon seller submitting mid-production photo/draft proof to Evidence Vault.",
      amount: m2Amount,
      sequenceOrder: 2,
      dueDate: new Date(now + 7 * dayMs).toISOString(),
    },
    {
      title: "Milestone 3: Final Deliverable & Inspection Acceptance",
      description:
        "Remaining 30% final balance released after buyer verification within the 48-hour inspection window.",
      amount: m3Amount,
      sequenceOrder: 3,
      dueDate: new Date(now + 14 * dayMs).toISOString(),
    },
  ];
}

/**
 * Ensures payment_milestones exist in Supabase for the active agreement version.
 */
export async function syncMilestonesForActiveAgreement(
  supabase: SupabaseClient,
  transactionId: string,
  agreementVersionId: string,
  totalAmount: number,
  currency: string,
  sections: AgreementSection[]
) {
  // Check if milestones already exist for this agreement version
  const { data: existing } = await supabase
    .from("payment_milestones")
    .select("*")
    .eq("transaction_id", transactionId)
    .eq("agreement_version_id", agreementVersionId)
    .order("sequence_order", { ascending: true });

  if (existing && existing.length > 0) {
    return existing;
  }

  const specs = buildMilestoneScheduleFromAgreement(totalAmount, currency, sections);

  const toInsert = specs.map((spec) => ({
    transaction_id: transactionId,
    agreement_version_id: agreementVersionId,
    title: spec.title,
    description: spec.description,
    amount: spec.amount,
    currency: currency || "INR",
    sequence_order: spec.sequenceOrder,
    status: "pending",
    due_date: spec.dueDate,
  }));

  const { data: inserted, error } = await supabase
    .from("payment_milestones")
    .insert(toInsert)
    .select()
    .order("sequence_order", { ascending: true });

  if (error) {
    console.error("Failed to sync payment milestones:", error);
    return [];
  }

  return inserted || [];
}

