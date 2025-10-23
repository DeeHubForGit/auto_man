# Supabase Setup Instructions

## Problem: "Supabase not connected" error

This happens when the Supabase credentials are not configured in your local environment.

## Solution

### 1. Create the config file

Copy the template to create your local config:

```bash
copy assets\js\config.local.TEMPLATE.js assets\js\config.local.js
```

Or manually create: `assets/js/config.local.js`

### 2. Get your Supabase credentials

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **Auto-Man Project**
3. Go to: **Project Settings** → **API**
4. Copy:
   - **Project URL** (e.g., `https://abcdefghijklmnop.supabase.co`)
   - **anon/public key** (the long JWT token starting with `eyJ...`)

### 3. Add credentials to config.local.js

Edit `assets/js/config.local.js` and replace the placeholders:

```javascript
// Set as direct globals (for supabaseClient.js)
window.SUPABASE_URL = 'https://YOUR_ACTUAL_PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...YOUR_ACTUAL_KEY';

// Also add to SITE_CONFIG (for auth-scripts.html)
if (window.SITE_CONFIG) {
  window.SITE_CONFIG.SUPABASE_URL = window.SUPABASE_URL;
  window.SITE_CONFIG.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  
  window.SITE_CONFIG.ADMIN_EMAILS = [
    'darren@automandrivingschool.com.au'
  ];
}
```

### 4. Verify it's working

1. Reload the admin page
2. Open browser console (F12)
3. You should see:
   - `[supabaseClient] restored session: true/false`
   - `[auth] restored session: true/false`
   - `[admin] loadClientOptions called`
   - `[admin] supabaseClient exists: true`

### 5. Grant database permissions

Run this SQL in Supabase SQL Editor to allow the admin page to read data:

```sql
-- Grant read access to tables
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.client TO anon, authenticated;
GRANT SELECT ON TABLE public.contact_messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.client_progress TO authenticated;
```

### 6. Create missing tables

If you see "relation does not exist" errors, run the migration:

```sql
-- Copy and paste from: supabase/migrations/20250422_contact_and_progress.sql
```

## Security Notes

- ✅ `config.local.js` is gitignored - never commit it
- ✅ The anon key is safe to use in frontend code (it's public)
- ✅ Row Level Security (RLS) policies protect sensitive data
- ✅ Admin access is controlled by `ADMIN_EMAILS` list

## Troubleshooting

**Still seeing "Supabase not connected"?**
- Check browser console for errors
- Verify `config.local.js` exists in `assets/js/`
- Verify credentials are correct (no typos, no quotes inside the strings)
- Hard refresh the page (Ctrl+Shift+R)

**"Permission denied" errors?**
- Run the GRANT SQL statements above
- Check if RLS is enabled on tables (can disable for testing)

**"You do not have access to this page"?**
- Add your email to `ADMIN_EMAILS` in `config.local.js`
- Make sure you're logged in (click Login button)
