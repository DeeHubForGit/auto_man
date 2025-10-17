# Schema Features Summary

## 🆕 New Features Added

### 1. **Smart Service Detection** (`map_service_code()`)

Automatically detects the correct service code from event summary and duration.

**Supported Services:**
- `auto_60`, `auto_90`, `auto_120` - Automatic lessons
- `manual_60`, `manual_90`, `manual_120` - Manual lessons
- `senior_auto_60` - Senior automatic
- `senior_manual_60` - Senior manual

**Detection Logic:**
```
Event Summary: "Senior Manual Driving Lesson 1.5 hours"
↓
Detects: "senior" + "manual" + "1.5 hours"
↓
Returns: "senior_manual_90"
```

### 2. **Contact Snapshot in Bookings**

Booking table now stores client contact details **at time of booking**:
- `first_name`
- `last_name`
- `email`
- `mobile`

**Why?** Preserves historical contact info even if client updates their details later.

### 3. **Google Calendar Links**

Three new fields link back to Google Calendar:
- `google_booking_url` - Public booking page URL (from service table)
- `google_html_link` - Direct link to event in Google Calendar
- `google_ical_uid` - iCal UID for calendar sync

### 4. **Service Table Enhancements**

**`sort_order` field:**
Controls display order on website. Lower numbers appear first.

```sql
-- Example: Display services in order
SELECT * FROM service 
WHERE is_active = TRUE 
ORDER BY sort_order;
```

**`google_booking_url` field:**
Stores the public Google Calendar booking page URL for each service.

### 5. **Computed Columns**

**`start_date` (DATE):**
- Automatically calculated from `start_time`
- Converted to Australia/Melbourne timezone
- Updated via trigger on INSERT/UPDATE

**`start_minute` (TIMESTAMPTZ):**
- Truncated to minute precision
- Used for portal double-booking prevention
- Updated via trigger on INSERT/UPDATE

### 6. **Manual Transmission Support**

Full support for manual transmission lessons:
- `manual_60` - 1 hour manual lesson
- `manual_90` - 1.5 hour manual lesson
- `manual_120` - 2 hour manual lesson
- `senior_manual_60` - Senior manual lesson

## 🔧 Function Improvements

### `upsert_booking_from_google()` Enhancements

**New behavior:**
1. If `p_service_code` is NULL, automatically detects from `p_summary`
2. Calculates duration from `p_start` and `p_end`
3. Looks up `google_booking_url` from service table
4. Stores contact snapshot in booking
5. Stores Google links (html_link, ical_uid)

**New parameters:**
- `p_summary` - Event summary for auto-detection
- `p_html_link` - Google Calendar event link
- `p_ical_uid` - iCal UID

## 📊 Service Codes Reference

| Code | Name | Duration | Type | Price |
|------|------|----------|------|-------|
| `auto_60` | Automatic 1 hour | 60 min | Regular | $85 |
| `auto_90` | Automatic 1.5 hours | 90 min | Regular | $125 |
| `auto_120` | Automatic 2 hours | 120 min | Regular | $165 |
| `senior_auto_60` | Senior Automatic 1 hour | 60 min | Senior | $75 |
| `manual_60` | Manual 1 hour | 60 min | Regular | $85 |
| `manual_90` | Manual 1.5 hours | 90 min | Regular | $125 |
| `manual_120` | Manual 2 hours | 120 min | Regular | $165 |
| `senior_manual_60` | Senior Manual 1 hour | 60 min | Senior | $75 |

## 🎯 Use Cases

### Auto-detect service from event summary

```sql
-- Event: "Senior Manual Driving Lesson 1.5 hours $125"
SELECT upsert_booking_from_google(
  p_google_event_id := 'evt_123',
  p_calendar_id := 'primary',
  p_client_email := 'john@example.com',
  p_first_name := 'John',
  p_last_name := 'Smith',
  p_mobile := '0412345678',
  p_service_code := NULL,  -- Will auto-detect as 'senior_manual_90'
  p_price_cents := 12500,
  p_start := '2025-10-20 14:00:00+11',
  p_end := '2025-10-20 15:30:00+11',
  p_pickup := '123 Main St',
  p_extended := '{}'::jsonb,
  p_html_link := 'https://calendar.google.com/event?eid=...',
  p_ical_uid := 'evt_123@google.com',
  p_summary := 'Senior Manual Driving Lesson 1.5 hours $125'
);
```

### Query bookings with service details

```sql
-- Get all bookings with service info
SELECT 
  b.id,
  b.start_time,
  b.start_date,  -- Melbourne timezone date
  b.first_name || ' ' || b.last_name AS client_name,
  b.email,
  b.mobile,
  s.name AS service_name,
  s.duration_minutes,
  b.price_cents / 100.0 AS price_dollars,
  b.google_html_link,
  b.google_booking_url
FROM booking b
LEFT JOIN service s ON s.code = b.service_code
WHERE b.is_deleted = FALSE
  AND b.status = 'confirmed'
ORDER BY b.start_time;
```

### Display services on website

```sql
-- Get active services in display order
SELECT 
  code,
  name,
  description,
  duration_minutes,
  price_cents / 100.0 AS price_dollars,
  google_booking_url
FROM service
WHERE is_active = TRUE
ORDER BY sort_order;
```

## 🔒 Data Integrity

### Constraints Added:
- ✅ `booking_price_nonneg` - Price must be >= 0
- ✅ `booking_time_valid` - End time must be after start time
- ✅ `credits_nonneg` - All credit values must be >= 0
- ✅ `service_google_booking_url_format` - URL must be valid format

### Unique Indexes:
- ✅ `ux_sms_once_per_type` - Prevent duplicate SMS per booking/template
- ✅ `ux_email_once_per_type` - Prevent duplicate emails per booking/type
- ✅ `ux_booking_client_start_min` - Prevent portal double-bookings

### ENUMs:
- ✅ `booking_status` - Only: confirmed, completed, cancelled, no_show
- ✅ `msg_status` - Only: pending, sent, delivered, failed

## 🚀 Migration Notes

If you're updating from an older schema:

1. **New columns are added safely** with `ADD COLUMN IF NOT EXISTS`
2. **Triggers are recreated** with `DROP TRIGGER IF EXISTS` first
3. **Constraints use DO blocks** to check existence before adding
4. **Seed data uses ON CONFLICT DO NOTHING** to prevent duplicates

Safe to re-run the entire `schema.sql` file! ✅
