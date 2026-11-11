-- ==============================================================================
-- PACT (Predict. Agree. Protect.) Consolidated Database Schema & RLS Policies
-- Generated from: supabase/migrations/20261111000000 .. 20261111000005
-- ==============================================================================
-- Includes all 14 domain tables, indexes, functions, triggers, and RLS policies.
-- Safe to run on a fresh Supabase Postgres instance or re-run idempotently.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- Shared Trigger Functions (timestamp helpers & auth profile sync)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Compatibility alias used by Phases 3 and 5 triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- SECTION 1: TABLE DEFINITIONS & INDEXES
-- ==============================================================================

-- 1. Profiles (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT CHECK (role IN ('buyer', 'seller', 'both')) DEFAULT 'both',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'locked', 'completed', 'disputed')),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    invite_code TEXT NOT NULL UNIQUE,
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transactions_invite_code ON public.transactions(invite_code);
CREATE INDEX IF NOT EXISTS idx_transactions_creator_id ON public.transactions(creator_id);

-- 3. Transaction Participants
CREATE TABLE IF NOT EXISTS public.transaction_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_transaction_participant UNIQUE (transaction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.transaction_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_transaction_id ON public.transaction_participants(transaction_id);

-- 4. Messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_transaction_id ON public.messages(transaction_id, created_at ASC);

-- 5. Extracted Terms (Phase 2)
CREATE TABLE IF NOT EXISTS public.extracted_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    source_message_ids UUID[] NOT NULL DEFAULT '{}',
    term_key TEXT NOT NULL,
    term_value TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('specification', 'financial', 'timeline', 'condition')),
    classification TEXT NOT NULL CHECK (classification IN ('explicitly_agreed', 'inferred', 'ai_recommended', 'unresolved', 'disputed')),
    confidence_score NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'revised')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_extracted_terms_tx_status ON public.extracted_terms(transaction_id, status);
CREATE INDEX IF NOT EXISTS idx_extracted_terms_tx_category ON public.extracted_terms(transaction_id, category);

-- 6. Scenarios (Phase 3)
CREATE TABLE IF NOT EXISTS public.scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('timeline_delay', 'scope_dispute', 'material_shortage', 'quality_rejection', 'cost_escalation', 'cancellation')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    consequence_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommended_resolutions JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolving', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_transaction_id ON public.scenarios(transaction_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON public.scenarios(status);

-- 7. Scenario Resolutions (Phase 3)
CREATE TABLE IF NOT EXISTS public.scenario_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    proposed_by UUID NOT NULL REFERENCES public.profiles(id),
    agreed_action TEXT NOT NULL,
    price_impact_type TEXT NOT NULL DEFAULT 'none' CHECK (price_impact_type IN ('none', 'additional_cost', 'discount', 'refund')),
    price_impact_value NUMERIC NOT NULL DEFAULT 0.00 CHECK (price_impact_value >= 0),
    timeline_impact_days INTEGER NOT NULL DEFAULT 0,
    buyer_approved BOOLEAN NOT NULL DEFAULT false,
    seller_approved BOOLEAN NOT NULL DEFAULT false,
    buyer_approved_at TIMESTAMPTZ,
    seller_approved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_resolutions_scenario_id ON public.scenario_resolutions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_resolutions_transaction_id ON public.scenario_resolutions(transaction_id);

-- 8. Agreement Versions (Phase 4)
CREATE TABLE IF NOT EXISTS public.agreement_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number >= 1),
    content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
    title TEXT NOT NULL DEFAULT 'Commercial Agreement',
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'cancelled')),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_transaction_version UNIQUE (transaction_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_transaction_id ON public.agreement_versions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_agreement_versions_status ON public.agreement_versions(status);

-- 9. Agreement Approvals (Phase 4)
CREATE TABLE IF NOT EXISTS public.agreement_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_version_id UUID NOT NULL REFERENCES public.agreement_versions(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
    content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_version_user UNIQUE (agreement_version_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agreement_approvals_version_id ON public.agreement_approvals(agreement_version_id);
CREATE INDEX IF NOT EXISTS idx_agreement_approvals_transaction_id ON public.agreement_approvals(transaction_id);

-- 10. Payment Milestones (Phase 5)
CREATE TABLE IF NOT EXISTS public.payment_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    agreement_version_id UUID NOT NULL REFERENCES public.agreement_versions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    sequence_order INTEGER NOT NULL CHECK (sequence_order >= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'refunded', 'disputed')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_milestone_sequence UNIQUE (transaction_id, agreement_version_id, sequence_order)
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_tx_id ON public.payment_milestones(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_status ON public.payment_milestones(status);

-- 11. Payment Records (Phase 5 - PayPal Server Verification Ledger)
CREATE TABLE IF NOT EXISTS public.payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES public.payment_milestones(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.profiles(id),
    paypal_order_id TEXT UNIQUE NOT NULL,
    paypal_capture_id TEXT UNIQUE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'CREATED',
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_milestone_id ON public.payment_records(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_tx_id ON public.payment_records(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_order_id ON public.payment_records(paypal_order_id);

-- 12. WebAuthn Credentials (Phase 6 - Rule 13: Public Key & Counter Only)
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
    device_label TEXT,
    is_fallback BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
    ON public.webauthn_credentials(user_id);

-- 13. Transaction Events (Phase 6 - Tamper-Evident Hash-Chained Ledger)
CREATE TABLE IF NOT EXISTS public.transaction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_event_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL CHECK (length(event_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_transaction_events_tx_timestamp
    ON public.transaction_events(transaction_id, timestamp ASC, id ASC);

-- 14. Drift Alerts (Phase 6 - Post-Lock Agreement Drift Detection)
CREATE TABLE IF NOT EXISTS public.drift_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    active_version_id UUID NOT NULL REFERENCES public.agreement_versions(id) ON DELETE CASCADE,
    source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    term_key TEXT NOT NULL,
    original_value TEXT NOT NULL,
    proposed_value TEXT NOT NULL,
    confidence_score NUMERIC NOT NULL DEFAULT 0.85 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'amended', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drift_alerts_tx_id
    ON public.drift_alerts(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_alerts_status
    ON public.drift_alerts(transaction_id, status);

-- ==============================================================================
-- SECTION 2: TRIGGERS & HELPER FUNCTIONS
-- ==============================================================================

-- Automatic profile creation trigger on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, avatar_url, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'both'),
        new.raw_user_meta_data->>'avatar_url',
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = now();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_extracted_terms_updated_at ON public.extracted_terms;
CREATE TRIGGER trg_extracted_terms_updated_at
    BEFORE UPDATE ON public.extracted_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_scenarios_updated_at ON public.scenarios;
CREATE TRIGGER update_scenarios_updated_at
    BEFORE UPDATE ON public.scenarios
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_scenario_resolutions_updated_at ON public.scenario_resolutions;
CREATE TRIGGER update_scenario_resolutions_updated_at
    BEFORE UPDATE ON public.scenario_resolutions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_milestones_updated_at ON public.payment_milestones;
CREATE TRIGGER update_payment_milestones_updated_at
    BEFORE UPDATE ON public.payment_milestones
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper security definer function to avoid infinite recursion when querying participants
CREATE OR REPLACE FUNCTION public.is_transaction_participant(_transaction_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.transaction_participants
        WHERE transaction_id = _transaction_id AND user_id = _user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- SECTION 3: ROW LEVEL SECURITY (RLS) ENABLEMENT & POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_alerts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- TRANSACTIONS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view transactions they participate in or created" ON public.transactions;
CREATE POLICY "Users can view transactions they participate in or created"
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (
        creator_id = auth.uid() OR
        public.is_transaction_participant(id, auth.uid())
    );

DROP POLICY IF EXISTS "Authenticated users can create transactions" ON public.transactions;
CREATE POLICY "Authenticated users can create transactions"
    ON public.transactions
    FOR INSERT
    TO authenticated
    WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Participants can update transaction details" ON public.transactions;
CREATE POLICY "Participants can update transaction details"
    ON public.transactions
    FOR UPDATE
    TO authenticated
    USING (
        creator_id = auth.uid() OR
        public.is_transaction_participant(id, auth.uid())
    )
    WITH CHECK (
        creator_id = auth.uid() OR
        public.is_transaction_participant(id, auth.uid())
    );

-- ------------------------------------------------------------------------------
-- TRANSACTION PARTICIPANTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can view other participants in the same transaction" ON public.transaction_participants;
CREATE POLICY "Participants can view other participants in the same transaction"
    ON public.transaction_participants
    FOR SELECT
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.transactions
            WHERE id = transaction_participants.transaction_id AND creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can add themselves as a participant or creator can add first participant" ON public.transaction_participants;
CREATE POLICY "Users can add themselves as a participant or creator can add first participant"
    ON public.transaction_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
    );

-- ------------------------------------------------------------------------------
-- MESSAGES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read messages in their transaction" ON public.messages;
CREATE POLICY "Participants can read messages in their transaction"
    ON public.messages
    FOR SELECT
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

DROP POLICY IF EXISTS "Participants can post messages in their transaction" ON public.messages;
CREATE POLICY "Participants can post messages in their transaction"
    ON public.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid() AND
        public.is_transaction_participant(transaction_id, auth.uid())
    );

-- ------------------------------------------------------------------------------
-- EXTRACTED TERMS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can view extracted terms in their transaction" ON public.extracted_terms;
CREATE POLICY "Participants can view extracted terms in their transaction"
    ON public.extracted_terms
    FOR SELECT
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

DROP POLICY IF EXISTS "Participants can insert extracted terms in their transaction" ON public.extracted_terms;
CREATE POLICY "Participants can insert extracted terms in their transaction"
    ON public.extracted_terms
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

DROP POLICY IF EXISTS "Participants can update extracted terms status" ON public.extracted_terms;
CREATE POLICY "Participants can update extracted terms status"
    ON public.extracted_terms
    FOR UPDATE
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    )
    WITH CHECK (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

DROP POLICY IF EXISTS "Participants can delete extracted terms in their transaction" ON public.extracted_terms;
CREATE POLICY "Participants can delete extracted terms in their transaction"
    ON public.extracted_terms
    FOR DELETE
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

-- ------------------------------------------------------------------------------
-- SCENARIOS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read scenarios" ON public.scenarios;
CREATE POLICY "Participants can read scenarios"
    ON public.scenarios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = scenarios.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = scenarios.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert scenarios" ON public.scenarios;
CREATE POLICY "Participants can insert scenarios"
    ON public.scenarios FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = scenarios.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = scenarios.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can update scenarios" ON public.scenarios;
CREATE POLICY "Participants can update scenarios"
    ON public.scenarios FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = scenarios.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = scenarios.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- SCENARIO RESOLUTIONS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read scenario resolutions" ON public.scenario_resolutions;
CREATE POLICY "Participants can read scenario resolutions"
    ON public.scenario_resolutions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = scenario_resolutions.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = scenario_resolutions.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert scenario resolutions" ON public.scenario_resolutions;
CREATE POLICY "Participants can insert scenario resolutions"
    ON public.scenario_resolutions FOR INSERT
    WITH CHECK (
        proposed_by = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.transaction_participants tp
                WHERE tp.transaction_id = scenario_resolutions.transaction_id
                AND tp.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.transactions t
                WHERE t.id = scenario_resolutions.transaction_id
                AND t.creator_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Participants can update scenario resolutions" ON public.scenario_resolutions;
CREATE POLICY "Participants can update scenario resolutions"
    ON public.scenario_resolutions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = scenario_resolutions.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = scenario_resolutions.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- AGREEMENT VERSIONS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read agreement versions" ON public.agreement_versions;
CREATE POLICY "Participants can read agreement versions"
    ON public.agreement_versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = agreement_versions.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = agreement_versions.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert agreement versions" ON public.agreement_versions;
CREATE POLICY "Participants can insert agreement versions"
    ON public.agreement_versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = agreement_versions.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = agreement_versions.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can update agreement versions" ON public.agreement_versions;
CREATE POLICY "Participants can update agreement versions"
    ON public.agreement_versions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = agreement_versions.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = agreement_versions.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- AGREEMENT APPROVALS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read agreement approvals" ON public.agreement_approvals;
CREATE POLICY "Participants can read agreement approvals"
    ON public.agreement_approvals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = agreement_approvals.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = agreement_approvals.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert agreement approvals" ON public.agreement_approvals;
CREATE POLICY "Participants can insert agreement approvals"
    ON public.agreement_approvals FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.transaction_participants tp
                WHERE tp.transaction_id = agreement_approvals.transaction_id
                AND tp.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.transactions t
                WHERE t.id = agreement_approvals.transaction_id
                AND t.creator_id = auth.uid()
            )
        )
    );

-- ------------------------------------------------------------------------------
-- PAYMENT MILESTONES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read payment milestones" ON public.payment_milestones;
CREATE POLICY "Participants can read payment milestones"
    ON public.payment_milestones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = payment_milestones.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = payment_milestones.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert payment milestones" ON public.payment_milestones;
CREATE POLICY "Participants can insert payment milestones"
    ON public.payment_milestones FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = payment_milestones.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = payment_milestones.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can update payment milestones" ON public.payment_milestones;
CREATE POLICY "Participants can update payment milestones"
    ON public.payment_milestones FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = payment_milestones.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = payment_milestones.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- PAYMENT RECORDS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read payment records" ON public.payment_records;
CREATE POLICY "Participants can read payment records"
    ON public.payment_records FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = payment_records.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = payment_records.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Authenticated payers can insert payment records" ON public.payment_records;
CREATE POLICY "Authenticated payers can insert payment records"
    ON public.payment_records FOR INSERT
    WITH CHECK (
        payer_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.transaction_participants tp
                WHERE tp.transaction_id = payment_records.transaction_id
                AND tp.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.transactions t
                WHERE t.id = payment_records.transaction_id
                AND t.creator_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Participants can update payment records" ON public.payment_records;
CREATE POLICY "Participants can update payment records"
    ON public.payment_records FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = payment_records.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = payment_records.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- WEBAUTHN CREDENTIALS POLICIES (Owner-only)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read their own webauthn credentials" ON public.webauthn_credentials;
CREATE POLICY "Users can read their own webauthn credentials"
    ON public.webauthn_credentials FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can register their own webauthn credentials" ON public.webauthn_credentials;
CREATE POLICY "Users can register their own webauthn credentials"
    ON public.webauthn_credentials FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own webauthn counter" ON public.webauthn_credentials;
CREATE POLICY "Users can update their own webauthn counter"
    ON public.webauthn_credentials FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own webauthn credentials" ON public.webauthn_credentials;
CREATE POLICY "Users can delete their own webauthn credentials"
    ON public.webauthn_credentials FOR DELETE
    USING (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- TRANSACTION EVENTS POLICIES (Append-only ledger)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read transaction events" ON public.transaction_events;
CREATE POLICY "Participants can read transaction events"
    ON public.transaction_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = transaction_events.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = transaction_events.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can append transaction events" ON public.transaction_events;
CREATE POLICY "Participants can append transaction events"
    ON public.transaction_events FOR INSERT
    WITH CHECK (
        actor_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.transaction_participants tp
                WHERE tp.transaction_id = transaction_events.transaction_id
                AND tp.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.transactions t
                WHERE t.id = transaction_events.transaction_id
                AND t.creator_id = auth.uid()
            )
        )
    );

-- ------------------------------------------------------------------------------
-- DRIFT ALERTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can read drift alerts" ON public.drift_alerts;
CREATE POLICY "Participants can read drift alerts"
    ON public.drift_alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = drift_alerts.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = drift_alerts.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can insert drift alerts" ON public.drift_alerts;
CREATE POLICY "Participants can insert drift alerts"
    ON public.drift_alerts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = drift_alerts.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = drift_alerts.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Participants can update drift alerts" ON public.drift_alerts;
CREATE POLICY "Participants can update drift alerts"
    ON public.drift_alerts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.transaction_participants tp
            WHERE tp.transaction_id = drift_alerts.transaction_id
            AND tp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = drift_alerts.transaction_id
            AND t.creator_id = auth.uid()
        )
    );

-- ==============================================================================
-- SECTION 4: SUPABASE REALTIME PUBLICATION
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.extracted_terms;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_milestones;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.agreement_versions;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

