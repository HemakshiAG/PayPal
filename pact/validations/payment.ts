import { z } from "zod";

export const createOrderSchema = z.object({
  milestoneId: z.string().uuid("Invalid milestone ID format"),
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const captureOrderSchema = z.object({
  orderId: z.string().min(3, "Valid PayPal order ID is required"),
  milestoneId: z.string().uuid("Invalid milestone ID format"),
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const syncMilestonesSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const createMilestoneSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  agreementVersionId: z.string().uuid("Invalid agreement version ID format"),
  title: z.string().min(2, "Title must be at least 2 characters").max(120),
  description: z.string().max(500).optional(),
  amount: z.number().positive("Amount must be greater than zero"),
  currency: z.string().length(3, "3-letter ISO currency code required"),
  dueDate: z.string().optional(),
});

export const refundPaymentSchema = z.object({
  captureId: z.string().min(3, "Valid PayPal capture ID is required").max(120),
  refundAmount: z.number().positive("Refund amount must be greater than zero"),
  reason: z.string().trim().min(3, "Refund reason is required").max(500),
  transactionId: z.string().uuid("Invalid transaction ID format").optional(),
  paymentRecordId: z.string().uuid("Invalid payment record ID format").optional(),
  currency: z.string().length(3).optional(),
  aiMediation: z
    .object({
      headline: z.string().max(240).optional(),
      deficitPercent: z.number().min(0).max(100).optional(),
      rationale: z.string().max(2000).optional(),
      claimNotes: z.string().max(1500).optional(),
      provider: z.string().max(80).optional(),
    })
    .optional(),
});

export const createInvoiceSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  agreementVersionId: z.string().uuid("Invalid agreement version ID format").optional(),
});

export const sellerPayoutSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  milestoneId: z.string().uuid("Invalid milestone ID format").optional(),
  captureId: z.string().min(3, "Invalid PayPal capture ID").max(120).optional(),
  recipientEmail: z.string().email("Invalid PayPal seller email").optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CaptureOrderInput = z.infer<typeof captureOrderSchema>;
export type SyncMilestonesInput = z.infer<typeof syncMilestonesSchema>;
export type CreatePaymentMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type SellerPayoutInput = z.infer<typeof sellerPayoutSchema>;
