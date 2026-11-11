-- ==============================================================================
-- PACT Database Migration: Allow Authenticated Self-Insert on Profiles
-- Migration: 20261111000006_profiles_insert_policy.sql
-- Enables client/server session profile fallback when a user record is missing.
-- ==============================================================================

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

