# Admin Booking with Payment Flag Implementation

## Overview
This implementation adds the ability for admins to create lesson bookings directly through the admin calendar, with a payment flag to track whether payment is required. This is especially useful for bookings where payment is handled outside the system (e.g., cash, direct bank transfer).

## What Was Implemented

### 1. Database Changes

#### Migration 009: Add `is_payment_required` column
- **File**: `supabase/migrations/009_add_is_payment_required.sql`
- **Changes**: 
  - Added `is_payment_required` boolean column to `booking` table
  - Default value: `true` (existing bookings assumed to require payment)
  - Set as NOT NULL for data integrity

#### Migration 010: Update database function
- **File**: `supabase/migrations/010_update_upsert_booking_function.sql`
- **Changes**:
  - Updated `upsert_booking_from_google()` function to accept `p_is_payment_required` parameter
  - Default value: `true`
  - Function now stores and preserves payment flag during sync

### 2. Backend: Edge Functions

#### New: `create-admin-booking`
- **File**: `supabase/functions/create-admin-booking/index.ts`
- **Purpose**: Creates lesson bookings in Google Calendar from admin panel
- **Key Features**:
  - Validates all required fields (service, date, time, client info, pickup location)
  - Supports both existing and new clients
  - Builds structured event description matching public booking format
  - Stores `is_payment_required` flag in Google Calendar extended properties
  - Uses same calendar as public bookings
  - Time conversion: 12-hour (UI) → 24-hour → local ISO with Melbourne timezone

**Request Payload**:
```json
{
  "appointmentType": "booking",
  "serviceCode": "auto_60",
  "serviceLabel": "Automatic Driving Lesson 1 hr",
  "date": "2025-12-15",
  "startTime": "02:00 PM",
  "endTime": null,
  "clientId": "uuid-or-null",
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@example.com",
  "mobile": "0412345678",
  "pickupLocation": "123 Main St, Melbourne VIC 3000",
  "isPaymentRequired": false
}
```

#### Updated: `gcal-sync`
- **File**: `supabase/functions/gcal-sync/index.ts`
- **Changes**:
  - Extracts `is_payment_required` from Google Calendar extended properties
  - Defaults to `true` if not present
  - Passes value to `upsert_booking_from_google` function

### 3. Frontend: Admin Calendar Modal

#### Extended Modal Form
- **File**: `partials/admin-calendar.html`
- **New Features**:

**Appointment Type Selector** (lines 522-535):
- Radio buttons: "Personal appointment" vs "Lesson booking"
- Toggles between personal appointment fields and booking fields

**Booking-Specific Fields** (lines 571-649):
- **Service dropdown**: 1hr, 1.5hr, 2hr automatic lessons
- **Client mode**: Toggle between "Existing" and "New"
- **Existing client**: Dropdown populated from database (loads on modal open)
- **New client**: First name, last name, email, mobile inputs
- **Pickup address**: Required text field
- **Payment required checkbox**: 
  - Checked by default
  - Label: "Payment required?"
  - Help text: "Uncheck if payment was handled outside the system"

**JavaScript Handlers** (lines 764-1226):
- **Appointment type toggle**: Shows/hides relevant fields
- **Client mode toggle**: Switches between existing/new client fields
- **Client loading**: Fetches all clients from database, populates select
- **Form validation**: 
  - Personal: title, date, start time
  - Booking: service, date, start time, client selection, pickup location
  - Email validation for new clients (contains '@')
  - Address validation (minimum 5 characters)
- **Time conversion**: Converts HTML5 time input (24hr) to 12hr format for API
- **Booking submission**: Calls `create-admin-booking` edge function
- **Success handling**: Polls database for synced event, refreshes calendar
- **Error handling**: Shows user-friendly modals or alerts

## Usage

### Creating an Admin Booking

1. **Open Modal**: Click "New appointment" button in admin calendar
2. **Select Type**: Choose "Lesson booking" radio button
3. **Fill in Details**:
   - Select service (1hr, 1.5hr, or 2hr automatic)
   - Select date and time
   - Choose client (existing or create new)
   - Enter pickup address
   - Toggle payment required checkbox if payment already handled
4. **Submit**: Click "Save"
5. **Wait for Sync**: System polls database (up to 30 seconds) until gcal-sync processes the event
6. **Calendar Refreshes**: New booking appears on calendar automatically

### Payment Flag Behavior

- **Checked (default)**: Booking requires payment (normal flow)
- **Unchecked**: Payment handled outside system (cash, transfer, etc.)
  - Use this when:
    - Client paid cash in person
    - Direct bank transfer already received
    - Payment processed through external system
    - Refund/credit applied

## Data Flow

```
Admin Calendar UI
    ↓ (12-hour time + client info + payment flag)
create-admin-booking Edge Function
    ↓ (converts to local ISO, stores in extended properties)
Google Calendar API
    ↓ (webhook triggers gcal-sync)
gcal-sync Edge Function
    ↓ (extracts is_payment_required from extended properties)
upsert_booking_from_google()
    ↓ (stores in booking table)
Database (booking table with is_payment_required)
    ↓ (refresh triggers)
Admin Calendar Display (updated)
```

## Database Schema

```sql
-- booking table (relevant columns)
ALTER TABLE public.booking
ADD COLUMN is_payment_required boolean DEFAULT true NOT NULL;

-- Function signature
CREATE FUNCTION public.upsert_booking_from_google(
  ...,
  p_is_payment_required boolean DEFAULT true
) RETURNS TABLE(...);
```

## API Reference

### Edge Function: create-admin-booking

**Endpoint**: `{SUPABASE_URL}/functions/v1/create-admin-booking`

**Authentication**: Requires Supabase auth token

**Request Body**:
- `appointmentType`: Must be "booking"
- `serviceCode`: "auto_60" | "auto_90" | "auto_120"
- `serviceLabel`: Display name of service
- `date`: "YYYY-MM-DD"
- `startTime`: "hh:mm AM/PM" (12-hour format)
- `endTime`: "hh:mm AM/PM" or null (derived from service if null)
- `clientId`: UUID or null
- `firstName`: Required if clientId is null
- `lastName`: Optional string
- `email`: Required, must contain '@'
- `mobile`: Required
- `pickupLocation`: Required, min 5 characters
- `isPaymentRequired`: Boolean

**Response**:
```json
{
  "ok": true,
  "googleEvent": {
    "id": "google-event-id",
    "summary": "Automatic Driving Lesson 1 hr (John Smith)",
    ...
  }
}
```

## Testing Checklist

- [ ] Run migrations 009 and 010
- [ ] Deploy `create-admin-booking` edge function
- [ ] Deploy updated `gcal-sync` edge function
- [ ] Test creating booking with existing client
- [ ] Test creating booking with new client
- [ ] Test payment required checkbox (checked)
- [ ] Test payment required checkbox (unchecked)
- [ ] Verify booking appears in admin calendar after sync
- [ ] Verify `is_payment_required` flag stored correctly in database
- [ ] Test validation errors (missing fields)
- [ ] Test time conversion (12hr → 24hr → ISO)

## Future Enhancements

### Optional: Payment Status Display
Add visual indicator on booking cards to show payment status:

```javascript
// In admin-calendar.html, around line 1175
if (!booking.is_payment_required) {
  // Show "Paid" badge in green
  detailsHTML += `<div class="text-xs mt-1" style="color:#059669;">✓ Paid</div>`;
} else {
  // Show "Payment required" badge in amber
  detailsHTML += `<div class="text-xs mt-1" style="color:#d97706;">⚠ Payment required</div>`;
}
```

This would give admins quick visual feedback on which bookings still need payment processing.

## Troubleshooting

### Booking doesn't appear after creation
- Check browser console for polling logs
- Manually trigger gcal-sync: Visit `{SUPABASE_URL}/functions/v1/gcal-sync`
- Check Google Calendar to verify event was created
- Verify webhook is registered and active

### Payment flag not saving
- Check gcal-sync logs: Should see `is_payment_required` extracted from extended properties
- Verify migration 010 was applied successfully
- Check booking table: `SELECT id, is_payment_required FROM booking ORDER BY created_at DESC LIMIT 10;`

### Client dropdown empty
- Check browser console for client loading errors
- Verify RLS policies allow admin to read client table
- Verify admin is authenticated with valid session

## Files Modified/Created

### Created:
- `supabase/migrations/009_add_is_payment_required.sql`
- `supabase/migrations/010_update_upsert_booking_function.sql`
- `supabase/functions/create-admin-booking/index.ts`
- `supabase/functions/create-admin-booking/deno.json`
- `ADMIN_BOOKING_IMPLEMENTATION.md` (this file)

### Modified:
- `supabase/functions/gcal-sync/index.ts` (lines 352-372)
- `partials/admin-calendar.html` (lines 521-1226)

## Notes

- Payment flag is stored in Google Calendar extended properties, ensuring it persists across sync operations
- Default value `true` ensures backward compatibility with existing bookings
- Admin bookings use same calendar and sync process as public bookings for consistency
- Time conversion ensures proper handling of Melbourne timezone (Australia/Melbourne)
- Existing client data is never overwritten, only new fields are added
