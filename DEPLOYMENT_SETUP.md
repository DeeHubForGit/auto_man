# Deployment Setup Guide

## Supabase Configuration for Production

### Step 1: Get Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Click on **Settings** (gear icon) → **API**
3. Copy these two values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (the long string under "Project API keys")

### Step 2: Update config.js

Open `assets/config.js` and replace the placeholders:

```javascript
SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
```

### Step 3: Deploy

Commit and push your changes. The site will now work in production!

## Security FAQ

### Q: Is it safe to expose the ANON_KEY in public code?

**Yes!** The `anon` key is designed to be public. Here's why it's safe:

1. **Row Level Security (RLS)** protects your data
   - Users can only access their own records
   - Policies enforce `auth.email() = email` checks
   - Service role key (secret) is never exposed

2. **The ANON_KEY has limited permissions**
   - Can only do what RLS policies allow
   - Cannot bypass security rules
   - Cannot access admin functions

3. **This is standard practice**
   - Firebase, Auth0, Clerk all expose public keys
   - Supabase documentation recommends this approach
   - Your RLS policies are the real security layer

### Q: What should NEVER be exposed?

**Service Role Key** - This bypasses RLS and should only be used server-side (e.g., in your gcal-sync backend).

## Files to Keep Secret

- `assets/js/config.local.js` - Already in `.gitignore` ✅
- Any file with `SERVICE_ROLE_KEY`
- Backend API keys (Google Calendar, etc.)

## Current Security Setup

✅ RLS enabled on `client` and `booking` tables
✅ Users can only access their own data
✅ Admin role checked server-side
✅ Service role key kept secret in backend
✅ ANON_KEY safely exposed for client-side auth
