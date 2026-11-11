-- ==============================================================================
-- PACT Migration: 20261111000002_scenarios.sql
-- Predictive Scenario Engine & Mutual Contingency Resolution System
-- ==============================================================================

-- 1. Scenarios Table
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category text not null check (category in ('timeline_delay', 'scope_dispute', 'material_shortage', 'quality_rejection', 'cost_escalation', 'cancellation')),
  title text not null,
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  consequence_chain jsonb not null default '[]'::jsonb,
  recommended_resolutions jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolving', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Scenario Resolutions Table
create table if not exists public.scenario_resolutions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  agreed_action text not null,
  price_impact_type text not null default 'none' check (price_impact_type in ('none', 'additional_cost', 'discount', 'refund')),
  price_impact_value numeric not null default 0.00 check (price_impact_value >= 0),
  timeline_impact_days integer not null default 0,
  buyer_approved boolean not null default false,
  seller_approved boolean not null default false,
  buyer_approved_at timestamptz,
  seller_approved_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient lookups
create index if not exists idx_scenarios_transaction_id on public.scenarios(transaction_id);
create index if not exists idx_scenarios_status on public.scenarios(status);
create index if not exists idx_scenario_resolutions_scenario_id on public.scenario_resolutions(scenario_id);
create index if not exists idx_scenario_resolutions_transaction_id on public.scenario_resolutions(transaction_id);

-- Updated_at triggers
create or replace trigger update_scenarios_updated_at
  before update on public.scenarios
  for each row execute function public.update_updated_at_column();

create or replace trigger update_scenario_resolutions_updated_at
  before update on public.scenario_resolutions
  for each row execute function public.update_updated_at_column();

-- Enable Row Level Security (RLS)
alter table public.scenarios enable row level security;
alter table public.scenario_resolutions enable row level security;

-- RLS Policies for scenarios: strictly accessible to transaction participants
create policy "Participants can read scenarios"
  on public.scenarios for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = scenarios.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = scenarios.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert scenarios"
  on public.scenarios for insert
  with check (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = scenarios.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = scenarios.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can update scenarios"
  on public.scenarios for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = scenarios.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = scenarios.transaction_id
      and t.creator_id = auth.uid()
    )
  );

-- RLS Policies for scenario_resolutions
create policy "Participants can read scenario resolutions"
  on public.scenario_resolutions for select
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = scenario_resolutions.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = scenario_resolutions.transaction_id
      and t.creator_id = auth.uid()
    )
  );

create policy "Participants can insert scenario resolutions"
  on public.scenario_resolutions for insert
  with check (
    proposed_by = auth.uid()
    and (
      exists (
        select 1 from public.transaction_participants tp
        where tp.transaction_id = scenario_resolutions.transaction_id
        and tp.user_id = auth.uid()
      )
      or exists (
        select 1 from public.transactions t
        where t.id = scenario_resolutions.transaction_id
        and t.creator_id = auth.uid()
      )
    )
  );

create policy "Participants can update scenario resolutions"
  on public.scenario_resolutions for update
  using (
    exists (
      select 1 from public.transaction_participants tp
      where tp.transaction_id = scenario_resolutions.transaction_id
      and tp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.transactions t
      where t.id = scenario_resolutions.transaction_id
      and t.creator_id = auth.uid()
    )
  );

