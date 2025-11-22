-- Migration: add event_title to booking
-- Run this once. No backfill is performed by this script.
BEGIN;

-- Add event_title column (text, nullable)
ALTER TABLE IF EXISTS booking
  ADD COLUMN IF NOT EXISTS event_title TEXT;

COMMIT;
