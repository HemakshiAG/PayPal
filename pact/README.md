# PACT

**Predict. Agree. Protect.**

PACT is an AI-powered transaction assurance platform for custom commerce. It turns conversational negotiations into traceable agreements, anticipates contingencies, coordinates milestone payments, and preserves an auditable record for dispute resolution.

## What it provides

- **Conversation and term extraction** — captures messages and identifies explicit, source-cited terms with Gemini or a deterministic fallback.
- **Predictive scenarios** — models consequences such as delays, stockouts, revisions, and quality variances, then records mutually approved contingencies.
- **Immutable agreements** — compiles confirmed terms into a 13-section agreement with canonical SHA-256 version hashes and dual buyer/seller approval.
- **Milestone payments** — creates and verifies PayPal Sandbox orders against a three-stage schedule: 30% initial deposit, 40% production progress, and 30% final deliverable.
- **Passkey approval and evidence vault** — supports WebAuthn or a WebCrypto fallback, hash-chains transaction events, detects agreement drift, and exports proof bundles.

PACT payments are milestone disbursements and are **not legal escrow**.

## Technology

- Next.js 16 App Router
- React 19 and TypeScript in strict mode
- Tailwind CSS 4
- Supabase PostgreSQL, Auth, Realtime, Storage, and Row Level Security
- Google Gemini for structured extraction, scenario generation, and drift detection
- PayPal Developer Sandbox
- WebAuthn/passkeys with a WebCrypto fallback

## Getting started

### Prerequisites

- Node.js and npm
- A Supabase project
- Optional Gemini and PayPal Sandbox credentials

### Install and configure

```bash
npm install
cp .env.example .env.local
```

Update `.env.local` with the Supabase values and any AI, PayPal, or WebAuthn settings required for your environment. Keep server-only secrets, including `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`, and `AI_API_KEY`, out of client-side code and source control.

Apply the migrations in `supabase/migrations/` in filename order to the target Supabase project.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

When PayPal credentials are not configured, local development uses the explicitly labeled Sandbox Simulation Mode. This is not a replacement for server-side PayPal verification.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |

## Project structure

```text
app/                 Routes, pages, server actions, and API handlers
components/          Workspace and reusable UI components
lib/                 Shared domain, hashing, ledger, auth, and payment utilities
services/             AI, agreement, and payment domain services
supabase/migrations/ Database schema and Row Level Security policies
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the system design and [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the current implementation status.

## Current status

Phases 0–6 are complete. The core architecture is ready for end-to-end verification against a live Supabase project, including Buyer/Seller negotiation, passkey signing, drift amendments, PayPal Sandbox captures, and Evidence Vault integrity checks.

Remaining post-core hardening includes:

- PayPal asynchronous webhook handling with HMAC verification
- Supabase Storage uploads for binary deliverables
- Printable PDF export of Proof of Agreement certificates

## Security notes

- Database access is protected by participant-scoped Row Level Security.
- Agreement versions are immutable; amendments create a new version.
- Only public passkey keys and authenticator counters are stored; raw biometric data is never stored.
- Payment state is advanced only after server-side PayPal verification.
- Never commit `.env.local` or real credentials.
