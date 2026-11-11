-- ==============================================================================
-- PACT Database Migration: Allow 'revised' status on extracted_terms
-- Migration: 20261112000001_add_revised_term_status.sql
-- Supports dynamic entity resolution updating existing terms to REVISED.
-- ==============================================================================

DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.extracted_terms'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.extracted_terms DROP CONSTRAINT IF EXISTS %I',
            constraint_row.conname
        );
    END LOOP;

    ALTER TABLE public.extracted_terms
        ADD CONSTRAINT extracted_terms_status_check
        CHECK (status IN ('pending', 'confirmed', 'rejected', 'revised'));
END $$;

