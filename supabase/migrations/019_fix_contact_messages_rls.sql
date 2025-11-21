-- Migration: Add UPDATE policy for contact_messages
-- Allow authenticated users to update is_read field on contact messages

-- Only drop and recreate the UPDATE policy
DROP POLICY IF EXISTS "Allow admin to update contact messages" ON contact_messages;
DROP POLICY IF EXISTS "Allow authenticated to update contact messages" ON contact_messages;

-- Create policy to allow authenticated users to update contact messages
-- (Temporarily using true for all authenticated users to test functionality)
CREATE POLICY "Allow authenticated to update contact messages"
ON contact_messages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
