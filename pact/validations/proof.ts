import { z } from "zod";

export const VisualProofSpecCheckSchema = z.object({
  spec: z.string().trim().min(1).max(200),
  passed: z.boolean(),
  notes: z.string().trim().min(1).max(500),
});

export const VisualProofResponseSchema = z.object({
  isApproved: z.boolean(),
  matchConfidence: z.number().min(0).max(100),
  specChecklist: z.array(VisualProofSpecCheckSchema).min(1).max(12),
  summary: z.string().trim().min(1).max(1000),
});

export const VerifyProofJsonRequestSchema = z.object({
  transactionId: z.string().uuid(),
  milestoneId: z.string().uuid().optional().nullable(),
  imageBase64: z.string().min(10).optional(),
  imageDataUrl: z.string().min(10).optional(),
  mimeType: z.string().trim().min(3).max(100).optional(),
  fileName: z.string().trim().max(260).optional(),
  previewDataUrl: z.string().max(150_000).optional(),
  lockedContract: z.unknown().optional(),
});

export type ValidatedVisualProofResponse = z.infer<
  typeof VisualProofResponseSchema
>;

