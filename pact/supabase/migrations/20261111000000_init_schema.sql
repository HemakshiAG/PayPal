-- ==============================================================================
-- PACT (Predict. Agree. Protect.) Database Schema & RLS Policies
-- Migration: 20261111000000_init_schema.sql
-- ==============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Profiles Table (Linked to Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT CHECK (role IN ('buyer', 'seller', 'both')) DEFAULT 'both',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Transactions Table
-- ------------------------------------------------------------------------------
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

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Transaction Participants Table
-- ------------------------------------------------------------------------------
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

ALTER TABLE public.transaction_participants ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. Messages Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_transaction_id ON public.messages(transaction_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. Automatic Profile Creation Trigger on auth.users Signup
-- ------------------------------------------------------------------------------
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

-- Drop trigger if existing, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 6. Updated At Timestamps Helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. Row Level Security Policies
-- ------------------------------------------------------------------------------

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

-- PROFILES POLICIES
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- TRANSACTIONS POLICIES
CREATE POLICY "Users can view transactions they participate in or created"
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (
        creator_id = auth.uid() OR
        public.is_transaction_participant(id, auth.uid())
    );

CREATE POLICY "Authenticated users can create transactions"
    ON public.transactions
    FOR INSERT
    TO authenticated
    WITH CHECK (creator_id = auth.uid());

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

-- TRANSACTION PARTICIPANTS POLICIES
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

CREATE POLICY "Users can add themselves as a participant or creator can add first participant"
    ON public.transaction_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
    );

-- MESSAGES POLICIES
CREATE POLICY "Participants can read messages in their transaction"
    ON public.messages
    FOR SELECT
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

CREATE POLICY "Participants can post messages in their transaction"
    ON public.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid() AND
        public.is_transaction_participant(transaction_id, auth.uid())
    );

