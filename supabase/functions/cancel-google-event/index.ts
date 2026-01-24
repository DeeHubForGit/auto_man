// supabase/functions/cancel-google-event/index.ts
// Cancel a Google Calendar event
// =================================================================
// This function cancels an event in Google Calendar using the service account
// It's called from the frontend when an admin or client cancels a booking

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ---------- CORS HEADERS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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
    // If impersonating a Workspace user for their calendar, add:
    // sub: "user@your-domain.com",
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

// ---------- MAIN FUNCTION ----------
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    // Parse request body
    const { eventId, bookingId, calendarId: bodyCalendarId } = await req.json();
    
    console.log(`[cancel-google-event] Request to cancel event: ${eventId} (booking: ${bookingId})`);
    
    if (!eventId) {
      return new Response(
        JSON.stringify({ error: 'Missing eventId parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get the calendar ID from environment
    const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    
    if (calendars.length === 0 && !bodyCalendarId) {
      throw new Error("No calendar IDs configured in GCAL_CALENDAR_IDS and no calendarId provided in request");
    }
    
    // Use the provided calendarId or the first configured one
    const calendarId = bodyCalendarId || calendars[0];
    console.log(`[cancel-google-event] Using calendar: ${calendarId}`);

    // Get access token
    const token = await getAccessToken();
    
    // Delete the event from Google Calendar
    const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    
    console.log(`[cancel-google-event] Deleting event from Google Calendar...`);
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      console.error(`[cancel-google-event] ❌ Google Calendar API error (${deleteRes.status}):`, errorText);
      
      // Check if it's a 404 (event already deleted or doesn't exist)
      if (deleteRes.status === 404) {
        console.log(`[cancel-google-event] ⚠ Event not found (may already be deleted), treating as success`);
        return new Response(
          JSON.stringify({ 
            ok: true, 
            message: 'Event not found (may already be deleted)',
            eventId,
            bookingId 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Google Calendar API error: ${deleteRes.status} - ${errorText}` 
        }),
        { 
          status: deleteRes.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[cancel-google-event] ✅ Event cancelled successfully`);
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: 'Event cancelled successfully',
        eventId,
        bookingId 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[cancel-google-event] ❌ Error:', error);
    
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
