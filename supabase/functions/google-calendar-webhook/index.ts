// Supabase Edge Function to handle Google Calendar webhook events
// This captures booking data when a Google Calendar event is created

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to extract service code from event summary
function extractServiceCode(summary: string): string {
  const lower = summary.toLowerCase()
  
  // Match patterns like "automatic 1 hour", "auto 90 min", etc.
  if (lower.includes('senior') && lower.includes('auto')) return 'senior_auto_60'
  if (lower.includes('auto') || lower.includes('automatic')) {
    if (lower.includes('2 hour') || lower.includes('120')) return 'auto_120'
    if (lower.includes('1.5 hour') || lower.includes('90')) return 'auto_90'
    return 'auto_60' // default
  }
  
  return 'auto_60' // fallback
}

// Helper function to extract price from event summary
function extractPrice(summary: string): string {
  // Match patterns like "$85", "$125.50", "85"
  const match = summary.match(/\$?(\d+(?:\.\d{2})?)/)
  return match ? match[1] : '85' // default to $85
}

interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus: string
  }>
  extendedProperties?: {
    shared?: {
      serviceType?: string
      serviceCode?: string
      price?: string
      duration?: string
      mobile?: string
      phone?: string
      pickupLocation?: string
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse the incoming webhook data
    const payload = await req.json()
    console.log('Received webhook:', JSON.stringify(payload, null, 2))

    // Extract event data from Google Calendar webhook
    const event: GoogleCalendarEvent = payload.event || payload
    
    if (!event.id || !event.start || !event.attendees || event.attendees.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid event data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract client info from first attendee
    const clientEmail = event.attendees[0].email
    const clientName = event.attendees[0].displayName || ''
    const [firstName, ...lastNameParts] = clientName.split(' ')
    const lastName = lastNameParts.join(' ')

    // Extract mobile from extended properties or description
    const mobile = event.extendedProperties?.shared?.mobile || 
                   event.extendedProperties?.shared?.phone || ''

    // Extract service details from event summary or extended properties
    // Example: "Automatic Driving Lesson 1 hour $85"
    const serviceCode = event.extendedProperties?.shared?.serviceCode || 
                        extractServiceCode(event.summary)
    
    // Parse price from extended properties or summary (stored as cents)
    const priceString = event.extendedProperties?.shared?.price || 
                        extractPrice(event.summary)
    const priceCents = Math.round(parseFloat(priceString) * 100)

    // Extract pickup location from description or extended properties
    const pickupLocation = event.extendedProperties?.shared?.pickupLocation || 
                          event.description || ''

    // Call the database function to upsert client and booking
    const { data, error } = await supabase.rpc('upsert_booking_from_google', {
      p_google_event_id: event.id,
      p_calendar_id: payload.calendarId || 'primary',
      p_client_email: clientEmail,
      p_first_name: firstName || '',
      p_last_name: lastName || '',
      p_mobile: mobile,
      p_service_code: serviceCode,
      p_price_cents: priceCents,
      p_start: event.start.dateTime,
      p_end: event.end.dateTime,
      p_pickup: pickupLocation,
      p_extended: {
        summary: event.summary,
        description: event.description,
        timezone: event.start.timeZone,
        raw_event: event
      }
    })

    if (error) {
      console.error('Error upserting booking:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to create/update booking', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Booking upserted successfully. Booking ID:', data)

    // TODO: Trigger confirmation email (Priority 3)
    // TODO: Schedule SMS reminder for 24h before lesson (Priority 2)

    return new Response(
      JSON.stringify({
        success: true,
        booking_id: data,
        message: 'Booking captured successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
