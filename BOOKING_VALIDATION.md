# Booking Validation System

This system validates mobile numbers and pickup locations from Google Calendar bookings, since Google Forms doesn't perform validation.

## Features

- **Mobile Validation**: Australian mobile format (+61 or 04XX XXX XXX)
- **Pickup Location Validation**: Basic address validation (can be enhanced with Google Maps Places API)
- **UI Warnings**: Red text and alert icons for invalid data
- **Editable Fields**: Clients can update mobile and pickup location directly from portal
- **Validation Reset**: When users edit fields, validation flags reset for re-checking

## Database Fields

Added to `booking` table via migration `006_add_booking_validation_fields.sql`:

- `is_mobile_valid` (boolean): NULL = not checked, TRUE = valid, FALSE = invalid
- `is_pickup_location_valid` (boolean): NULL = not checked, TRUE = valid, FALSE = invalid
- `validation_checked_at` (timestamp): When validation last ran

## Setup Instructions

### 1. Apply Database Migration

Run the migration to add validation fields:

```sql
-- In Supabase SQL Editor or via CLI
-- File: supabase/migrations/006_add_booking_validation_fields.sql
```

Or use Supabase CLI:
```bash
supabase migration up
```

### 2. Deploy Edge Function

```bash
cd supabase/functions
supabase functions deploy validate-bookings
```

### 3. Run Initial Validation

**Option A: Via curl**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"all": true}'
```

**Option B: From Supabase Dashboard**
- Go to Edge Functions → validate-bookings
- Click "Invoke Function"
- Body: `{"all": true}`

### 4. Schedule Automatic Validation (Supabase Pro)

In Supabase SQL Editor:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily at 2 AM
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
```

**Alternative: GitHub Actions (Free)**

Create `.github/workflows/validate-bookings.yml`:

```yaml
name: Validate Bookings
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC
  workflow_dispatch: # Manual trigger

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger validation
        run: |
          curl -X POST ${{ secrets.SUPABASE_URL }}/functions/v1/validate-bookings \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"all": false}'
```

## How It Works

### Smart Validation

The system only validates bookings that haven't been checked yet (`validation_checked_at IS NULL`). This means:
- Each booking is validated only once
- When a client edits mobile or pickup location, the validation flag resets to `NULL`
- Next validation run will re-check the edited booking
- No redundant validation of unchanged data

### Mobile Validation

Australian mobile number format:
- Starts with `+61` or `0`
- Followed by `4` or `5` (mobile prefix)
- Followed by 8 digits
- Examples: `+61412345678`, `0412345678`, `0512345678`

```javascript
const australianMobileRegex = /^(\+61|0)[4-5]\d{8}$/;
```

### Pickup Location Validation

Basic validation checks:
- Minimum 5 characters
- Contains at least 2 letters
- Not obvious test data ("test", "123", "asdf", etc.)
- Can be enhanced with Google Maps Places API for geocoding

### UI Display

**Valid Data**:
```
📱 0412 345 678
📍 123 Main St, Sydney NSW 2000
```

**Invalid Data**:
```
❌ Invalid mobile format
📱 0412 (red text)
   [edit]

❌ Please provide a valid address
📍 123 (red text)
   [edit]
```

### Edit Functionality

1. Client clicks "edit" button next to mobile or pickup location
2. Browser prompt shows current value
3. Client enters new value
4. System updates database and resets validation:
   - Sets field-specific flag to `NULL` (e.g., `is_mobile_valid = NULL`)
   - Sets `validation_checked_at = NULL` (triggers re-validation)
5. Next validation run will automatically re-check the updated booking

## Validation Script Usage

**Supabase Edge Function**

```bash
# Validate all bookings (including past)
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"all": true}'

# Validate bookings from specific date onwards
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"since": "2024-01-01"}'

# Default: validates bookings from today onwards
curl -X POST https://your-project.supabase.co/functions/v1/validate-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Output Example

**Edge Function Response:**
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

## Future Enhancements

### Google Maps Places API Integration

For more accurate address validation:

1. **Enable Google Maps Places API**
   - Go to Google Cloud Console
   - Enable "Places API" and "Geocoding API"
   - Get API key (restrict to your domain)

2. **Update validation script**:
   ```javascript
   async function validatePickupLocationWithGoogle(address) {
     const response = await fetch(
       `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
     );
     const data = await response.json();
     return data.status === 'OK' && data.results.length > 0;
   }
   ```

3. **Add autocomplete to booking form**
   - Use Places Autocomplete widget
   - Pre-validate as user types

### Notification System

Send emails/SMS to clients with invalid data:
- Daily digest of bookings needing updates
- Automated reminder 24h before lesson if data still invalid

### Admin Dashboard

Add to `admin.html`:
- "Bookings with Invalid Data" section
- Bulk edit capability
- One-click "Call Client" for mobile validation

## Troubleshooting

### Edge function fails to deploy
- Ensure Supabase CLI is installed: `npm install -g supabase`
- Login: `supabase login`
- Link project: `supabase link --project-ref your-project-ref`

### Function returns 401 Unauthorized
- Check you're using the correct Anon Key (not Service Role Key for manual calls)
- For pg_cron: Use Anon Key or Service Role Key in the cron job

### Validation not showing in portal
- Check migration applied: `SELECT is_mobile_valid FROM booking LIMIT 1;`
- Trigger validation function manually
- Refresh portal page (Ctrl+F5)
- Check browser console for errors

### Edge function timeout
- Function has 60-second limit
- For large datasets, add pagination or use `{"all": false}`
- Process in smaller batches

### pg_cron not available
- Requires Supabase Pro plan
- Alternative: Use GitHub Actions (free) - see `.github/GITHUB_ACTIONS_VALIDATION.md`

### Edit button not working
- Check browser console for errors
- Ensure `window.editBookingField` is defined
- Verify Supabase RLS policies allow client updates

### Edit button not working
- Check browser console for errors
- Ensure `window.editBookingField` is defined
- Verify Supabase RLS policies allow client updates

## Security Notes

- **Service Role Key**: Used by validation script only (server-side)
- **Client Portal**: Uses anon key with RLS policies
- **RLS Policies**: Ensure clients can only update their own bookings
- **Validation Reset**: Prevents malicious marking as "valid" (only script can set TRUE)

## File Reference

- **Migration**: `supabase/migrations/006_add_booking_validation_fields.sql`
- **Edge Function**: `supabase/functions/validate-bookings/index.ts`
- **Function Docs**: `supabase/functions/validate-bookings/README.md`
- **GitHub Actions**: `.github/workflows/validate-bookings.yml`
- **GitHub Actions Guide**: `.github/GITHUB_ACTIONS_VALIDATION.md`
- **UI Implementation**: `portal.html` - renderBookingCard() and editBookingField()
- **Documentation**: This file
