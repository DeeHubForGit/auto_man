# Fix: SMS Intake Completion Mismatch

## Problem
SMS messages were advising clients to complete intake even when they had already completed it. This occurred because booking records were losing their `client_id` reference when Google Calendar events were synced/updated.

## Root Cause
The `upsert_booking_from_google()` SQL function had two issues:

1. **Backwards COALESCE logic**: When updating existing bookings on conflict, the function prioritized the new (often NULL) `client_id` over the existing one
2. **No direct client_id parameter**: Admin bookings couldn't pass the known `client_id`, forcing reliance on email-based matching which could fail

## Solution Implemented

### 1. Fixed SQL Function (Migration 016)
**File**: `supabase/migrations/016_fix_client_id_preservation.sql`

Changes to `upsert_booking_from_google()`:

#### A. Explicit DROP of old function signature
```sql
-- Drop old function signature explicitly to avoid function overload
DROP FUNCTION IF EXISTS public.upsert_booking_from_google(
  text, text, text, text, text, text, text, integer, timestamptz, timestamptz,
  text, jsonb, boolean, text
);
```

**Why this matters**: In PostgreSQL, functions are identified by name + argument types. Adding a new parameter creates a function overload, leaving the old signature callable. This explicit DROP ensures all callers use the new logic.

#### B. Added optional `p_client_id` parameter
```sql
CREATE OR REPLACE FUNCTION public.upsert_booking_from_google(
    ...
    p_title text,
    p_client_id uuid DEFAULT NULL  -- NEW: optional client_id
)
```

#### C. Prioritize passed-in client_id
```sql
DECLARE
  v_client_id uuid := p_client_id;  -- Start with passed-in value
```

#### D. Only upsert client if client_id not provided
```sql
IF v_client_id IS NULL AND p_client_email IS NOT NULL THEN
  -- Upsert client via email
  ...
END IF;
```

#### E. **CRITICAL FIX**: Preserve existing client_id on conflict
```sql
ON CONFLICT (google_event_id) DO UPDATE
SET
  -- Keep existing client_id if present, only fill if missing
  client_id = COALESCE(public.booking.client_id, EXCLUDED.client_id),
  ...
```

**Before (WRONG)**:
```sql
client_id = COALESCE(EXCLUDED.client_id, public.booking.client_id)
```
This would replace existing client_id with NULL if the new value was NULL.

**After (CORRECT)**:
```sql
client_id = COALESCE(public.booking.client_id, EXCLUDED.client_id)
```
This preserves the existing client_id and only fills it if missing.

### 2. Updated schema.sql
**File**: `supabase/schema.sql`

Updated the function definition to match the migration, ensuring consistency.

### 3. Updated create-admin-booking Edge Function
**File**: `supabase/functions/create-admin-booking/index.ts`

#### A. Added client_id to booking upsert:
```typescript
const bookingRow: any = {
  google_event_id: googleEvent.id,
  ...
};

// Add client_id if provided
if (clientId) {
  bookingRow.client_id = clientId;
}
```

#### B. Added client_id to Google Calendar extendedProperties:
```typescript
extendedProperties: {
  shared: {
    service_code: serviceCode,
    created_by: "admin",
    is_booking: "true",
    mobile: safeMobile,
    pickup_location: safePickup,
    ...(clientId ? { client_id: String(clientId) } : {}), // NEW: Allow gcal-sync to preserve/recover
  },
}
```

This ensures:
- Admin bookings immediately have the correct `client_id` in the database
- Google Calendar events store the `client_id` for sync recovery
- If the database record is lost/recreated, gcal-sync can restore the client link

### 4. Updated gcal-sync Edge Function
**File**: `supabase/functions/gcal-sync/index.ts`

#### A. Extract client_id from extendedProperties:
```typescript
const shared = e.extendedProperties?.shared || {};
let client_id = shared.client_id?.trim() || null;
```

#### B. Return client_id from extractFieldsFromEvent:
```typescript
return { first_name, last_name, email, mobile, pickup_location: pickup, client_id };
```

#### C. Pass client_id to SQL function:
```typescript
const payload = {
  ...
  p_client_id: fields.client_id ?? null
};
```

This completes the round-trip: create-admin-booking stores it, gcal-sync reads it, SQL function uses it.

### 5. Fixed CSS Variable
**File**: `partials/admin-clients.html`

Added missing `--danger-red-rgb` CSS variable:
```css
:root {
  --danger-red: #dc2626; /* Hex for borders/text */
  --danger-red-rgb: 220, 38, 38; /* RGB for rgba() usage */
}
```

This fixes the `rgba(var(--danger-red-rgb), 0.08)` usage that was previously undefined.

## Impact

### ✅ Fixed Behavior
1. **Existing bookings preserve client_id** when Google Calendar events update
2. **Admin bookings** get client_id immediately (no reliance on email matching)
3. **SMS function** can correctly check `client.intake_completed` status
4. **No false "complete intake" messages** for clients who already completed it

### 📊 Backward Compatible
- The `p_client_id` parameter is optional (DEFAULT NULL)
- Existing calls without the parameter continue to work
- Email-based client matching still works as fallback

### 🔄 Affected Functions
- ✅ `gcal-sync`: Now extracts and passes client_id from extendedProperties
- ✅ `create-admin-booking`: Passes client_id to DB and Google Calendar
- ✅ `update-admin-booking`: Already passed client_id correctly
- ✅ `booking-sms`: Will now find correct intake status via client_id
- ✅ SQL function: Preserves client_id on conflict, accepts optional p_client_id

### 🔄 Full Data Flow
```
Admin creates booking
  ↓
create-admin-booking stores client_id in:
  1. Database (booking.client_id)
  2. Google Calendar (extendedProperties.shared.client_id)
  ↓
Google Calendar event syncs/updates
  ↓
gcal-sync extracts client_id from extendedProperties
  ↓
SQL function receives p_client_id
  ↓
COALESCE preserves existing client_id (or fills if missing)
  ↓
booking-sms finds client via client_id
  ↓
SMS reflects correct intake_completed status
```

## Deployment

1. **Run migration**:
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**:
   ```bash
   supabase functions deploy create-admin-booking
   supabase functions deploy gcal-sync
   ```

3. **Verify** by creating an admin booking and checking that:
   - Booking has correct `client_id`
   - SMS reflects actual `intake_completed` status
   - Updating the Google Calendar event doesn't clear `client_id`

## Testing Checklist

- [ ] Create admin booking with existing client → client_id populated
- [ ] Update Google Calendar event → client_id preserved
- [ ] SMS sent after booking → correct intake status message
- [ ] Client completes intake → next SMS doesn't mention intake
- [ ] gcal-sync processes events → client_id preserved on updates

## Technical Notes

### COALESCE Order Matters
```sql
COALESCE(a, b)  -- Returns first non-NULL value
```

For preserving existing values:
- ✅ `COALESCE(existing.value, new.value)` - keeps existing
- ❌ `COALESCE(new.value, existing.value)` - replaces with new (even if NULL)

### Function Parameter Defaults
```sql
p_client_id uuid DEFAULT NULL
```
Allows calling the function with or without the parameter, maintaining backward compatibility.

### SMS Intake Check Logic
The booking-sms function joins:
```sql
booking → client → client.intake_completed
```

If `booking.client_id` is NULL, the join fails and SMS function can't check intake status, leading to generic "complete intake" messages.
