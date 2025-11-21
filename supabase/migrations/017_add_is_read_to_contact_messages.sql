-- Add is_read column to contact_messages table for tracking read status

ALTER TABLE contact_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Add index for efficient filtering by read status
CREATE INDEX IF NOT EXISTS idx_contact_messages_is_read ON contact_messages(is_read);

-- Add comment for documentation
COMMENT ON COLUMN contact_messages.is_read IS 'Tracks whether admin has read this contact message';
