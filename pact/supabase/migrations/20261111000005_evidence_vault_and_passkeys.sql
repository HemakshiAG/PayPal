-- ==============================================================================
-- PACT Migration: 20261111000005_evidence_vault_and_passkeys.sql
-- Passkey Biometric Approval, Hash-Chained Event Ledger & Agreement Drift Alerts
-- ==============================================================================

-- 1. WebAuthn Credentials Table (Non-Negotiable Rule 13: Public Key & Counter Only)
create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text unique not null,
  public_key text not null,
  counter integer not null default 0 check (counter >= 0),
  device_label text,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_webauthn_credentials_user_id
  on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

create policy "Users can read their own webauthn credentials"
  on public.webauthn_credentials for select
  using (user_id = auth.uid());

create policy "Users can register their own webauthn credentials"
  on public.webauthn_credentials for insert
  with check (user_id = auth.uid());

create policy "Users can update their own webauthn counter"
  on public.webauthn_credentials for update
  using (user_id = auth.uid());

create policy "Users can delete their own webauthn credentials"
  on public.webauthn_credentials for delete
  using (user_id = auth.uid());

-- 2. Tamper-Evident Hash-Chained Transaction Event Ledger
create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  event_type text not null,
  actor_id uuid not null references public.profiles(id),
  timestamp timestamptz not null default now(),
  event_payload jsonb not null default '{}'::jsonb,
  previous_event_hash text not null,
  event_hash text not null check (length(event_hash) = 64)
);

create index if not exists idx_transaction_events_tx_timestamp
  on public.transaction_events(transaction_id, timestamp asc, id asc);

alter table public.transaction_events enable row level security;

create policy "Participants can read transaction events"
  on public.transaction_events for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = transaction_events.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = transaction_events.transaction_id
      and t.creator_id = auth.uid()
    )
  );

-- Append-only ledger policy: only authenticated transaction participants can append events as themselves
create policy "Participants can append transaction events"
  on public.transaction_events for insert
  with check (
    actor_id = auth.uid()
    and (
      exists (
        select 1 from public.transaction_participants tp
        where tp.transaction_id = transaction_events.transaction_id
        and tp.user_id = auth.uid()
      )
      or exists (
        select 1 from public.transactions t
        where t.id = transaction_events.transaction_id
        and t.creator_id = auth.uid()
      )
    )
  );

-- 3. Agreement Drift Detection Alerts
create table if not exists public.drift_alerts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  active_version_id uuid not null references public.agreement_versions(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  term_key text not null,
  original_value text not null,
  proposed_value text not null,
  confidence_score numeric not null default 0.85 check (confidence_score >= 0 and confidence_score <= 1),
  status text not null default 'open' check (status in ('open', 'amended', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_drift_alerts_tx_id
  on public.drift_alerts(transaction_id, created_at desc);
create index if not exists idx_drift_alerts_status
  on public.drift_alerts(transaction_id, status);

alter table public.drift_alerts enable row level security;

create policy "Participants can read drift alerts"
  on public.drift_alerts for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = drift_alerts.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = drift_alerts.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert drift alerts"
  on public.drift_alerts for insert
  with check (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = drift_alerts.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = drift_alerts.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can update drift alerts"
  on public.drift_alerts for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = drift_alerts.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = drift_alerts.transaction_id
      and t.creator_id = auth.uid()
    )
  );

