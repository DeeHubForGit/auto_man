-- =====================================================================
-- Migration: Add password_changed_at column to public.client
-- Date: 2026-03-12
-- Purpose: Enable app-level session invalidation after password resets
-- =====================================================================

-- Add password_changed_at column to client table
ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone;

-- Add column comment
COMMENT ON COLUMN public.client.password_changed_at IS
'Timestamp of last password change. Used to invalidate sessions issued before password change.';

-- =====================================================================
-- No initial data population needed - defaults to NULL for existing users
-- Sessions will only be invalidated after users set new passwords
-- =====================================================================
