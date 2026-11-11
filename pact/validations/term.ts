import { z } from "zod";

export const sendMessageSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID"),
  content: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(4000, "Message is too long (maximum 4000 characters)"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const confirmTermSchema = z.object({
  termId: z.string().uuid("Invalid term ID"),
  status: z.enum(["confirmed", "rejected"]),
});

export type ConfirmTermInput = z.infer<typeof confirmTermSchema>;

export const extractTermsSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID"),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        content: z.string().optional(),
        message_text: z.string().optional(),
        sender_id: z.string().optional(),
        role: z.string().optional(),
        created_at: z.string().optional(),
      })
    )
    .optional(),
});

export type ExtractTermsInput = z.infer<typeof extractTermsSchema>;

export const ExtractionItemSchema = z.object({
  id: z.string().optional(),
  termKey: z.string().min(1, "Term key is required"),
  termValue: z.string().min(1, "Term value is required"),
  title: z.string().optional(),
  term_value: z.string().optional(),
  category: z.enum(["specification", "financial", "timeline", "condition"]),
  classification: z.enum([
    "explicitly_agreed",
    "inferred",
    "ai_recommended",
    "unresolved",
    "disputed",
  ]),
  confidenceScore: z.number().min(0).max(1).default(0.85),
  confidence_score: z.number().min(0).max(100).optional(),
  status: z
    .enum(["PENDING", "REVISED", "pending", "confirmed", "rejected", "revised"])
    .optional(),
  source_quote: z.string().optional(),
  sourceMessageIds: z.array(z.string()).default([]),
});

export type ExtractionItem = z.infer<typeof ExtractionItemSchema>;

export const ExtractionResultSchema = z.object({
  terms: z.array(ExtractionItemSchema),
  summaryNote: z.string().optional(),
});

export type ExtractionResultPayload = z.infer<typeof ExtractionResultSchema>;
