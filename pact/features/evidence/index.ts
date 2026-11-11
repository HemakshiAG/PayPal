/**
 * Feature Module: Evidence & Assurance
 * Responsible for cryptographic evidence hashing, timestamped storage references, and audit preservation.
 */

export interface EvidencePreservationRecord {
  fileHash: string;
  algorithm: "SHA-256";
  timestamp: string;
  storageKey: string;
}

