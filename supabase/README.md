# Supabase Integration - Google Calendar Booking Capture

## Overview
This integration captures Google Calendar booking data and stores it in Supabase for CRM, SMS reminders, and email customization.

## What's Already Set Up
✅ Supabase client configuration (`assets/js/supabaseClient.js`)
✅ Authentication system (`assets/js/auth.js`)
✅ Login/signup pages

## What We're Adding
📋 Database schema for bookings, clients, SMS/email logs
🔗 Google Calendar webhook handler (Edge Function)
📊 CRM database to track all client bookings

## Next Steps

### 1. Run the Database Schema
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your Auto-Man project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `supabase/schema.sql`
6. Paste and click **Run**

This creates these tables:
- `clients` - Customer records (email, name, phone, etc.)
- `bookings` - Lesson bookings from Google Calendar
- `sms_logs` - Track SMS reminder sends
- `email_logs` - Track email sends
- `packages` - Lesson bundle packages
- `client_credits` - Track package purchases and usage

### 2. Deploy the Webhook Edge Function

The Edge Function (`supabase/functions/google-calendar-webhook/index.ts`) receives Google Calendar events and stores them in the database.

**To deploy:**
```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy google-calendar-webhook
```

Your webhook URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-calendar-webhook
```

### 3. Configure Google Calendar Webhook

You'll need to set up Google Calendar to send events to your Supabase Edge Function:

**Option A: Using Google Calendar API Push Notifications**
1. Enable Google Calendar API in Google Cloud Console
2. Set up a watch request to your webhook URL
3. Google will send notifications when events are created/updated

**Option B: Using Zapier/Make.com (Easier)**
1. Create a Zap/Scenario: "New Google Calendar Event" → "Webhook POST"
2. Set webhook URL to your Supabase function
3. Map the event data fields

**Option C: Manual Testing**
Use the test script to simulate webhook calls (see below)

### 4. Test the Integration

Use this curl command to test your webhook:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-calendar-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "event": {
      "id": "test123",
      "summary": "Driving Lesson - Test Client",
      "start": {
        "dateTime": "2025-10-20T10:00:00+11:00",
        "timeZone": "Australia/Melbourne"
      },
      "end": {
        "dateTime": "2025-10-20T11:00:00+11:00",
        "timeZone": "Australia/Melbourne"
      },
      "attendees": [
        {
          "email": "test@example.com",
          "displayName": "Test Client"
        }
      ],
      "extendedProperties": {
        "shared": {
          "serviceType": "auto-1hr",
          "duration": "1 hour",
          "price": "85"
        }
      }
    },
    "calendarId": "primary"
  }'
```

### 5. Verify Data in Supabase

1. Go to **Table Editor** in Supabase Dashboard
2. Check the `clients` table - you should see the test client
3. Check the `bookings` table - you should see the test booking

## Environment Variables Needed

Make sure these are set in your Supabase project:
- `SUPABASE_URL` - Your project URL (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-set)

For SMS/Email (coming next):
- `CLICKSEND_API_KEY` - For SMS reminders
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - For custom emails

## What's Next?

After this is working:
1. ✅ **Step 1: CRM Database** (this step)
2. 📱 **Step 2: SMS Reminders** - Send 24h before lesson
3. 📧 **Step 3: Email Customization** - Branded confirmation emails
4. 🌐 **Step 4: Client Portal** - Show bookings on website
5. 📦 **Step 5: Packages** - Track lesson bundles

## Troubleshooting

**"Function not found"**
- Make sure you deployed the Edge Function
- Check the function name matches exactly

**"Client/Booking not created"**
- Check Supabase logs in Dashboard → Edge Functions → Logs
- Verify the schema was run successfully
- Check that email is provided in the webhook data

**"CORS error"**
- The function includes CORS headers
- Make sure you're sending the Authorization header
