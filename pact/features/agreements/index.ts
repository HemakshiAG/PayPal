/**
 * Feature Module: Agreements
 * Responsible for versioned agreement drafting, term classification, and mutual cryptographic approval workflows.
 */

export interface AgreementDraftState {
  title: string;
  description: string;
  version: number;
}

