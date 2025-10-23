# Deploy Edge Functions - Quick Guide

## Current Issue
The `contact` and `email` functions have CORS errors because they need to be deployed to Supabase.

## Option 1: Deploy via Supabase Dashboard (Easiest)

### Deploy Contact Function
1. Go to **Supabase Dashboard** → **Edge Functions**
2. Find or create the `contact` function
3. Click **Deploy new version**
4. Copy contents from: `supabase/functions/contact/index.ts`
5. Paste and click **Deploy**

### Deploy Email Function
1. Go to **Supabase Dashboard** → **Edge Functions**
2. Find or create the `email` function
3. Click **Deploy new version**
4. Copy contents from: `supabase/functions/email/index.ts`
5. Paste and click **Deploy**

## Option 2: Deploy via CLI

```bash
# Make sure you're logged in
supabase login

# Link to your project (first time only)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy contact function
supabase functions deploy contact

# Deploy email function
supabase functions deploy email

# Deploy all other functions
supabase functions deploy gcal-webhook
supabase functions deploy gcal-register-watch
supabase functions deploy sms
```

## Environment Variables to Set

Make sure these are set in **Supabase Dashboard** → **Edge Functions** → **Settings**:

### For `contact` function:
- `RESEND_API_KEY` - Your Resend API key
- `CONTACT_TO_EMAIL` - Email to receive contact form submissions (default: info@automandrivingschool.com.au)
- `CONTACT_FROM_EMAIL` - From email address (default: no-reply@automandrivingschool.com.au)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

### For `email` function:
- `RESEND_API_KEY` - Your Resend API key

### For `sms` function:
- `CLICKSEND_USERNAME` - Your ClickSend username
- `CLICKSEND_API_KEY` - Your ClickSend API key

### For `gcal-webhook` and `gcal-register-watch`:
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Your Google service account JSON
- `GOOGLE_IMPERSONATE_SUBJECT` - Email to impersonate (if needed)
- `GCAL_CALENDAR_IDS` - Comma-separated calendar IDs
- `GCAL_CHANNEL_TOKEN` - Secret token for webhook verification
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key
- `TIMEZONE` - Australia/Melbourne

## After Deployment

1. Test the contact form on your website
2. Test the email function from admin-messaging panel
3. Check the Supabase Edge Function logs for any errors

## Troubleshooting

### Still getting CORS errors?
- Make sure you deployed the latest version
- Clear browser cache and hard refresh (Ctrl+Shift+R)
- Check the function logs in Supabase Dashboard

### Function not found?
- Make sure the function name matches exactly
- Check that the function is deployed and enabled

### Environment variables not working?
- Make sure they're set in the Supabase Dashboard, not just locally
- Restart the function after setting env vars
