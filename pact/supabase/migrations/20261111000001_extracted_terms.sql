-- ==============================================================================
-- PACT (Predict. Agree. Protect.) Database Schema & RLS Policies
-- Migration: 20261111000001_extracted_terms.sql
-- Phase 2: Extracted Terms and AI Suggestions Table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.extracted_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    source_message_ids UUID[] NOT NULL DEFAULT '{}',
    term_key TEXT NOT NULL,
    term_value TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('specification', 'financial', 'timeline', 'condition')),
    classification TEXT NOT NULL CHECK (classification IN ('explicitly_agreed', 'inferred', 'ai_recommended', 'unresolved', 'disputed')),
    confidence_score NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for efficient querying by workspace panels
CREATE INDEX IF NOT EXISTS idx_extracted_terms_tx_status ON public.extracted_terms(transaction_id, status);
CREATE INDEX IF NOT EXISTS idx_extracted_terms_tx_category ON public.extracted_terms(transaction_id, category);

-- Automatic updated_at timestamp trigger
DROP TRIGGER IF EXISTS trg_extracted_terms_updated_at ON public.extracted_terms;
CREATE TRIGGER trg_extracted_terms_updated_at
    BEFORE UPDATE ON public.extracted_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE public.extracted_terms ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Row Level Security Policies
-- Strictly restrict access to transaction participants
-- ------------------------------------------------------------------------------

CREATE POLICY "Participants can view extracted terms in their transaction"
    ON public.extracted_terms
    FOR SELECT
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

CREATE POLICY "Participants can insert extracted terms in their transaction"
    ON public.extracted_terms
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

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

CREATE POLICY "Participants can delete extracted terms in their transaction"
    ON public.extracted_terms
    FOR DELETE
    TO authenticated
    USING (
        public.is_transaction_participant(transaction_id, auth.uid())
    );

