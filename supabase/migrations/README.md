# Database Migrations

## How to Apply Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of the migration file
5. Paste and run the SQL

### Option 2: Using Supabase CLI

```bash
# Make sure you're in the project root
cd "c:\Dee\Work\Auto man\auto-man-site"

# Apply the migration
supabase db push
```

## Migrations

### 001_auth_user_to_client.sql

**Purpose:** Automatically create a client record when a user signs up

**What it does:**
- Creates a trigger on `auth.users` table
- When a new user signs up, automatically creates a matching record in `public.client` table
- Uses the same UUID for both auth user and client record for easy linking
- Prevents duplicates with `ON CONFLICT DO NOTHING`

**To apply manually:**

```sql
-- Copy and paste the contents of 001_auth_user_to_client.sql
-- into the Supabase SQL Editor and run it
```

## Testing the Migration

After applying the migration:

1. Sign up a new user on your site
2. Check the `public.client` table in Supabase
3. You should see a new record with:
   - `id` matching the auth user's UUID
   - `email` from the signup form
   - `created_at` and `updated_at` timestamps

## Troubleshooting

### "Permission denied for table auth.users"

This means you need to run the migration as a superuser. Use the Supabase Dashboard SQL Editor which runs with proper permissions.

### Existing Users Not in Client Table

The trigger only works for NEW signups. To backfill existing users:

```sql
-- Backfill existing auth users into client table
INSERT INTO public.client (id, email, created_at, updated_at)
SELECT 
  id,
  email,
  created_at,
  NOW() as updated_at
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;
```

## Next Steps

After applying the migration:
1. Test by signing up a new user
2. Verify the client record is created automatically
3. Update your application code to use the client records
