# Auto-Man Driving School - Supabase Deployment Guide

## 📋 Overview

This Supabase setup captures Google Calendar bookings, stores client data, and prepares for SMS/email automation.

## 🚀 Deployment Steps

### 1. Deploy Database Schema

1. Go to your Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Click **Run**

The schema will create:
- ✅ 7 core tables (client, booking, sms_log, email_log, package, client_credit, service)
- ✅ ENUMs for type safety (booking_status, msg_status)
- ✅ Constraints and indexes (including partial indexes for performance)
- ✅ Triggers for auto-updates (updated_at, start_date, start_minute, credits_remaining)
- ✅ Helper functions:
  - `upsert_booking_from_google()` - Idempotent booking creation
  - `map_service_code()` - Smart service code detection from event summary
- ✅ Seed data:
  - 3 lesson packages (3-pack, 5-pack, 10-pack)
  - 8 services (automatic + manual, regular + senior, 1hr/1.5hr/2hr)

### 2. Deploy Edge Function (Webhook)

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the webhook function
supabase functions deploy google-calendar-webhook
```

### 3. Set Environment Variables

In Supabase Dashboard → **Edge Functions** → **google-calendar-webhook** → **Settings**:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (from Settings → API)

### 4. Get Webhook URL

After deployment, your webhook URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-calendar-webhook
```

### 5. Configure Google Calendar Webhook

Use Google Apps Script or Google Calendar API to send booking events to your webhook URL.

**Example payload:**
```json
{
  "event": {
    "id": "abc123",
    "summary": "Automatic Driving Lesson 1 hour $85",
    "description": "Pickup: 123 Main St",
    "htmlLink": "https://calendar.google.com/event?eid=...",
    "iCalUID": "abc123@google.com",
    "start": {
      "dateTime": "2025-10-18T14:00:00+11:00",
      "timeZone": "Australia/Melbourne"
    },
    "end": {
      "dateTime": "2025-10-18T15:00:00+11:00",
      "timeZone": "Australia/Melbourne"
    },
    "attendees": [
      {
        "email": "client@example.com",
        "displayName": "John Smith"
      }
    ],
    "extendedProperties": {
      "shared": {
        "mobile": "0412345678",
        "serviceCode": "auto_60",
        "price": "85"
      }
    }
  },
  "calendarId": "primary"
}
```

**Note:** If `serviceCode` is not provided in `extendedProperties`, the system will auto-detect it from the `summary` field using `map_service_code()`.

## 📊 Database Schema

### Tables

1. **client** - Customer records (email as unique key)
   - Stores intake form data (medical conditions, learning needs, etc.)
   
2. **booking** - Lesson bookings (mirrors Google Calendar events)
   - **NEW**: Contact snapshot (first_name, last_name, email, mobile at time of booking)
   - **NEW**: Google links (google_booking_url, google_html_link, google_ical_uid)
   - **NEW**: Computed columns (start_date in Melbourne timezone, start_minute for uniqueness)
   
3. **sms_log** - SMS delivery tracking (prevents duplicate sends)
   
4. **email_log** - Email delivery tracking (prevents duplicate sends)
   
5. **package** - Lesson bundles (3-pack, 5-pack, 10-pack)
   
6. **client_credit** - Package purchase tracking (credits system)
   
7. **service** - Service definitions with pricing
   - **NEW**: `sort_order` - Controls display order on website
   - **NEW**: `google_booking_url` - Link back to Google Calendar booking page
   - Includes: auto_60, auto_90, auto_120, senior_auto_60, manual_60, manual_90, manual_120, senior_manual_60

### Key Features

- **Idempotent**: Safe to re-run schema multiple times
- **Type-safe**: ENUMs prevent invalid status values
- **Timezone-aware**: Converts to Australia/Melbourne for date calculations
- **Soft deletes**: `is_deleted` flag preserves history
- **Anti-duplication**: Unique indexes prevent duplicate SMS/emails per booking
- **Contact snapshot**: Booking stores client details at time of booking (immutable record)
- **Smart service detection**: `map_service_code()` automatically detects service type from event summary
- **Manual + Automatic**: Supports both transmission types with senior variations
- **Sortable services**: `sort_order` field controls website display order

## 🔧 Helper Functions

### `upsert_booking_from_google()`

Automatically:
1. Creates/updates client by email
2. **Auto-detects service code** from summary if not provided (using `map_service_code()`)
3. Calculates duration from start/end times
4. Looks up `google_booking_url` from service table
5. Creates/updates booking by google_event_id
6. Stores contact snapshot + Google links in booking
7. Returns booking UUID

**New Parameters:**
- `p_summary` - Event summary (used for auto-detection if service_code not provided)
- `p_html_link` - Google Calendar event HTML link
- `p_ical_uid` - iCal UID for the event

**Usage:**
```sql
SELECT upsert_booking_from_google(
  p_google_event_id := 'abc123',
  p_calendar_id := 'primary',
  p_client_email := 'client@example.com',
  p_first_name := 'John',
  p_last_name := 'Smith',
  p_mobile := '0412345678',
  p_service_code := NULL,  -- Will auto-detect from p_summary
  p_price_cents := 8500,
  p_start := '2025-10-18 14:00:00+11',
  p_end := '2025-10-18 15:00:00+11',
  p_pickup := '123 Main St',
  p_extended := '{"summary": "Lesson"}'::jsonb,
  p_html_link := 'https://calendar.google.com/event?eid=...',
  p_ical_uid := 'abc123@google.com',
  p_summary := 'Automatic Driving Lesson 1 hour $85'
);
```

### `map_service_code()`

**Smart service code detection** from event summary and duration.

**Logic:**
1. Detects "senior" keyword → senior variant
2. Detects "manual" keyword → manual transmission
3. Otherwise → automatic transmission
4. Rounds duration to nearest: 60min, 90min, or 120min
5. Returns appropriate service code (e.g., `senior_manual_90`)

**Examples:**
```sql
-- Returns 'auto_60'
SELECT map_service_code('Automatic Driving Lesson 1 hour', 60);

-- Returns 'senior_manual_90'
SELECT map_service_code('Senior Manual Lesson 1.5 hours', 90);

-- Returns 'manual_120' (auto-detects duration from summary)
SELECT map_service_code('Manual Driving Lesson 2 hours', NULL);
```

## 📝 Next Steps (Priorities)

### ✅ Priority 1 - CRM/Client Database
**Status: COMPLETE**
- Client and booking tables created
- Webhook captures Google Calendar events
- Contact snapshot stored in bookings

### 🔜 Priority 2 - SMS Reminders
**Next:**
1. Create Edge Function for SMS sending (ClickSend/Twilio)
2. Add scheduled job to check bookings 24h before start
3. Send reminder SMS and log to `sms_log`

### 🔜 Priority 3 - Email Customisation
**Next:**
1. Create email templates
2. Add SMTP configuration
3. Send confirmation emails on booking create

### 🔜 Priority 4 - Show Bookings on Website
**Next:**
1. Create client portal page
2. Query bookings by email
3. Add reschedule/cancel functionality

### 🔜 Priority 5 - Packages/Bundles
**Next:**
1. Add package purchase flow
2. Deduct credits on booking
3. Track expiry dates

## 🐛 Troubleshooting

### Schema won't run
- Make sure you're using the latest `schema.sql`
- Check for existing tables with `_old` suffix
- Drop old tables if needed: `DROP TABLE IF EXISTS booking_old CASCADE;`

### Webhook errors
- Check Edge Function logs in Supabase Dashboard
- Verify environment variables are set
- Test with sample payload using `test-webhook.html`

### TypeScript errors in IDE
- These are just IDE warnings for Deno runtime
- The `deno.d.ts` file suppresses them
- Code will work fine when deployed to Supabase

## 📚 Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [ClickSend SMS API](https://developers.clicksend.com/)
