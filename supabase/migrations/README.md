# Database Migrations

## How to Apply Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of the migration file
5. Paste and run the SQL

### Option 2: Using Supabase CLI

```bash
# Make sure you're in the project root
cd "c:\Dee\Work\Auto man\auto-man-site"

# Apply the migration
supabase db push
```

## Migrations

### 20260307_add_test_and_notification_fields.sql

**Purpose:** Add test client and notification control fields to database

**What it does:**
- Adds `is_test` boolean to `client` table (default: false)
- Adds `is_test` boolean to `booking` table (default: false)
- Adds `is_sms_enabled` boolean to `booking` table (default: true)
- Adds `is_email_enabled` boolean to `booking` table (default: true)
- Adds `sms_new_booking_sent_at` timestamp to `booking` table
- Creates indexes on is_test fields for performance
- Backfills existing data with default values

**To apply manually:**

```sql
-- Copy and paste the contents of 20260307_add_test_and_notification_fields.sql
-- into the Supabase SQL Editor and run it
```

### 20260309_update_upsert_booking_function.sql

**Purpose:** Update Google Calendar webhook to automatically set test/notification flags

**What it does:**
- Updates `upsert_booking_from_google()` function with new logic
- Fetches client's `is_test` status when creating bookings from Google Calendar
- Automatically sets booking flags:
  - Test client → `is_test=true`, `is_sms_enabled=false`, `is_email_enabled=false`
  - Real client → `is_test=false`, `is_sms_enabled=true`, `is_email_enabled=true`
- Preserves existing booking flags on updates (only sets on creation)
- Does NOT modify Google Calendar data - flags are Auto-Man internal only

**To apply manually:**

```sql
-- Copy and paste the contents of 20260309_update_upsert_booking_function.sql
-- into the Supabase SQL Editor and run it
```

**Important:** Apply migrations in order:
1. First: 20260307_add_test_and_notification_fields.sql
2. Then: 20260309_update_upsert_booking_function.sql

## Testing the Migrations

### After applying 20260307_add_test_and_notification_fields.sql:

1. Check the `client` table schema - should have `is_test` column
2. Check the `booking` table schema - should have `is_test`, `is_sms_enabled`, `is_email_enabled`, `sms_new_booking_sent_at` columns
3. Verify indexes exist:
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('client', 'booking') 
AND indexname LIKE '%is_test%';
```

### After applying 20260309_update_upsert_booking_function.sql:

1. Mark a test client in the admin panel (check "Test Client" checkbox)
2. Have them book via Google Calendar
3. Check the created booking - should have:
   - `is_test = true`
   - `is_sms_enabled = false`
   - `is_email_enabled = false`
4. Book with a real client - should have:
   - `is_test = false`
   - `is_sms_enabled = true`
   - `is_email_enabled = true`

## Troubleshooting

### "Permission denied" errors

Use the Supabase Dashboard SQL Editor which runs with proper permissions (service_role).

### Migration already applied

Migrations are idempotent and safe to run multiple times:
- `ALTER TABLE IF NOT EXISTS` statements skip if columns exist
- `CREATE OR REPLACE FUNCTION` updates the function
- Index creation uses `IF NOT EXISTS` clause

### Bookings created before migration

Existing bookings will have:
- `is_test = false` (default from backfill)
- `is_sms_enabled = true` (default from backfill)
- `is_email_enabled = true` (default from backfill)

These won't change unless manually updated by admin.

### Test client flag not propagating to new bookings

1. Verify client has `is_test = true` in database
2. Check function was updated: `SELECT prosrc FROM pg_proc WHERE proname = 'upsert_booking_from_google';`
3. Look for the `v_client_is_test` variable and client lookup query in the function body

## Next Steps

After applying both migrations:

1. **Deploy to Production:**
   - Run migrations in Supabase Dashboard SQL Editor
   - Verify in order: first 20260307, then 20260309

2. **Update Edge Functions:**
   - Redeploy `gcal-sync` function to production (uses updated `upsert_booking_from_google`)
   - Verify webhook subscriptions are active

3. **Test the Flow:**
   - Mark a client as "Test Client" in admin panel
   - Have them book via Google Calendar
   - Verify no SMS/email sent for test bookings
   - Book with real client and verify notifications sent

4. **Monitor:**
   - Check `sms_log` and `email_log` tables
   - Verify test bookings have correct flags
   - Check calendar view shows "TEST" prefix for test bookings

## Rollback (if needed)

To revert changes, you would need to:

1. Restore original `upsert_booking_from_google` function (no is_test logic)
2. Drop the new columns (if desired, but not recommended as data loss):

```sql
-- CAUTION: This will delete data
ALTER TABLE booking DROP COLUMN IF EXISTS is_test;
ALTER TABLE booking DROP COLUMN IF EXISTS is_sms_enabled;
ALTER TABLE booking DROP COLUMN IF EXISTS is_email_enabled;
ALTER TABLE booking DROP COLUMN IF EXISTS sms_new_booking_sent_at;
ALTER TABLE client DROP COLUMN IF EXISTS is_test;
```

Note: It's safer to keep the columns and just not use them than to drop and lose data.
