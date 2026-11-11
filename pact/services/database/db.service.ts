/**
 * PACT Database Service
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 4: Never expose service-role credentials or private environment variables in frontend code.
 * - Rule 6: Enforce buyer/seller permissions on the server and in database policies.
 * - Rule 9: Every agreement modification creates a new version. Never silently overwrite an approved version.
 * - Rule 10: Both parties must approve the same exact agreement version before it becomes active.
 */

import { AgreementVersion, AgreementApprovalRecord } from "@/types/agreement";
import { Milestone } from "@/types/milestone";
import { TransactionSummary } from "@/types/transaction";
import { createClient } from "@/lib/supabase/server";

export interface IDatabaseService {
  getTransactionById(transactionId: string): Promise<TransactionSummary | null>;
  getAgreementVersions(transactionId: string): Promise<AgreementVersion[]>;
  createAgreementVersion(
    transactionId: string,
    versionData: Omit<AgreementVersion, "id" | "createdAt" | "isMutuallyApproved">
  ): Promise<AgreementVersion>;
  recordAgreementApproval(
    agreementVersionId: string,
    approval: AgreementApprovalRecord
  ): Promise<AgreementVersion>;
  getMilestones(transactionId: string): Promise<Milestone[]>;
}

export class DatabaseService implements IDatabaseService {
  isConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  async getTransactionById(transactionId: string): Promise<TransactionSummary | null> {
    if (!this.isConfigured()) return null;

    try {
      const supabase = await createClient();
      const { data: tx, error } = await supabase
        .from("transactions")
        .select(`
          id,
          title,
          status,
          currency,
          total_amount,
          created_at,
          updated_at
        `)
        .eq("id", transactionId)
        .single();

      if (error || !tx) return null;

      // Fetch participants
      const { data: participants } = await supabase
        .from("transaction_participants")
        .select(`
          user_id,
          role,
          profiles (id, email, full_name, role, avatar_url, created_at, updated_at)
        `)
        .eq("transaction_id", transactionId);

      const buyerPart = participants?.find((p) => p.role === "buyer");
      const sellerPart = participants?.find((p) => p.role === "seller");

      const defaultBuyer = {
        id: buyerPart?.user_id || "pending",
        email: "",
        fullName: "Pending Buyer",
        role: "buyer" as const,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
      };

      const defaultSeller = {
        id: sellerPart?.user_id || "pending",
        email: "",
        fullName: "Pending Seller",
        role: "seller" as const,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
      };

      return {
        id: tx.id,
        title: tx.title,
        status: tx.status as TransactionSummary["status"],
        buyer: defaultBuyer,
        seller: defaultSeller,
        latestAgreementVersionNumber: 1,
        milestones: [],
        totalValue: Number(tx.total_amount) || 0,
        currency: tx.currency || "INR",
        evidenceCount: 0,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
      };
    } catch {
      return null;
    }
  }

  async getAgreementVersions(_transactionId: string): Promise<AgreementVersion[]> {
    if (!this.isConfigured()) return [];
    return [];
  }

  async createAgreementVersion(
    _transactionId: string,
    _versionData: Omit<AgreementVersion, "id" | "createdAt" | "isMutuallyApproved">
  ): Promise<AgreementVersion> {
    if (!this.isConfigured()) {
      throw new Error("Supabase is not configured.");
    }
    throw new Error("createAgreementVersion is scheduled for Phase 3 (Agreement Versioning).");
  }

  async recordAgreementApproval(
    _agreementVersionId: string,
    _approval: AgreementApprovalRecord
  ): Promise<AgreementVersion> {
    if (!this.isConfigured()) {
      throw new Error("Supabase is not configured.");
    }
    throw new Error("recordAgreementApproval is scheduled for Phase 3 (Mutual Approval).");
  }

  async getMilestones(_transactionId: string): Promise<Milestone[]> {
    if (!this.isConfigured()) return [];
    return [];
  }
}

export const dbService = new DatabaseService();
