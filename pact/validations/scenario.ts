import { z } from "zod";

export const generateScenariosSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const proposeResolutionSchema = z.object({
  scenarioId: z.string().uuid("Invalid scenario ID format"),
  transactionId: z.string().uuid("Invalid transaction ID format"),
  agreedAction: z
    .string()
    .min(3, "Action must be at least 3 characters long")
    .max(1000, "Action cannot exceed 1000 characters"),
  priceImpactType: z.enum(["none", "additional_cost", "discount", "refund"]),
  priceImpactValue: z.number().min(0, "Price impact cannot be negative").default(0),
  timelineImpactDays: z.number().int().default(0),
});

export const approveResolutionSchema = z.object({
  resolutionId: z.string().uuid("Invalid resolution ID format"),
  transactionId: z.string().uuid("Invalid transaction ID format"),
  approved: z.boolean(),
});

export type GenerateScenariosInput = z.infer<typeof generateScenariosSchema>;
export type ProposeResolutionInput = z.infer<typeof proposeResolutionSchema>;
export type ApproveResolutionInput = z.infer<typeof approveResolutionSchema>;

