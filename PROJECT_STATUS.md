# PACT — Project Status

**Platform:** PACT (Predict. Agree. Protect.) — AI-Powered Transaction Assurance for Custom Commerce  
**Last Updated:** Phase 6 Completion  
**Current Phase:** Phase 6 Complete (Passkey Biometric Approval, Tamper-Evident Evidence Vault, Drift Detection & Dispute Intelligence)  
**Next Phase:** Core Platform Complete — Post-Core Hardening (Storage Attachments & Async PayPal Webhooks)

---

## 1. Completed Features

### Phase 0: Project Scaffolding & Foundation
- [x] Next.js 16 App Router, React 19, TypeScript strict mode.
- [x] Atomic UI design system with Tailwind CSS tokens (Button, Card, Input, Badge, Dialog).
- [x] Zero-dependency styling helpers (`cn`), domain constants, and `/api/health` route.
- [x] Architectural documentation and baseline configuration.

### Phase 1: Core Infrastructure, Database Schema & RLS, Auth, Workspace Shell
- [x] **PostCSS & Theme Tokens Fix:** Standardized theme tokens in `app/globals.css`.
- [x] **Supabase Client Infrastructure:** Configured browser, server, and middleware clients.
- [x] **PostgreSQL Database Migration (`20261111000000_init_schema.sql`):** `profiles`, `transactions`, `transaction_participants`, `messages`, with participant RLS.
- [x] **Authentication Flow:** Server Actions in `app/actions/auth.ts`, login and signup pages.
- [x] **Dashboard & Transaction Creation:** Transaction Hub (`/dashboard`), Create form (`/transactions/create`), Join modal (`/transactions/join`).
- [x] **Transaction Workspace Shell:** 5-pillar workspace header and navigation tabs.

### Phase 2: Native Conversation System & AI Term Extraction Engine
- [x] **PostgreSQL Database Migration (`20261111000001_extracted_terms.sql`):** `extracted_terms` table with source message citations and participant RLS.
- [x] **AI Term Extraction Engine (`services/ai/extraction.ts`):** Gemini 2.5 Flash structured output and offline heuristic fallback distinguishing explicit facts from conditional promises.
- [x] **API Route Handlers:** `/api/messages/send`, `/api/ai/extract-terms`, `/api/terms/confirm`.
- [x] **Workspace Components:** `ConversationTab.tsx`, `ExtractedTermsPanel.tsx`.

### Phase 3: Predictive Scenario Engine & Mutual Contingency Resolution System
- [x] **PostgreSQL Database Migration (`20261111000002_scenarios.sql`):** `scenarios` and `scenario_resolutions` tables with participant RLS.
- [x] **Scenario Coverage Score Engine (`lib/scenarios/coverage.ts`):** 0-100% coverage metric, category breakdowns, and readiness tags (`vulnerable`, `moderate`, `resilient`).
- [x] **Predictive AI Engine & Generator API (`services/ai/scenarios.ts` & `/api/ai/generate-scenarios`):** Context-aware multi-step causal consequence chains with custom commerce fallbacks.
- [x] **Contingency Negotiation API (`/api/scenarios/resolve`):** Dual approval state machine for preset/custom contingency protocols with price and timeline adjustments.
- [x] **Workspace UI Components:** `ScenariosTab.tsx`, `ScenarioCard.tsx`, `ScenarioResolutionModal.tsx`.

### Phase 4: Grouped Agreement Builder & Immutable SHA-256 Versioning Engine
- [x] **PostgreSQL Database Migration (`20261111000003_agreements.sql`):**
  - `agreement_versions` table: `id`, `transaction_id`, `version_number`, `content_hash` (64-char hex), `title`, `sections` (JSONB array of 13 contract sections), `status` (`draft`, `active`, `superseded`, `cancelled`), `created_by`, `created_at`. Unique constraint on `(transaction_id, version_number)`.
  - `agreement_approvals` table: `id`, `agreement_version_id`, `transaction_id`, `user_id`, `role`, `content_hash`, `approved_at`. Unique constraint on `(agreement_version_id, user_id)`.
  - Strict Row Level Security (RLS) restricting reads and inserts to verified transaction participants.
- [x] **Canonical Serialization & SHA-256 Hashing Engine (`lib/agreement/hash.ts`):**
  - `computeCanonicalAgreementHash`: Recursively key-sorted JSON canonical serialization with SHA-256 digest calculation.
  - `verifyAgreementIntegrity`: Constant-time buffer verification (`crypto.timingSafeEqual`) preventing timing attacks.
- [x] **13-Section Contract Compiler Service (`services/agreement/builder.ts`):**
  - Synthesizes confirmed Phase 2 terms and resolved Phase 3 contingencies into the 13 standard PACT contract sections:
    1. Scope of Work & Deliverables
    2. Technical & Material Standards
    3. Financial Terms & Milestone Schedule
    4. Delivery Schedule & Deadlines
    5. Inspection & Acceptance Testing (48h window + Evidence Vault)
    6. Contingency Protocol: Timeline Delays
    7. Contingency Protocol: Material Stockouts
    8. Contingency Protocol: Scope & Revisions
    9. Contingency Protocol: Quality & Finish Variances
    10. Cancellation & Mutual Settlement
    11. Intellectual Property & Commercial Rights
    12. Warranties & Representation
    13. Milestone Disbursement & Statutory Non-Escrow Compliance Notice (Rule 12)
  - Non-Negotiable Rule 9: Every amendment automatically increments `version_number` ($V_1 \rightarrow V_2$), superseding the prior version.
- [x] **Mutual Approval Engine (`/api/agreements/approve/route.ts`):**
  - Verifies submitted `content_hash` against the database canonical hash.
  - Inserts approval row into `agreement_approvals`.
  - Non-Negotiable Rule 10: When both Buyer and Seller have approved the identical version hash, `agreement_versions.status` transitions to `active` and `transactions.status` transitions to `locked`.
- [x] **Agreement Compilation API (`/api/agreements/compile/route.ts`):**
  - Orchestrates agreement building, hash calculation, and version incrementing on amendment.
- [x] **Agreement Workspace UI (`components/workspace/`):**
  - `AgreementTab.tsx`: Active version pill, canonical hash display with one-click copy, dual buyer/seller approval cards, version history selector, and view mode toggle.
  - `AgreementViewer.tsx`: Expandable 13-section accordion with provenance badges (`Confirmed Term`, `Agreed Contingency`, `Standard Provision`) and origin citations.
  - `VersionDiffViewer.tsx`: Side-by-side and inline diff visualizer highlighting added (green), modified (yellow), and unchanged text across versions.
  - Integrated into `WorkspaceTabs.tsx` and hydrated server-side in `app/(dashboard)/transactions/[id]/page.tsx`.

### Phase 5: PayPal Milestone Payment Integration
- [x] **PostgreSQL Database Migration (`20261111000004_payments.sql`):**
  - `payment_milestones`: staged milestone records linked to `agreement_versions` (`status`: `pending | processing | paid | refunded | disputed`) with unique sequence ordering, updated_at trigger, and participant RLS.
  - `payment_records`: server verification ledger storing `paypal_order_id`, `paypal_capture_id`, `raw_response` JSONB, and `status`, restricted via participant RLS.
- [x] **PayPal Developer Sandbox Client & Dev Simulation Fallback (`lib/paypal/client.ts`):**
  - Server-only OAuth2 token acquisition (`getPayPalAccessToken`), Checkout Order creation (`createPayPalSandboxOrder` -> `/v2/checkout/orders`), and server-side Order Capture verification (`capturePayPalSandboxOrder` -> `/v2/checkout/orders/{id}/capture`), with an explicitly labeled dev Sandbox Simulation Mode (`SIM-ORD-*` / `SIM-CAP-*`) when API credentials are omitted or placeholders (Rule 3, Rule 4, Rule 11).
- [x] **Milestone Schedule Sync Service (`services/payment/milestones.ts`):**
  - `buildMilestoneScheduleFromAgreement` & `syncMilestonesForActiveAgreement` compiling a 3-milestone disbursement schedule (30% Initial Deposit, 40% Production Progress, 30% Final Deliverable) automatically upon mutual agreement lock (`/api/agreements/approve`) or via manual sync (`/api/payments/sync-milestones`).
- [x] **PayPal Payment API Route Handlers (`app/api/payments/`):**
  - `/api/payments/sync-milestones`: Validates participant access and seeds staged milestones for the active agreement version.
  - `/api/payments/create-order`: Enforces buyer-only permission and active agreement status before creating the PayPal order and recording `payment_records` + `processing` milestone state.
  - `/api/payments/capture-order`: Executes server-side PayPal capture verification (`status === "COMPLETED"`), updates `payment_records.paypal_capture_id` and `payment_milestones.status = "paid"`, and transitions `transactions.status = "completed"` when all milestones are paid.
- [x] **Payments Workspace UI (`components/workspace/`):**
  - `PayPalCheckoutButton.tsx`: Dynamically loads the PayPal JS SDK Smart Buttons when `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is configured, or presents a clearly labeled Sandbox Simulation checkout button in local development.
  - `MilestoneCard.tsx` & `PaymentsTab.tsx`: Displays financial summary metrics, disbursement progress bar, Rule 12 non-escrow statutory notice, milestone action cards, and the PayPal transaction verification ledger integrated in `WorkspaceTabs.tsx` and hydrated in `app/(dashboard)/transactions/[id]/page.tsx`.

### Phase 6: Passkey Biometric Approval, Evidence Vault, Drift Detection & Dispute Intelligence
- [x] **PostgreSQL Database Migration (`20261111000005_evidence_vault_and_passkeys.sql`):**
  - `webauthn_credentials`: public keys, credential IDs, and monotonic authenticator counters restricted by owner RLS (`user_id = auth.uid()`, Rule 13: zero raw biometrics stored).
  - `transaction_events`: append-only hash-chained ledger table linking `previous_event_hash` -> `event_hash` (64-char SHA-256) with strict participant RLS.
  - `drift_alerts`: off-contract modification alerts linked to `active_version_id` and `source_message_id` (`status`: `open | amended | dismissed`) with participant RLS.
- [x] **Hash-Chained Event Ledger Engine (`lib/ledger/events.ts` & `/api/vault/verify-integrity`):**
  - `logTransactionEvent` & `verifyLedgerIntegrity` using canonical payload serialization (`canonicalizeValue`), normalized UTC ISO timestamps, `GENESIS_HASH` genesis anchoring, and constant-time digest verification (`crypto.timingSafeEqual`).
  - Automatically logs lifecycle actions in `/api/terms/confirm`, `/api/scenarios/resolve`, `/api/agreements/compile`, `/api/agreements/approve`, `/api/payments/capture-order`, `/api/auth/passkey`, and `/api/ai/detect-drift`.
- [x] **WebAuthn / Passkey Biometric Approval (`lib/auth/passkeys.ts`, `/api/auth/passkey`, `PasskeySignButton.tsx`):**
  - Supports WebAuthn platform authenticators (`navigator.credentials.create` / `navigator.credentials.get`) alongside an explicit WebCrypto ECDSA (P-256) local fallback device keypair for browsers without hardware authenticators.
  - Integrated into `AgreementTab.tsx` Buyer and Seller signing cards and persisted in ledger verification metadata via `/api/agreements/approve`.
- [x] **Agreement Drift Detection Engine (`services/ai/drift.ts` & `/api/ai/detect-drift`):**
  - Analyzes newly sent messages in `/api/messages/send` against locked `active` agreement versions ($V_n$) using Gemini 2.5 Flash or deterministic heuristic analysis.
  - Renders a floating **Drift Alert Banner** in `WorkspaceTabs.tsx` offering one-click **"Create Amendment Version ($V_{n+1}$)"** (`PATCH /api/ai/detect-drift`) or alert dismissal.
- [x] **Evidence Vault & Dispute Reconstruction (`VaultTab.tsx`, `DisputeModal.tsx`, `app/(dashboard)/transactions/[id]/page.tsx`):**
  - Replaces the Pillar 5 shell with live integrity status header, chronological event timeline, `"Verify Ledger Integrity"`, `"Export Proof of Agreement Package"` (`.json` audit bundle), and neutral `DisputeModal` reconstruction view.

---

## 2. Pending Features (Post-Core Hardening / Optional)

- [ ] **Optional Post-Core Hardening:**
  - Server-to-server PayPal async Webhook endpoint with HMAC header verification (`PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-ID`).
  - Binary deliverable attachment uploads to Supabase Storage (`evidence_records` file objects) and printable PDF export of Proof of Agreement certificates.

---

## 3. Known Bugs & Technical Debt

- *None.* `npx tsc --noEmit` passes with 0 errors. `npm run lint` passes with 0 errors and 0 warnings. `npm run build` compiles successfully with 0 errors across all 22 route entries (23/23 static/route build tasks).

---

## 4. Next Phase

**Core Architecture Complete (Phases 0–6)**
- Run end-to-end verification against a live Supabase project (apply migrations `000000` through `000005` in order) and test Buyer/Seller negotiation, Passkey signing, Drift amendments, PayPal Sandbox captures, and Evidence Vault verification.
