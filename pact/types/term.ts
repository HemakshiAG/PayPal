/**
 * PACT Extracted Terms Domain Types
 * Phase 2: Native Conversation System & AI Term Extraction Engine
 */

export type TermCategory = "specification" | "financial" | "timeline" | "condition";

export type TermClassification =
  | "explicitly_agreed"
  | "inferred"
  | "ai_recommended"
  | "unresolved"
  | "disputed";

export type TermStatus = "pending" | "confirmed" | "rejected" | "revised";

export interface ExtractedTerm {
  id: string;
  transactionId: string;
  sourceMessageIds: string[];
  termKey: string;
  termValue: string;
  title?: string;
  name?: string;
  term_key?: string;
  term_value?: string;
  value?: string;
  details?: string;
  category: TermCategory;
  classification: TermClassification;
  confidenceScore: number;
  confidence_score?: number;
  confidence?: number;
  status: TermStatus;
  source_quote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedTermItemPayload {
  id?: string;
  termKey: string;
  termValue: string;
  title?: string;
  term_value?: string;
  category: TermCategory;
  classification: TermClassification;
  confidenceScore: number;
  confidence_score?: number;
  status?: "PENDING" | "REVISED" | TermStatus;
  source_quote?: string;
  sourceMessageIds: string[];
}

export interface ExtractionResult {
  transactionId: string;
  terms: ExtractedTermItemPayload[];
  summaryNote?: string;
}

