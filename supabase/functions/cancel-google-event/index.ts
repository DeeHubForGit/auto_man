// supabase/functions/cancel-google-event/index.ts
// Cancel a Google Calendar event
// =================================================================
// This function cancels an event in Google Calendar using the service account
// It's called from the frontend when an admin or client cancels a booking

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    
    if (!eventId || !bookingId) {
      return new Response(
        JSON.stringify({ error: 'Missing eventId or bookingId parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // ========== AUTHORIZATION CHECK ==========
    // Authorisation: allow booking owner or admin to cancel.
    // Prevents users cancelling other users' bookings (IDOR protection).
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing env: SUPABASE_URL or SUPABASE_ANON_KEY");
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[cancel-google-event] ❌ Authentication failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[cancel-google-event] Authenticated user: ${user.id}, email: ${user.email}`);

    // Verify user has an email
    const userEmail = (user.email || '').trim().toLowerCase();
    if (!userEmail) {
      console.error('[cancel-google-event] ❌ Authenticated user email not found');
      return new Response(
        JSON.stringify({ error: "Authenticated user email not found" }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Step 1: Fetch the booking first (without client_id filter)
    const { data: booking, error: bookingError } = await supabase
      .from("booking")
      .select("id, client_id, google_event_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[cancel-google-event] ❌ Booking not found:', {
        bookingId,
        error: bookingError?.message
      });
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 2: Find the matching client record by email
    // Authorisation: map the authenticated user to the matching client record,
    // then allow cancellation if that client owns the booking or is an admin.
    // Prevents users cancelling other users' bookings (IDOR protection).
    const { data: matchedClient, error: clientError } = await supabase
      .from("client")
      .select("id, email, is_admin")
      .ilike("email", userEmail)
      .single();

    if (!matchedClient) {
      console.error('[cancel-google-event] ❌ No matching client record for authenticated user:', {
        authUserId: user.id,
        authEmail: user.email,
        clientError: clientError?.message
      });
      return new Response(
        JSON.stringify({ error: "No matching client record for authenticated user" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const isAdmin = matchedClient.is_admin === true;

    // Step 3: Authorization logic - allow if user is admin OR user owns the booking
    if (!isAdmin && booking.client_id !== matchedClient.id) {
      console.error('[cancel-google-event] ❌ Unauthorized cancellation attempt:', {
        bookingId,
        authUserId: user.id,
        authEmail: user.email,
        matchedClientId: matchedClient.id,
        bookingClientId: booking.client_id,
        isAdmin
      });
      return new Response(
        JSON.stringify({ error: "Unauthorized booking cancellation attempt" }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[cancel-google-event] ✅ Authorization verified for booking ${bookingId}`, {
      authUserId: user.id,
      authEmail: user.email,
      matchedClientId: matchedClient.id,
      isAdmin,
      bookingClientId: booking.client_id
    });

    // Verify the booking's google_event_id matches the supplied eventId
    if (booking.google_event_id !== eventId) {
      console.error('[cancel-google-event] ❌ Event mismatch for booking cancellation attempt:', {
        bookingId,
        userId: user.id,
        suppliedEventId: eventId,
        actualEventId: booking.google_event_id
      });
      return new Response(
        JSON.stringify({ error: "Unauthorized booking cancellation attempt" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    // ========== END AUTHORIZATION CHECK ==========

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
    
    // Audit log
    console.log("[cancel-google-event] Booking cancelled", {
      bookingId,
      authUserId: user.id,
      authEmail: user.email,
      matchedClientId: matchedClient.id,
      isAdmin,
      eventId
    });
    
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
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
