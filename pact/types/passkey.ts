/**
 * PACT WebAuthn / Passkey Biometric Approval Types
 * Phase 6: Passkey Biometric Approval
 *
 * NON-NEGOTIABLE RULE 13:
 * Never store raw biometric information. Local authenticators match biometrics on-device;
 * servers handle only public keys, credential IDs, counters, and cryptographic assertions.
 */

export type PasskeyVerificationMode =
  | "webauthn_passkey"
  | "device_fallback_signature";

export interface PasskeyCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceLabel: string | null;
  isFallback: boolean;
  createdAt: string;
}

export interface PasskeyAssertionMetadata {
  verified: boolean;
  credentialId: string;
  mode: PasskeyVerificationMode;
  authenticatorTimestamp: string;
  signatureDigest: string;
  publicKeyHash?: string;
  signaturePayload?: string;
  signerName?: string;
  signerEmail?: string;
  deviceLabel?: string;
}

export interface PasskeyChallengeResponse {
  challenge: string;
  rpId: string;
  rpName: string;
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  registeredCredentials: Array<{
    credentialId: string;
    deviceLabel: string | null;
    isFallback: boolean;
  }>;
}

