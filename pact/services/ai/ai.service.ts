/**
 * PACT AI Service Interface & Engine
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 7: AI suggestions must NEVER independently approve agreements, modify payment status, or declare a transaction legally valid.
 * - Rule 8: AI-extracted terms must retain their original message references and classification.
 */

import {
  AiStructuredExtractionResponse,
  ConversationMessage,
  AnticipatedComplication,
} from "@/types/ai";

export interface IAiService {
  extractTermsFromConversation(
    messages: ConversationMessage[]
  ): Promise<AiStructuredExtractionResponse>;

  anticipateComplications(
    clauses: Array<{ title: string; body: string; classification: string }>
  ): Promise<AnticipatedComplication[]>;
}

export class AiService implements IAiService {
  private readonly apiKey: string | undefined;
  private readonly modelName: string;

  constructor() {
    // Private environment variable accessed strictly server-side
    this.apiKey = process.env.AI_API_KEY;
    this.modelName = process.env.AI_MODEL || "gemini-2.5-pro";
  }

  /**
   * Extracts structured agreement clauses from chat conversation logs.
   * Every extracted clause retains full traceable citations to source message IDs.
   */
  async extractTermsFromConversation(
    messages: ConversationMessage[]
  ): Promise<AiStructuredExtractionResponse> {
    if (!messages || messages.length === 0) {
      return {
        extractedClauses: [],
        anticipatedComplications: [],
        disclaimer:
          "AI suggestions are advisory drafts for human mutual approval and do not constitute legal advice or formal execution.",
      };
    }

    if (!this.apiKey) {
      // In development baseline without AI key configured:
      // Return clear empty structured state with actionable diagnostic note
      return {
        extractedClauses: [],
        anticipatedComplications: [
          {
            id: "comp-setup-notice",
            category: "scope_ambiguity",
            severity: "low",
            description: "AI API credentials not configured in environment.",
            preventativeRecommendation: "Set AI_API_KEY in .env.local to enable real-time Gemini structured extraction.",
            relatedClauses: [],
          },
        ],
        disclaimer:
          "AI suggestions are advisory drafts for human mutual approval and do not constitute legal advice or formal execution.",
      };
    }

    // In subsequent phases, Google GenAI structured output calls will execute here.
    return {
      extractedClauses: [],
      anticipatedComplications: [],
      disclaimer:
        "AI suggestions are advisory drafts for human mutual approval and do not constitute legal advice or formal execution.",
    };
  }

  async anticipateComplications(
    _clauses: Array<{ title: string; body: string; classification: string }>
  ): Promise<AnticipatedComplication[]> {
    if (!_clauses || _clauses.length === 0) {
      return [];
    }
    return [];
  }
}

export const aiService = new AiService();
