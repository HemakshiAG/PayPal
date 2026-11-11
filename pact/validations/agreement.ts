import { z } from "zod";

export const compileAgreementSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
});

export const approveAgreementSchema = z.object({
  agreementVersionId: z.string().uuid("Invalid agreement version ID format"),
  contentHash: z
    .string()
    .length(64, "Content hash must be a 64-character SHA-256 hexadecimal string"),
  passkeyVerification: z
    .object({
      verified: z.boolean(),
      credentialId: z.string(),
      mode: z.enum(["webauthn_passkey", "device_fallback_signature"]),
      authenticatorTimestamp: z.string(),
      signatureDigest: z.string(),
      publicKeyHash: z.string().optional(),
      signaturePayload: z.string().optional(),
      signerName: z.string().optional(),
      signerEmail: z.string().optional(),
      deviceLabel: z.string().optional(),
    })
    .optional(),
});

export const compareVersionsSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  v1: z.number().int().positive("v1 must be a positive integer"),
  v2: z.number().int().positive("v2 must be a positive integer"),
});

export type CompileAgreementInput = z.infer<typeof compileAgreementSchema>;
export type ApproveAgreementInput = z.infer<typeof approveAgreementSchema>;
export type CompareVersionsInput = z.infer<typeof compareVersionsSchema>;

