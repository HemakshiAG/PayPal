/**
 * AI Services Domain Types
 * Enforces Non-Negotiable Rules:
 * - Rule 7: AI suggestions must never independently approve agreements, modify payment status, or declare a transaction legally valid.
 * - Rule 8: AI-extracted terms must retain their original message references and classification.
 */

import { ClauseClassification, SourceMessageReference } from "./agreement";

export interface ConversationMessage {
  id: string;
  senderId: string;
  senderRole: "buyer" | "seller";
  text: string;
  timestamp: string;
}

export interface ExtractedClauseSuggestion {
  classification: ClauseClassification;
  suggestedTitle: string;
  suggestedBody: string;
  sourceReference: SourceMessageReference;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
}

export interface AnticipatedComplication {
  id: string;
  category: "timeline_risk" | "scope_ambiguity" | "payment_mismatch" | "revision_dispute" | "delivery_condition";
  severity: "low" | "medium" | "high";
  description: string;
  preventativeRecommendation: string;
  relatedClauses: string[];
}

export interface AiStructuredExtractionResponse {
  extractedClauses: ExtractedClauseSuggestion[];
  anticipatedComplications: AnticipatedComplication[];
  disclaimer: "AI suggestions are advisory drafts for human mutual approval and do not constitute legal advice or formal execution.";
}

