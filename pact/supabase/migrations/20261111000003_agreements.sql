-- ==============================================================================
-- PACT Migration: 20261111000003_agreements.sql
-- Grouped Agreement Builder & Immutable SHA-256 Versioning Engine
-- ==============================================================================

-- 1. Agreement Versions Table
create table if not exists public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  content_hash text not null check (length(content_hash) = 64),
  title text not null default 'Commercial Agreement',
  sections jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint uq_transaction_version unique (transaction_id, version_number)
);

-- 2. Agreement Approvals Table
create table if not exists public.agreement_approvals (
  id uuid primary key default gen_random_uuid(),
  agreement_version_id uuid not null references public.agreement_versions(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('buyer', 'seller')),
  content_hash text not null check (length(content_hash) = 64),
  approved_at timestamptz not null default now(),
  constraint uq_version_user unique (agreement_version_id, user_id)
);

-- Indexes for performance
create index if not exists idx_agreement_versions_transaction_id on public.agreement_versions(transaction_id);
create index if not exists idx_agreement_versions_status on public.agreement_versions(status);
create index if not exists idx_agreement_approvals_version_id on public.agreement_approvals(agreement_version_id);
create index if not exists idx_agreement_approvals_transaction_id on public.agreement_approvals(transaction_id);

-- Enable Row Level Security (RLS)
alter table public.agreement_versions enable row level security;
alter table public.agreement_approvals enable row level security;

-- RLS Policies for agreement_versions
create policy "Participants can read agreement versions"
  on public.agreement_versions for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = agreement_versions.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = agreement_versions.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert agreement versions"
  on public.agreement_versions for insert
  with check (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = agreement_versions.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = agreement_versions.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can update agreement versions"
  on public.agreement_versions for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = agreement_versions.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = agreement_versions.transaction_id
      and t.creator_id = auth.uid()
    )
  );

-- RLS Policies for agreement_approvals
create policy "Participants can read agreement approvals"
  on public.agreement_approvals for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = agreement_approvals.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = agreement_approvals.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert agreement approvals"
  on public.agreement_approvals for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.transaction_participants tp
        where tp.transaction_id = agreement_approvals.transaction_id
        and tp.user_id = auth.uid()
      )
      or exists (
        select 1 from public.transactions t
        where t.id = agreement_approvals.transaction_id
        and t.creator_id = auth.uid()
      )
    )
  );

