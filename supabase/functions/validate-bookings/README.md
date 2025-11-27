# Validate Bookings Edge Function

Validates mobile numbers and pickup locations for bookings.

**Smart Validation**: Only validates bookings where `validation_checked_at IS NULL` to avoid redundant checks. When a client edits their mobile or pickup location, the validation flag is reset so it will be re-validated on the next run.

## Deployment

```bash
supabase functions deploy validate-bookings
```

## Manual Trigger

```bash
# Validate all bookings
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"all": true}'

# Validate bookings from specific date
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"since": "2024-01-01"}'

# Default: validates today onwards
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Schedule with pg_cron

In Supabase SQL Editor:

```sql
-- Enable pg_cron extension (Supabase Pro required)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily validation at 2 AM
SELECT cron.schedule(
  'validate-bookings-daily',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/validate-bookings',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{"all": false}'::jsonb
    ) as request_id;
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- Remove schedule
SELECT cron.unschedule('validate-bookings-daily');
```

## Response Format

```json
{
  "success": true,
  "validated": 45,
  "total_bookings": 45,
  "mobile_invalid_count": 3,
  "location_invalid_count": 7,
  "invalid_mobiles": [
    "abc-123: +61412",
    "def-456: 0412"
  ],
  "invalid_locations": [
    "ghi-789: 123",
    "jkl-012: test"
  ],
  "timestamp": "2024-01-15T02:00:00.000Z"
}
```
