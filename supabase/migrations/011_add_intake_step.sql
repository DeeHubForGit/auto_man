-- Add intake_step column to track current step in intake form
-- Default to step 1, allows resuming intake form across devices

ALTER TABLE public.client
ADD COLUMN intake_step INTEGER NOT NULL DEFAULT 1;

-- Add check constraint to ensure step is between 1 and 3
ALTER TABLE public.client
ADD CONSTRAINT intake_step_range CHECK (intake_step >= 1 AND intake_step <= 3);

-- Add comment
COMMENT ON COLUMN public.client.intake_step IS 'Current step in intake form (1-3). Allows resuming intake across devices.';
