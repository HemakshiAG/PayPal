/**
 * PACT Canonical Agreement Serialization & SHA-256 Hashing Engine
 * Phase 4: Grouped Agreement Builder & Immutable SHA-256 Versioning Engine
 *
 * NON-NEGOTIABLE RULE 9 & 10:
 * Guarantees bit-level agreement immutability. Every version is bound to a
 * deterministic 64-character SHA-256 hash.
 */

import crypto from "crypto";
import { AgreementSection } from "@/types/agreement";

/**
 * Recursively key-sorts objects and arrays to produce a deterministic canonical structure
 * unaffected by key insertion order or formatting variance.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(val as Record<string, unknown>).sort();
  for (const k of keys) {
    sorted[k] = canonicalizeValue((val as Record<string, unknown>)[k]);
  }
  return sorted;
}

/**
 * Computes a deterministic 64-character SHA-256 hexadecimal hash
 * of an agreement's grouped sections.
 */
export function computeCanonicalAgreementHash(sections: AgreementSection[]): string {
  const canonical = canonicalizeValue(sections);
  const canonicalString = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Verifies that the given sections evaluate to the expected cryptographic SHA-256 hash
 * using constant-time buffer comparison to prevent timing leaks.
 */
export function verifyAgreementIntegrity(
  sections: AgreementSection[],
  expectedHash: string
): boolean {
  if (!expectedHash || expectedHash.length !== 64) return false;
  const computed = computeCanonicalAgreementHash(sections);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    return false;
  }
}

