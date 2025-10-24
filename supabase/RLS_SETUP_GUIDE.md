# RLS (Row Level Security) Setup Guide

## Problem
After enabling RLS on all tables, users get "0 rows" error when trying to access their data. This is because RLS blocks ALL access unless explicit policies allow it.

## Solution
Run the updated `RLS_POLICIES_ADMIN_FIX.sql` file which:
1. Removes old conflicting policies (the ones using `auth.role()`)
2. Sets up proper policies using `TO authenticated` and `TO service_role`
3. Uses `auth.jwt()->>'email'` for user identification

## Files to Run (in order)

### Option 1: Run the comprehensive fix (RECOMMENDED)
```sql
-- Run this file in Supabase SQL Editor
supabase/RLS_POLICIES_FIX.sql
```

### Option 2: Run individual migration files
```sql
-- Run these in order:
supabase/migrations/003_client_rls_policies.sql
supabase/migrations/004_booking_rls_policies.sql
supabase/migrations/005_fix_all_rls_policies.sql
```

## What the Policies Do

### Client Table
- ✅ **Authenticated users** can read/insert/update their OWN client record (matched by email)
- ✅ **Service role** has full access (for backend operations)

### Booking Table
- ✅ **Authenticated users** can read their OWN bookings (matched by email)
- ✅ **Service role** has full access (for gcal-sync and other backend operations)

### Other Tables (gcal_*, sms_*, email_log, etc.)
- ✅ **Service role only** - these are backend-only tables

### Public Tables (package, service)
- ✅ **Authenticated users** can read active packages/services
- ✅ **Service role** has full access

## Key Differences from Previous Script

### OLD (Incorrect)
```sql
CREATE POLICY "Allow service role full access"
ON public.client
FOR ALL
USING (auth.role() = 'service_role');  -- ❌ This doesn't work properly
```

### NEW (Correct)
```sql
CREATE POLICY "Service role full access client"
ON public.client
FOR ALL
TO service_role  -- ✅ Explicitly targets service_role
USING (true);    -- ✅ Always allows for service_role
```

## Verification

After running the script, verify policies are in place:

```sql
-- Check all policies
SELECT tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- Check client table specifically
SELECT * FROM pg_policies WHERE tablename = 'client';

-- Check booking table specifically
SELECT * FROM pg_policies WHERE tablename = 'booking';
```

## Testing

1. **Test as authenticated user:**
   - Log in to the portal
   - Should see your own profile data
   - Should see your own bookings
   - Should NOT see other users' data

2. **Test backend operations:**
   - Run gcal-sync function
   - Should successfully insert/update bookings
   - Check logs for any RLS errors

## Troubleshooting

### Still getting "0 rows" error?
1. Check that policies were created: `SELECT * FROM pg_policies WHERE tablename = 'client';`
2. Verify user email matches: Check `auth.users` table vs `client.email`
3. Check browser console for detailed error messages

### Backend operations failing?
1. Verify you're using the **service_role** key (not anon key) in backend functions
2. Check that service_role policies exist for all tables
3. Look for "permission denied" errors in function logs
