import { z } from "zod";

export const verifyIntegritySchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const appendEventSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  eventType: z.string().min(2, "Event type is required").max(80),
  eventPayload: z.record(z.string(), z.unknown()).default({}),
});

export const disputeQuerySchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const detectDriftSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  messageId: z.string().uuid("Invalid message ID format").optional(),
  content: z.string().min(1, "Message content is required").max(4000),
});

export const resolveDriftSchema = z.object({
  driftAlertId: z.string().uuid("Invalid drift alert ID format"),
  transactionId: z.string().uuid("Invalid transaction ID format"),
  action: z.enum(["amend", "dismiss"]),
});

export const passkeyRegisterSchema = z.object({
  credentialId: z.string().min(4, "Valid credential ID is required"),
  publicKey: z.string().min(8, "Public key material is required"),
  deviceLabel: z.string().max(120).optional(),
  isFallback: z.boolean().optional().default(false),
});

export const passkeyVerifySchema = z.object({
  action: z.enum(["register", "assert"]),
  transactionId: z.string().uuid("Invalid transaction ID format").optional(),
  agreementVersionId: z.string().uuid("Invalid agreement version ID").optional(),
  contentHash: z.string().length(64, "64-character SHA-256 content hash required").optional(),
  credentialId: z.string().min(4, "Credential ID is required"),
  publicKey: z.string().optional(),
  deviceLabel: z.string().max(120).optional(),
  isFallback: z.boolean().optional().default(false),
  challenge: z.string().min(8, "Cryptographic challenge is required"),
  clientDataJSON: z.string().optional(),
  authenticatorData: z.string().optional(),
  signature: z.string().min(8, "Assertion signature is required"),
  mode: z.enum(["webauthn_passkey", "device_fallback_signature"]).default("webauthn_passkey"),
});

export type VerifyIntegrityInput = z.infer<typeof verifyIntegritySchema>;
export type AppendEventInput = z.infer<typeof appendEventSchema>;
export type DisputeQueryInput = z.infer<typeof disputeQuerySchema>;
export type DetectDriftInput = z.infer<typeof detectDriftSchema>;
export type ResolveDriftInput = z.infer<typeof resolveDriftSchema>;
export type PasskeyVerifyInput = z.infer<typeof passkeyVerifySchema>;

