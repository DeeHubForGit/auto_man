# Google Calendar Cancellation Setup

## Overview
This feature allows admins and clients to cancel bookings, which automatically cancels the corresponding Google Calendar event.

## Files Modified/Created

### Frontend Files:
1. **`assets/js/googleCalendar.js`** (NEW)
   - Shared utility for Google Calendar cancellation
   - `cancelEvent()` - Calls Supabase Edge Function
   - `cancelBooking()` - Handles both Google Calendar and database updates

2. **`partials/admin-calendar.html`** (MODIFIED)
   - Added `data-google-event-id` attribute to status dropdowns
   - Confirmation modal when admin selects "Cancelled"
   - Integrated Google Calendar cancellation into status update

3. **`portal.html`** (MODIFIED)
   - Added "Cancel Booking" button to upcoming confirmed bookings
   - Confirmation modal before cancellation
   - Button shows loading state during operation

### Backend Files:
4. **`supabase/functions/cancel-google-event/index.ts`** (NEW)
   - Supabase Edge Function to cancel Google Calendar events
   - Uses service account authentication
   - Handles 404 errors gracefully (event already deleted)

## Deployment Steps

### 1. Deploy the Edge Function

```bash
# Make sure you're logged in to Supabase CLI
supabase login

# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the cancel-google-event function
supabase functions deploy cancel-google-event
```

### 2. Set Environment Variables

The function needs the same environment variables as your other Google Calendar functions. Make sure these are set in **Supabase Dashboard** → **Edge Functions** → **Settings**:

- `GOOGLE_SERVICE_ACCOUNT_JSON` - Your Google service account JSON (same as gcal-sync)
- `GCAL_CALENDAR_IDS` - Comma-separated calendar IDs (same as gcal-sync)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

**Note:** These should already be set if you have other Google Calendar functions deployed.

### 3. Test the Function

You can test the function directly from the Supabase Dashboard or using curl:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/cancel-google-event \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "TEST_EVENT_ID", "bookingId": "TEST_BOOKING_ID"}'
```

### 4. Deploy Frontend Changes

Commit and push your changes to deploy the frontend:

```bash
git add .
git commit -m "Add Google Calendar cancellation feature"
git push
```

## How It Works

### Admin Cancellation Flow:
1. Admin opens admin calendar
2. Admin changes booking status dropdown to "Cancelled"
3. Confirmation modal appears: "Are you sure you want to cancel this booking?"
4. If admin confirms:
   - Frontend calls `GoogleCalendar.cancelBooking()`
   - Function calls Supabase Edge Function to cancel in Google Calendar
   - If Google succeeds → Database updated to 'cancelled'
   - If Google fails → Database NOT updated, error shown, dropdown reverts
5. If admin cancels confirmation → Dropdown reverts to original status

### Client Cancellation Flow:
1. Client views their upcoming bookings in portal
2. Client clicks "Cancel Booking" button (red)
3. Confirmation modal appears: "Are you sure you want to cancel this booking?"
4. If client confirms:
   - Button shows "Cancelling..." and is disabled
   - Frontend calls `GoogleCalendar.cancelBooking()`
   - Function calls Supabase Edge Function to cancel in Google Calendar
   - If Google succeeds → Database updated to 'cancelled', success modal shown
   - If Google fails → Database NOT updated, error modal shown, button re-enabled
5. If client cancels confirmation → Nothing happens

### Error Handling:
- **Google Calendar fails** → Database is NOT updated (keeps data in sync)
- **Event not found (404)** → Treated as success (event already deleted)
- **No Google event ID** → Only database is updated (booking never synced to Google)
- **Network errors** → Clear error messages shown to user

## Testing Checklist

### Admin Calendar:
- [ ] Open admin calendar and find a confirmed booking
- [ ] Change status to "Cancelled"
- [ ] Verify confirmation modal appears
- [ ] Click "Cancel Booking" to confirm
- [ ] Verify event is cancelled in Google Calendar
- [ ] Verify booking status is "cancelled" in database
- [ ] Try cancelling again - should show 404 but treat as success

### Client Portal:
- [ ] Login as a client with upcoming bookings
- [ ] Find a confirmed booking
- [ ] Click "Cancel Booking" button
- [ ] Verify confirmation modal appears
- [ ] Click "Cancel Booking" to confirm
- [ ] Verify button shows "Cancelling..." during operation
- [ ] Verify success modal appears
- [ ] Verify event is cancelled in Google Calendar
- [ ] Verify booking disappears from "Upcoming" and appears in "Cancelled"

### Error Cases:
- [ ] Test with invalid Google event ID - should show error
- [ ] Test with booking that has no Google event ID - should update database only
- [ ] Test cancelling confirmation modal - should revert/do nothing

## Troubleshooting

### "Unknown error" in console
- Make sure the `cancel-google-event` function is deployed
- Check Supabase Edge Function logs for detailed errors
- Verify environment variables are set correctly

### "Supabase configuration not found"
- Make sure `assets/config.js` is loaded before `googleCalendar.js`
- Check that `window.CONFIG.SUPABASE_URL` and `window.CONFIG.SUPABASE_ANON_KEY` are defined

### Google Calendar event not cancelled
- Check the Edge Function logs in Supabase Dashboard
- Verify `GOOGLE_SERVICE_ACCOUNT_JSON` is set correctly
- Verify the service account has edit access to the calendar
- Check that `GCAL_CALENDAR_IDS` includes the correct calendar

### Database not updated after Google cancellation
- This is expected behavior - if Google fails, database should NOT update
- Check browser console for error messages
- Verify the booking has a valid `google_event_id`

## Security Notes

- The Edge Function uses the **service account** to cancel events (not user credentials)
- The frontend uses the **anon key** to call the Edge Function (safe for public use)
- CORS is enabled for the Edge Function to allow frontend calls
- No sensitive data is exposed in error messages

## Future Enhancements

Possible improvements:
- Add cancellation reason field
- Send cancellation notification emails/SMS
- Add "Undo" functionality (within a time window)
- Support bulk cancellation for admins
- Add audit log for who cancelled what and when
