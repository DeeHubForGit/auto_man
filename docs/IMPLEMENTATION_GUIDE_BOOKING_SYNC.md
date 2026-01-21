# Booking Sync Implementation Guide

## Problem Solved
User/admin edits to `mobile` and `pickup_location` in the database were being overwritten by the next Google Calendar sync because Google's description field can be corrupted by UI quirks (formatting changes, emojis, extra lines).

## Solution Architecture

### 1. **Stable Source of Truth: extendedProperties.shared**
We now store `mobile` and `pickup_location` in `extendedProperties.shared` on Google Calendar events. These properties:
- Are immune to Google UI formatting quirks
- Cannot be accidentally edited by users in Google Calendar UI
- Persist reliably across sync operations

### 2. **Three-Layer Update System**

#### Layer 1: Create Booking (`create-admin-booking` Edge Function)
**File:** `supabase/functions/create-admin-booking/index.ts`

When creating a booking from admin UI:
```typescript
extendedProperties: {
  shared: {
    service_code: serviceCode,
    created_by: "admin",
    is_paid: isPaid ? "true" : "false",
    is_booking: "true",
    mobile: safeMobile,              // ← STABLE SOURCE
    pickup_location: safePickup,     // ← STABLE SOURCE
  },
}
```

#### Layer 2: Update Booking (`update-booking-in-google` Edge Function)
**File:** `supabase/functions/update-booking-in-google/index.ts`

When mobile/pickup changes in DB, this function:
1. Updates `event.location` (for map display)
2. Updates `event.description` (for visual display in Google UI)
3. **Updates `extendedProperties.shared.mobile` and `.pickup_location`** (stable source)

```typescript
patchBody.extendedProperties = {
  shared: {
    ...currentEvent.extendedProperties?.shared,
    mobile: booking.mobile,                    // ← STABLE SOURCE
    pickup_location: booking.pickup_location   // ← STABLE SOURCE
  }
};
```

#### Layer 3: Sync from Google (`gcal-sync` Edge Function)
**File:** `supabase/functions/gcal-sync/index.ts`

Priority order (highest to lowest):
1. **extendedProperties.shared.mobile/pickup_location** ← PRIMARY SOURCE
2. Description parsing (legacy fallback)
3. Location field (pickup fallback)

```typescript
// Start with extendedProperties.shared (stable source of truth)
const shared = e.extendedProperties?.shared || {};
let mobile = shared.mobile?.trim() || null;
let pickup = shared.pickup_location?.trim() || null;

// Only use description mobile/pickup if extendedProperties don't have them (legacy)
if (!mobile && fromDesc.mobile) {
  mobile = fromDesc.mobile;
}
if (!pickup && fromDesc.pickup) {
  pickup = fromDesc.pickup;
}
```

## Admin UI Integration Required

### When User/Admin Edits Mobile or Pickup in UI

**You need to add this to your admin calendar UI** (e.g., `partials/admin-calendar.html`):

```javascript
// After updating booking in Supabase
async function updateBookingFieldAndSyncToGoogle(bookingId, fieldName, newValue) {
  try {
    // Step 1: Update Supabase DB
    const { error: dbError } = await window.supabaseClient
      .from('booking')
      .update({ [fieldName]: newValue })
      .eq('id', bookingId);
    
    if (dbError) {
      console.error('Failed to update booking in DB:', dbError);
      alert('Failed to save changes');
      return;
    }
    
    // Step 2: Immediately sync to Google Calendar
    const { data, error: syncError } = await window.supabaseClient.functions.invoke(
      'update-booking-in-google',
      {
        body: {
          booking_id: bookingId,
          fields: [fieldName] // e.g., ['mobile'] or ['pickup_location']
        }
      }
    );
    
    if (syncError) {
      console.error('Failed to sync to Google:', syncError);
      // DB is updated but Google sync failed - this is OK, next gcal-sync will fix it
      console.log('⚠️ DB updated successfully, but Google sync failed. Will sync on next gcal-sync run.');
    } else {
      console.log('✅ Booking updated in both DB and Google Calendar');
    }
    
  } catch (err) {
    console.error('Error updating booking:', err);
    alert('An error occurred while saving changes');
  }
}

// Example usage when mobile field changes:
// updateBookingFieldAndSyncToGoogle(bookingId, 'mobile', newMobileValue);

// Example usage when pickup field changes:
// updateBookingFieldAndSyncToGoogle(bookingId, 'pickup_location', newPickupValue);
```

### Where to Add This in Your UI

Look for code that updates booking fields in your admin calendar. You'll likely have:
- Mobile number edit field
- Pickup address edit field

Add the `updateBookingFieldAndSyncToGoogle()` call after the user saves their changes.

**Example integration points:**
- `blur` event handler on input fields
- "Save" button click handler
- Inline edit completion handlers

## Benefits

### ✅ Prevents Data Loss
User edits to mobile/pickup are immediately written to Google's stable `extendedProperties`, so even if Google Calendar description gets corrupted, the next sync will restore the correct values from `extendedProperties`.

### ✅ Idempotent Sync
If gcal-sync runs again after you update Google, it will:
1. Read the corrected values from `extendedProperties.shared`
2. Write those same values back to DB
3. No data corruption occurs

### ✅ No Double-Update Loop
The sync is idempotent - running sync again with the same Google data produces the same DB state.

### ✅ Legacy Support
Old events without `extendedProperties` will continue to work via description parsing fallback.

### ✅ Payment Fields Ignored
Payment status changes in DB don't trigger Google sync (Google doesn't need to know about payment status).

## Testing Checklist

1. ✅ **Create new booking from admin UI**
   - Verify `extendedProperties.shared.mobile` and `.pickup_location` are set in Google Calendar

2. ✅ **Edit mobile in admin UI**
   - Verify DB updates
   - Verify Google Calendar description updates
   - Verify `extendedProperties.shared.mobile` updates
   - Run gcal-sync - verify DB value stays the same (idempotent)

3. ✅ **Edit pickup in admin UI**
   - Verify DB updates
   - Verify Google Calendar `location` and `description` update
   - Verify `extendedProperties.shared.pickup_location` updates
   - Run gcal-sync - verify DB value stays the same (idempotent)

4. ✅ **Manually corrupt description in Google Calendar UI**
   - Add extra lines, emojis, format changes to mobile/pickup lines
   - Run gcal-sync
   - Verify DB still has correct values from `extendedProperties.shared`

5. ✅ **Test legacy event (no extendedProperties)**
   - Create event directly in Google Calendar (old way)
   - Run gcal-sync
   - Verify it falls back to description parsing

## Deployment Order

1. Deploy Edge Functions:
   - `gcal-sync` (reads extendedProperties)
   - `update-booking-in-google` (writes extendedProperties)
   - `create-admin-booking` (writes extendedProperties)

2. Update admin UI to call `update-booking-in-google` when mobile/pickup changes

3. Test thoroughly in development before deploying to production

## Notes

- **Payment fields are never synced to Google** - they only exist in Supabase DB
- **Google Calendar remains the source of truth for booking times** - don't edit those in DB directly
- **extendedProperties have a 1KB limit per event** - we're well within this limit
- **Service accounts can't modify extendedProperties.private** - always use `.shared`
