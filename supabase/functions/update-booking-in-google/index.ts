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
  if (!newMobile || !newMobile.trim()) {
    return description;
  }

  // Normalise <br> tags to newlines so we can reliably work line-by-line.
  // Google may store description using <br> without \n.
  const normalised = (description || '').replace(/<br\s*\/?>/gi, '\n');

  const lines = normalised.split(/\r?\n/);

  // Match label line e.g. "Mobile", "<b>Mobile</b>", "Mobile:", with whitespace variance
  const mobileLabelRegex = /^\s*(?:<b>)?\s*mobile\s*(?:<\/b>)?\s*:?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    // Case 1: label is alone on a line (most common in our templates)
    if (mobileLabelRegex.test(line)) {
      // Replace the next non-empty line
      for (let j = i + 1; j < lines.length; j++) {
        if ((lines[j] || '').trim()) {
          lines[j] = newMobile;
          return lines.join('\n');
        }
      }

      // No value line found, insert it
      lines.splice(i + 1, 0, newMobile);
      return lines.join('\n');
    }

    // Case 2: label and value are on the same line (happens after Google normalisation)
    // Examples: "<b>Mobile</b> 0412345678" or "Mobile: 0412345678"
    const sameLineMatch = line.match(/^\s*(?:<b>)?\s*mobile\s*(?:<\/b>)?\s*:?\s*(.+)\s*$/i);
    if (sameLineMatch && sameLineMatch[1]) {
      // Replace line with just the label, insert value as next element
      if (line.toLowerCase().includes('<b>')) {
        lines[i] = '<b>Mobile</b>';
      } else {
        lines[i] = 'Mobile';
      }
      lines.splice(i + 1, 0, newMobile);
      return lines.join('\n');
    }
  }

  // No Mobile label found, prepend it
  return `<b>Mobile</b>\n${newMobile}\n${normalised}`;
}

function removeLegacyPinnedAddressLines(description: string): string {
  const normalised = (description || '').replace(/<br\s*\/?>/gi, '\n');
  const lines = normalised.split(/\r?\n/);

  // Remove legacy lines that start with the pin emoji
  const filtered = lines.filter(line => !/^\s*📍\s*/.test(line || ''));

  return filtered.join('\n');
}

function updatePickupInDescription(description: string, newPickup: string): string {
  if (!newPickup || !newPickup.trim()) {
    return description;
  }

  // Normalise <br> tags to newlines so we can reliably work line-by-line.
  // Google may store description using <br> without \n.
  const normalised = (description || '').replace(/<br\s*\/?>/gi, '\n');

  const lines = normalised.split(/\r?\n/);

  // Match label line e.g. "Pickup Address", "<b>Pickup Address</b>", "Pickup Address:", with whitespace variance
  const pickupLabelRegex = /^\s*(?:<b>)?\s*pickup\s+address\s*(?:<\/b>)?\s*:?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    // Case 1: label is alone on a line (most common in our templates)
    if (pickupLabelRegex.test(line)) {
      // Replace the next non-empty line
      for (let j = i + 1; j < lines.length; j++) {
        if ((lines[j] || '').trim()) {
          lines[j] = newPickup;
          return lines.join('\n');
        }
      }

      // No value line found, insert it
      lines.splice(i + 1, 0, newPickup);
      return lines.join('\n');
    }

    // Case 2: label and value are on the same line (happens after Google normalisation)
    // Examples:
    // "<b>Pickup Address</b> 22 Heyers Road, Grovedale"
    // "Pickup Address: 22 Heyers Road, Grovedale"
    const sameLineMatch = line.match(/^\s*(?:<b>)?\s*pickup\s+address\s*(?:<\/b>)?\s*:?\s*(.+)\s*$/i);
    if (sameLineMatch && sameLineMatch[1]) {
      // Replace line with just the label, insert value as next element
      if (line.toLowerCase().includes('<b>')) {
        lines[i] = '<b>Pickup Address</b>';
      } else {
        lines[i] = 'Pickup Address';
      }
      lines.splice(i + 1, 0, newPickup);
      return lines.join('\n');
    }
  }

  // If no Pickup Address label found, insert after Mobile block if possible
  const mobileLabelRegex = /^\s*(?:<b>)?\s*mobile\s*(?:<\/b>)?\s*:?\s*$/i;
  const mobileIndex = lines.findIndex(l => mobileLabelRegex.test(l || ''));

  if (mobileIndex >= 0) {
    // After the mobile value (next non-empty line after mobile label)
    let insertIndex = mobileIndex + 1;
    while (insertIndex < lines.length && !(lines[insertIndex] || '').trim()) {
      insertIndex++;
    }
    if (insertIndex < lines.length) insertIndex++;
    lines.splice(insertIndex, 0, '<b>Pickup Address</b>', newPickup);
    return lines.join('\n');
  }

  // Otherwise prepend
  return `<b>Pickup Address</b>\n${newPickup}\n${normalised}`;
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
    let descriptionChanged = false;

    // Update fields based on request
    if (fields.includes('pickup_location')) {
      const newPickup = (booking.pickup_location || '').trim();

      // Only patch location and description if pickup is non-empty
      if (newPickup) {
        patchBody.location = newPickup;
        patchBody.structuredLocation = null;
        
        // Remove legacy pin lines before updating
        const originalDescription = description;
        description = removeLegacyPinnedAddressLines(description);
        description = updatePickupInDescription(description, newPickup);
        if (description !== originalDescription) {
          descriptionChanged = true;
        }
        
        // Initialize extendedProperties if needed (preserve both shared and private)
        if (!patchBody.extendedProperties) {
          const existingShared = currentEvent.extendedProperties?.shared || {};
          const existingPrivate = currentEvent.extendedProperties?.private || {};
          patchBody.extendedProperties = {
            shared: { ...existingShared },
            private: { ...existingPrivate }
          };
        }
        patchBody.extendedProperties.shared.pickup_location = newPickup;
      }
    }

    if (fields.includes('mobile')) {
      const newMobile = (booking.mobile || '').trim();

      if (newMobile) {
        const originalDescription = description;
        description = updateMobileInDescription(description, newMobile);
        if (description !== originalDescription) {
          descriptionChanged = true;
        }
        
        // Initialize extendedProperties if needed (preserve both shared and private)
        if (!patchBody.extendedProperties) {
          const existingShared = currentEvent.extendedProperties?.shared || {};
          const existingPrivate = currentEvent.extendedProperties?.private || {};
          patchBody.extendedProperties = {
            shared: { ...existingShared },
            private: { ...existingPrivate }
          };
        }
        patchBody.extendedProperties.shared.mobile = newMobile;
      }
    }

    // Set description only if we actually changed it
    if (descriptionChanged) {
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

    // Debug: Log values before PATCH
    const debugNewPickup = fields.includes('pickup_location') ? (booking.pickup_location || '').trim() : 'N/A';
    const debugNewMobile = fields.includes('mobile') ? (booking.mobile || '').trim() : 'N/A';
    console.log('[update-booking-in-google] 🔍 Debug before PATCH:');
    console.log('  - newPickup:', debugNewPickup);
    console.log('  - newMobile:', debugNewMobile);
    console.log('  - description.length:', description.length);
    console.log('  - patchBody.description exists:', !!patchBody.description);
    console.log('  - extendedProperties.shared keys:', Object.keys(patchBody.extendedProperties?.shared || {}));
    
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
