-- ==============================================================================
-- PACT Migration: 20261111000004_payments.sql
-- PayPal Milestone Payment Integration & Verification Ledger
-- ==============================================================================

-- 1. Payment Milestones Table
create table if not exists public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  agreement_version_id uuid not null references public.agreement_versions(id) on delete cascade,
  title text not null,
  description text,
  amount numeric not null check (amount > 0),
  currency text not null default 'INR',
  sequence_order integer not null check (sequence_order >= 1),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'refunded', 'disputed')),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_milestone_sequence unique (transaction_id, agreement_version_id, sequence_order)
);

-- 2. Payment Records Table (PayPal Server Verification Ledger)
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.payment_milestones(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  payer_id uuid not null references public.profiles(id),
  paypal_order_id text unique not null,
  paypal_capture_id text unique,
  amount numeric not null check (amount > 0),
  currency text not null default 'INR',
  status text not null default 'CREATED',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for fast querying
create index if not exists idx_payment_milestones_tx_id on public.payment_milestones(transaction_id);
create index if not exists idx_payment_milestones_status on public.payment_milestones(status);
create index if not exists idx_payment_records_milestone_id on public.payment_records(milestone_id);
create index if not exists idx_payment_records_tx_id on public.payment_records(transaction_id);
create index if not exists idx_payment_records_order_id on public.payment_records(paypal_order_id);

-- Updated_at trigger for payment_milestones
create or replace trigger update_payment_milestones_updated_at
  before update on public.payment_milestones
  for each row execute function public.update_updated_at_column();

-- Enable Row Level Security (RLS)
alter table public.payment_milestones enable row level security;
alter table public.payment_records enable row level security;

-- RLS Policies for payment_milestones
create policy "Participants can read payment milestones"
  on public.payment_milestones for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = payment_milestones.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = payment_milestones.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert payment milestones"
  on public.payment_milestones for insert
  with check (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = payment_milestones.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = payment_milestones.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can update payment milestones"
  on public.payment_milestones for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = payment_milestones.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = payment_milestones.transaction_id
      and t.creator_id = auth.uid()
    )
  );

-- RLS Policies for payment_records
create policy "Participants can read payment records"
  on public.payment_records for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = payment_records.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = payment_records.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Authenticated payers can insert payment records"
  on public.payment_records for insert
  with check (
    payer_id = auth.uid()
    and (
      exists (
        select 1 from public.transaction_participants tp
        where tp.transaction_id = payment_records.transaction_id
        and tp.user_id = auth.uid()
      )
      or exists (
        select 1 from public.transactions t
        where t.id = payment_records.transaction_id
        and t.creator_id = auth.uid()
      )
    )
  );

create policy "Participants can update payment records"
  on public.payment_records for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = payment_records.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = payment_records.transaction_id
      and t.creator_id = auth.uid()
    )
  );

