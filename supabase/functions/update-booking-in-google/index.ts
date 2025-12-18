// @ts-nocheck
// supabase/functions/update-booking-in-google/index.ts
// Update Google Calendar event when booking fields change in DB
// =================================================================
// This function updates mobile and pickup_location fields in Google Calendar
// when they are changed in the admin bookings interface

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ---------- CORS HEADERS ----------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------- ACCESS TOKEN LOGIC ----------
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");
  
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: GCAL_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const pem = sa.private_key as string;
  
  if (!pem) throw new Error("Service account JSON missing private_key");
  
  const pkcs8 = pem.replace(/-----.*?-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pkcs8), (c) => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data)
  );
  
  const jwt = `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
  
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  
  const tok = await res.json();
  if (!tok.access_token) throw new Error("Token error: " + JSON.stringify(tok));
  
  return tok.access_token;
}

// ---------- DESCRIPTION UPDATE HELPERS ----------
function updateMobileInDescription(description: string, newMobile: string): string {
  // Match line like "📱 0412345678" or "Mobile: 0412345678"
  const mobileRegex = /^(📱|Mobile:)\s*.*$/m;
  const newLine = `📱 ${newMobile}`;
  
  if (mobileRegex.test(description)) {
    return description.replace(mobileRegex, newLine);
  } else {
    // If no mobile line exists, prepend it
    return `${newLine}\n${description}`;
  }
}

function updatePickupInDescription(description: string, newPickup: string): string {
  // Match line like "📍 66 Pioneer Road, grovedale" or "Pickup: ..."
  const pickupRegex = /^(📍|Pickup:)\s*.*$/m;
  const newLine = `📍 ${newPickup}`;
  
  if (pickupRegex.test(description)) {
    return description.replace(pickupRegex, newLine);
  } else {
    // If no pickup line exists, append it after mobile if present
    const lines = description.split('\n');
    const mobileIndex = lines.findIndex(line => /^(📱|Mobile:)/.test(line));
    
    if (mobileIndex >= 0) {
      lines.splice(mobileIndex + 1, 0, newLine);
      return lines.join('\n');
    } else {
      // No mobile line, prepend
      return `${newLine}\n${description}`;
    }
  }
}

// ---------- MAIN FUNCTION ----------
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { booking_id, fields } = await req.json();
    
    console.log(`[update-booking-in-google] Request to update booking: ${booking_id}, fields:`, fields);
    
    if (!booking_id || !fields || !Array.isArray(fields)) {
      return new Response(
        JSON.stringify({ error: 'Missing booking_id or fields array' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load booking from DB
    const { data: booking, error: bookingError } = await supabase
      .from('booking')
      .select('id, google_event_id, google_calendar_id, mobile, pickup_location')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('[update-booking-in-google] Failed to load booking:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if we have Google event IDs
    if (!booking.google_event_id || !booking.google_calendar_id) {
      console.log('[update-booking-in-google] No Google event ID, skipping update');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'No Google event linked' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get access token
    const token = await getAccessToken();
    
    // Fetch current event from Google
    const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(booking.google_calendar_id)}/events/${encodeURIComponent(booking.google_event_id)}`;
    
    console.log(`[update-booking-in-google] Fetching current event from Google...`);
    const getRes = await fetch(eventUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!getRes.ok) {
      const errorText = await getRes.text();
      console.error(`[update-booking-in-google] ❌ Failed to fetch event (${getRes.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to fetch event: ${getRes.status}` }),
        { 
          status: getRes.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const currentEvent = await getRes.json();
    let description = currentEvent.description || '';
    const patchBody: any = {};

    // Update fields based on request
    if (fields.includes('pickup_location')) {
      patchBody.location = booking.pickup_location;
      description = updatePickupInDescription(description, booking.pickup_location);
      console.log(`[update-booking-in-google] Updated pickup_location: ${booking.pickup_location}`);
    }

    if (fields.includes('mobile')) {
      description = updateMobileInDescription(description, booking.mobile);
      console.log(`[update-booking-in-google] Updated mobile: ${booking.mobile}`);
    }

    // Only update description if we modified it
    if (fields.includes('pickup_location') || fields.includes('mobile')) {
      patchBody.description = description;
    }

    // If nothing to patch, skip
    if (Object.keys(patchBody).length === 0) {
      console.log('[update-booking-in-google] No fields to update');
      return new Response(
        JSON.stringify({ ok: true, message: 'No fields to update' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Patch the event
    console.log(`[update-booking-in-google] Patching event with:`, Object.keys(patchBody));
    const patchRes = await fetch(eventUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    });

    if (!patchRes.ok) {
      const errorText = await patchRes.text();
      console.error(`[update-booking-in-google] ❌ Failed to patch event (${patchRes.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to patch event: ${patchRes.status}` }),
        { 
          status: patchRes.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[update-booking-in-google] ✅ Event updated successfully`);
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: 'Event updated successfully',
        fields_updated: fields,
        booking_id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[update-booking-in-google] ❌ Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
