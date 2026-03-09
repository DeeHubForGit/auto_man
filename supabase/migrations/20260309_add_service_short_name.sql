-- =====================================================================
-- Migration: Add short_name column to public.service
-- Date: 2026-03-09
-- Purpose: Store compact service labels for SMS and space-constrained UI
-- =====================================================================

-- Add short_name column to service table
ALTER TABLE public.service
ADD COLUMN IF NOT EXISTS short_name text;

-- Add column comment
COMMENT ON COLUMN public.service.short_name IS
'Compact service label for SMS and space-constrained UI, e.g. Auto – 1 hr.';

-- =====================================================================
-- Populate short_name for existing services
-- =====================================================================

-- Automatic services
UPDATE public.service SET short_name = 'Auto – 1 hr' WHERE code = 'auto_60';
UPDATE public.service SET short_name = 'Auto – 1.5 hr' WHERE code = 'auto_90';
UPDATE public.service SET short_name = 'Auto – 2 hr' WHERE code = 'auto_120';

-- Manual services
UPDATE public.service SET short_name = 'Manual – 1 hr' WHERE code = 'manual_60';
UPDATE public.service SET short_name = 'Manual – 1.5 hr' WHERE code = 'manual_90';
UPDATE public.service SET short_name = 'Manual – 2 hr' WHERE code = 'manual_120';

-- Senior Automatic services
UPDATE public.service SET short_name = 'Snr Auto – 1 hr' WHERE code = 'senior_auto_60';
UPDATE public.service SET short_name = 'Snr Auto – 1.5 hr' WHERE code = 'senior_auto_90';
UPDATE public.service SET short_name = 'Snr Auto – 2 hr' WHERE code = 'senior_auto_120';

-- Senior Manual services
UPDATE public.service SET short_name = 'Snr Manual – 1 hr' WHERE code = 'senior_manual_60';
UPDATE public.service SET short_name = 'Snr Manual – 1.5 hr' WHERE code = 'senior_manual_90';
UPDATE public.service SET short_name = 'Snr Manual – 2 hr' WHERE code = 'senior_manual_120';

-- =====================================================================
-- Verification query (run manually if needed)
-- =====================================================================
-- SELECT code, name, short_name FROM public.service ORDER BY sort_order, code;
