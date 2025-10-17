# Client Record Creation Fix

## Problem
When users sign up via the website, Supabase creates an auth user but no corresponding record is created in the `public.client` table.

## Solution
Implemented a database trigger that automatically creates a client record whenever a new user signs up.

## Files Created

### 1. Migration Files
- `supabase/migrations/001_auth_user_to_client.sql` - Main trigger
- `supabase/migrations/002_backfill_existing_users.sql` - Backfill existing users
- `supabase/migrations/README.md` - Migration instructions

### 2. Updated Files
- `supabase/schema.sql` - Added trigger for future deployments

## How to Fix Your Database

### Step 1: Apply the Trigger Migration

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor**
3. Copy and paste this SQL:

```sql
-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

4. Click **Run**

### Step 2: Backfill Your Existing User

Run this SQL to add your confirmed user to the client table:

```sql
INSERT INTO public.client (id, email, created_at, updated_at)
SELECT 
  id,
  email,
  created_at,
  NOW() as updated_at
FROM auth.users
WHERE email IS NOT NULL
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (email) DO UPDATE
  SET updated_at = NOW();
```

### Step 3: Verify It Works

1. Check your client table - you should now see your user
2. Sign up a new test user
3. Confirm their email
4. Check the client table again - the new user should appear automatically

## What the Trigger Does

- **Watches** the `auth.users` table for new signups
- **Automatically creates** a matching record in `public.client` table
- **Uses same UUID** for both auth user and client (makes linking easy)
- **Prevents duplicates** with conflict handling
- **Runs securely** with SECURITY DEFINER

## Benefits

✅ No manual client record creation needed
✅ Client records created instantly on signup
✅ Same UUID links auth user to client record
✅ Works for all future signups automatically
✅ Handles edge cases (duplicates, missing data)

## Testing

After applying the migration:

1. **Test new signup:**
   ```
   - Go to your site
   - Click Sign Up
   - Enter email and password
   - Confirm email
   - Check client table → new record should exist
   ```

2. **Verify data:**
   ```sql
   SELECT 
     c.id,
     c.email,
     c.created_at,
     u.email_confirmed_at
   FROM public.client c
   JOIN auth.users u ON c.id = u.id;
   ```

## Troubleshooting

### Client record not created?

1. Check if trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

2. Check function exists:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
   ```

### Need to manually create a client record?

```sql
INSERT INTO public.client (id, email, created_at, updated_at)
VALUES (
  'user-uuid-here',
  'user@example.com',
  NOW(),
  NOW()
);
```

## Future Enhancements

Consider adding to the trigger:
- Extract first/last name from user metadata
- Set default preferences
- Send welcome email
- Create initial credits/packages
