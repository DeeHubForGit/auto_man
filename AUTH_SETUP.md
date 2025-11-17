# Authentication Setup Guide

## Quick Setup

To enable Sign Up and Login functionality, you need to configure your Supabase credentials.

### 1. Get Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (or create a new one)
3. Go to **Project Settings** → **API**
4. Copy these two values:
   - **Project URL** (e.g., `https://ugxxxvhanwckgciaedna.supabase.co`)
   - **anon public** key (the long string under "Project API keys")

### 2. Configure Your Local Environment

1. Open the file: `assets/js/config.js`
2. Replace the placeholder values with your actual Supabase credentials:

```javascript
window.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 3. Test Authentication

1. Open your site in a browser
2. Click the **Sign Up** button in the header
3. Enter an email and password (minimum 6 characters)
4. Check your email for the confirmation link
5. After confirming, you can log in with your credentials

## Troubleshooting

### "Auth not configured" Error

This means your Supabase credentials are not set up correctly.

**Solution:**
1. Check that `assets/js/config.js` exists and has valid credentials
2. Make sure the Supabase URL and anon key are correct
3. Clear your browser cache and reload

### Email Confirmation Not Received

**Solution:**
1. Check your spam folder
2. In Supabase Dashboard → Authentication → Email Templates, verify email settings
3. For development, you can disable email confirmation in Supabase Dashboard → Authentication → Providers → Email → "Confirm email" toggle

## Security Notes

- ✅ The **anon key** is safe to expose in the browser
- ❌ **Never** use the service_role key in browser code

