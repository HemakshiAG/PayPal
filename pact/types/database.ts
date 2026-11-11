/**
 * PACT Database Schema TypeScript Definitions
 * Reflects supabase/migrations/20261111000000_init_schema.sql,
 * 20261111000001_extracted_terms.sql, 20261111000002_scenarios.sql,
 * and 20261111000003_agreements.sql
 */

import {
  ScenarioCategory,
  ScenarioSeverity,
  ScenarioStatus,
  PriceImpactType,
  ResolutionStatus,
  ConsequenceStep,
  RecommendedResolution,
} from "./scenario";
import { AgreementSection, AgreementStatus } from "./agreement";
import { MilestoneStatus } from "./payment";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TransactionStatus = "draft" | "active" | "locked" | "completed" | "disputed";
export type ProfileRole = "buyer" | "seller" | "both";
export type ParticipantRole = "buyer" | "seller";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: TransactionStatus;
  creator_id: string;
  invite_code: string;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionParticipantRow {
  id: string;
  transaction_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
}

export interface MessageRow {
  id: string;
  transaction_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface ExtractedTermRow {
  id: string;
  transaction_id: string;
  source_message_ids: string[];
  term_key: string;
  term_value: string;
  category: "specification" | "financial" | "timeline" | "condition";
  classification: "explicitly_agreed" | "inferred" | "ai_recommended" | "unresolved" | "disputed";
  confidence_score: number;
  status: "pending" | "confirmed" | "rejected" | "revised";
  created_at: string;
  updated_at: string;
}

export interface ScenarioRow {
  id: string;
  transaction_id: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  severity: ScenarioSeverity;
  consequence_chain: ConsequenceStep[] | Json;
  recommended_resolutions: RecommendedResolution[] | Json;
  status: ScenarioStatus;
  created_at: string;
  updated_at: string;
}

export interface ScenarioResolutionRow {
  id: string;
  scenario_id: string;
  transaction_id: string;
  proposed_by: string;
  agreed_action: string;
  price_impact_type: PriceImpactType;
  price_impact_value: number;
  timeline_impact_days: number;
  buyer_approved: boolean;
  seller_approved: boolean;
  buyer_approved_at: string | null;
  seller_approved_at: string | null;
  status: ResolutionStatus;
  created_at: string;
  updated_at: string;
}

export interface AgreementVersionRow {
  id: string;
  transaction_id: string;
  version_number: number;
  content_hash: string;
  title: string;
  sections: AgreementSection[] | Json;
  status: AgreementStatus;
  created_by: string;
  created_at: string;
}

export interface AgreementApprovalRow {
  id: string;
  agreement_version_id: string;
  transaction_id: string;
  user_id: string;
  role: "buyer" | "seller";
  content_hash: string;
  approved_at: string;
}

export interface PaymentMilestoneRow {
  id: string;
  transaction_id: string;
  agreement_version_id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  sequence_order: number;
  status: MilestoneStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecordRow {
  id: string;
  milestone_id: string;
  transaction_id: string;
  payer_id: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  amount: number;
  currency: string;
  status: string;
  raw_response: Record<string, unknown> | Json;
  created_at: string;
}

export interface WebAuthnCredentialRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_label: string | null;
  is_fallback: boolean;
  created_at: string;
}

export interface TransactionEventRow {
  id: string;
  transaction_id: string;
  event_type: string;
  actor_id: string;
  timestamp: string;
  event_payload: Record<string, unknown> | Json;
  previous_event_hash: string;
  event_hash: string;
}

export interface DriftAlertRow {
  id: string;
  transaction_id: string;
  active_version_id: string;
  source_message_id: string | null;
  term_key: string;
  original_value: string;
  proposed_value: string;
  confidence_score: number;
  status: "open" | "amended" | "dismissed";
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
      };
      transactions: {
        Row: TransactionRow;
        Insert: Omit<TransactionRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<TransactionRow>;
      };
      transaction_participants: {
        Row: TransactionParticipantRow;
        Insert: Omit<TransactionParticipantRow, "id" | "joined_at"> & {
          id?: string;
          joined_at?: string;
        };
        Update: Partial<TransactionParticipantRow>;
      };
      messages: {
        Row: MessageRow;
        Insert: Omit<MessageRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<MessageRow>;
      };
      extracted_terms: {
        Row: ExtractedTermRow;
        Insert: Omit<ExtractedTermRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ExtractedTermRow>;
      };
      scenarios: {
        Row: ScenarioRow;
        Insert: Omit<ScenarioRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ScenarioRow>;
      };
      scenario_resolutions: {
        Row: ScenarioResolutionRow;
        Insert: Omit<ScenarioResolutionRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ScenarioResolutionRow>;
      };
      agreement_versions: {
        Row: AgreementVersionRow;
        Insert: Omit<AgreementVersionRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<AgreementVersionRow>;
      };
      agreement_approvals: {
        Row: AgreementApprovalRow;
        Insert: Omit<AgreementApprovalRow, "id" | "approved_at"> & {
          id?: string;
          approved_at?: string;
        };
        Update: Partial<AgreementApprovalRow>;
      };
      payment_milestones: {
        Row: PaymentMilestoneRow;
        Insert: Omit<PaymentMilestoneRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PaymentMilestoneRow>;
      };
      payment_records: {
        Row: PaymentRecordRow;
        Insert: Omit<PaymentRecordRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<PaymentRecordRow>;
      };
      webauthn_credentials: {
        Row: WebAuthnCredentialRow;
        Insert: Omit<WebAuthnCredentialRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<WebAuthnCredentialRow>;
      };
      transaction_events: {
        Row: TransactionEventRow;
        Insert: Omit<TransactionEventRow, "id"> & {
          id?: string;
        };
        Update: never;
      };
      drift_alerts: {
        Row: DriftAlertRow;
        Insert: Omit<DriftAlertRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<DriftAlertRow>;
      };
    };
  };
}
