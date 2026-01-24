// supabase/functions/booking-email/index.ts
// Send booking confirmation email via Resend with full audit logging
// Usage (server-to-server or admin): POST /functions/v1/booking-email
// Body: { booking_id?: string, google_event_id?: string }
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Json = Record<string, unknown>;

function json(body: Json, init: number | ResponseInit = 200) {
  const initObj = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
      ...(initObj as ResponseInit).headers || {},
    },
  });
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return { res, data: JSON.parse(text) as Json, raw: text };
  } catch {
    return { res, data: null as unknown as Json, raw: text };
  }
}

// Format date with ordinal suffix
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EMAIL_FN_URL = `${SUPABASE_URL}/functions/v1/email`;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    const body = await req.json().catch(() => ({})) as {
      booking_id?: string;
      google_event_id?: string;
    };

    const { booking_id, google_event_id } = body;
    if (!booking_id && !google_event_id) {
      return json({ error: "Provide booking_id or google_event_id" }, 400);
    }

    console.log(`[booking-email] Processing request for ${booking_id ? `booking_id=${booking_id}` : `google_event_id=${google_event_id}`}`);

    // 1) Load booking
    const queryParam = booking_id
      ? `id=eq.${encodeURIComponent(booking_id)}`
      : `google_event_id=eq.${encodeURIComponent(google_event_id!)}`;

    const { res: getRes, data: getData } = await fetchJson(
      `${SUPABASE_URL}/rest/v1/booking?select=*&${queryParam}&limit=1`,
      {
        headers: {
          "apikey": SERVICE_KEY,
          "authorization": `Bearer ${SERVICE_KEY}`,
          "content-type": "application/json",
          "accept": "application/json",
        },
      },
    );

    if (!getRes.ok) {
      console.error(`[booking-email] Failed to load booking: ${getRes.status}`);
      return json(
        { error: "Failed to load booking", details: getData || (await getRes.text()) },
        502,
      );
    }

    const rows = (getData as unknown as any[]) || [];
    if (rows.length === 0) {
      console.error(`[booking-email] Booking not found`);
      return json({ error: "Booking not found" }, 404);
    }

    const b = rows[0] as {
      id: string;
      is_booking: boolean | null;
      email_confirm_sent_at: string | null;
      status: string | null;
      start_time: string;
      end_time: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      pickup_location: string | null;
      service_code: string | null;
      gcal_sequence: number | null;
      client_id: string | null;
    };

    console.log(`[booking-email] Loaded booking ${b.id} for ${b.first_name} ${b.last_name}`);

    // 2) Idempotency and business rules
    if (b.email_confirm_sent_at) {
      console.log(`[booking-email] Email already sent at ${b.email_confirm_sent_at}`);
      return json({ ok: true, skipped: "already_sent", booking_id: b.id });
    }
    if (!b.is_booking) {
      console.log(`[booking-email] Not a booking`);
      return json({ ok: true, skipped: "not_a_booking", booking_id: b.id });
    }
    if ((b.status || "confirmed") !== "confirmed") {
      console.log(`[booking-email] Status is ${b.status}, not confirmed`);
      return json({ ok: true, skipped: "not_confirmed", booking_id: b.id });
    }

    const start = new Date(b.start_time);
    if (!isFinite(start.getTime())) {
      console.error(`[booking-email] Invalid start_time: ${b.start_time}`);
      return json({ error: "Invalid start_time on booking" }, 400);
    }
    const now = new Date();
    if (start.getTime() <= now.getTime()) {
      console.log(`[booking-email] Event in the past: ${start.toISOString()}`);
      return json({ ok: true, skipped: "past_event", booking_id: b.id });
    }

    if (b.gcal_sequence != null && b.gcal_sequence > 0) {
      console.log(`[booking-email] Not initial create, gcal_sequence=${b.gcal_sequence}`);
      return json({ ok: true, skipped: "not_initial_create", booking_id: b.id });
    }

    if (!b.email || !b.email.includes('@')) {
      console.error(`[booking-email] Invalid or missing email: ${b.email}`);
      return json({ error: "Invalid or missing email on booking" }, 400);
    }

    console.log(`[booking-email] Sending email to ${b.email}`);

    // 3) Check if customer needs to complete intake form
    let needsIntake = false;
    if (b.client_id) {
      const { res: clientRes, data: clientData } = await fetchJson(
        `${SUPABASE_URL}/rest/v1/client?id=eq.${encodeURIComponent(b.client_id)}&select=intake_completed&limit=1`,
        {
          headers: {
            "apikey": SERVICE_KEY,
            "authorization": `Bearer ${SERVICE_KEY}`,
            "content-type": "application/json",
            "accept": "application/json",
          },
        },
      );
      
      if (clientRes.ok) {
        const clientRows = (clientData as unknown as any[]) || [];
        needsIntake = clientRows.length === 0 || clientRows[0]?.intake_completed !== true;
      } else {
        needsIntake = true;
      }
    } else {
      needsIntake = true;
    }

    // 4) Build email HTML
    const firstName = b.first_name || "there";
    
    const dayOfWeek = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      weekday: "long",
    }).format(start);
    
    const day = parseInt(new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric",
    }).format(start));
    
    const month = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      month: "long",
    }).format(start);
    
    const year = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
    }).format(start);
    
    const formattedDate = `${dayOfWeek}, ${month} ${day}${getOrdinalSuffix(day)}, ${year}`;
    
    const end = new Date(b.end_time);
    
    const startTime = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(start);
    
    const endTime = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(end);

    const emailSubject = `Driving Lesson Confirmed - ${formattedDate} at ${startTime}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation - Auto-Man Driving School</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #2c5282; margin-top: 0;">Hi ${firstName},</h2>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      Your driving lesson is confirmed!
    </p>
    
    <div style="background-color: white; border-left: 4px solid #4299e1; padding: 20px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0;"><strong style="color: #2c5282;">Date:</strong> ${formattedDate}</p>
      <p style="margin: 0 0 10px 0;"><strong style="color: #2c5282;">Time:</strong> ${startTime} - ${endTime}</p>
      ${b.pickup_location ? `<p style="margin: 0;"><strong style="color: #2c5282;">Pickup:</strong> ${b.pickup_location}</p>` : ''}
    </div>
    
    ${needsIntake ? `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-weight: bold;">Action Required:</p>
      <p style="margin: 0;">
        Please sign up on the Auto-Man website and advise of your permit/licence number and any relevant medical conditions before your first driving lesson:
      </p>
      <p style="margin: 10px 0 0 0;">
        <a href="https://www.automandrivingschool.com.au/signup" style="color: #2c5282; text-decoration: none; font-weight: bold;">
          Sign up here →
        </a>
      </p>
    </div>
    ` : ''}
    
    <p style="font-size: 16px; margin: 20px 0;">
      Thank you for booking with Auto-Man Driving School.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
    
    <div style="font-size: 14px; color: #718096;">
      <p style="margin: 0 0 10px 0;"><strong>Cancellation Policy:</strong> Cancellations require 24 hours notice.</p>
      <p style="margin: 0;">
        <strong>Questions or changes?</strong> Contact us at 
        <a href="tel:0403632313" style="color: #2c5282;">0403 632 313</a>
      </p>
    </div>
  </div>
  
  <div style="text-align: center; font-size: 12px; color: #a0aec0; margin-top: 20px;">
    <p>Auto-Man Driving School</p>
    <p>This is an automated confirmation email.</p>
  </div>
</body>
</html>
    `.trim();

    console.log(`[booking-email] Email HTML prepared (${emailHtml.length} chars)`);

    // 5) Send via email function
    const send = await fetchJson(EMAIL_FN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({ 
        to: b.email, 
        subject: emailSubject,
        html: emailHtml 
      }),
    });

    console.log(`[booking-email] Email function response: ${send.res.status}, ok=${send.res.ok}`);

    let emailStatus: string = "pending";
    let errorMessage: string | null = null;

    if (!send.res.ok || !(send.data as any)?.ok) {
      console.error(`[booking-email] Email send failed:`, send.data);
      emailStatus = "failed";
      errorMessage = JSON.stringify(send.data ?? send.raw);
      
      // Log the failure to email_log
      await fetchJson(
        `${SUPABASE_URL}/rest/v1/email_log`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY,
            "prefer": "return=minimal",
          },
          body: JSON.stringify({
            booking_id: b.id,
            client_id: b.client_id,
            to_email: b.email,
            type: "booking_confirmation",
            subject: emailSubject,
            status: emailStatus,
            error_message: errorMessage,
            sent_at: new Date().toISOString(),
          }),
        },
      );
      
      return json(
        { error: "Email send failed", details: send.data ?? send.raw },
        502,
      );
    }

    // Email sent successfully
    emailStatus = "sent";

    console.log(`[booking-email] Email sent successfully, status: ${emailStatus}`);

    // 6) Log to email_log table
    const logRes = await fetchJson(
      `${SUPABASE_URL}/rest/v1/email_log`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
          "prefer": "return=representation",
        },
        body: JSON.stringify({
          booking_id: b.id,
          client_id: b.client_id,
          to_email: b.email,
          type: "booking_confirmation",
          subject: emailSubject,
          status: emailStatus,
          error_message: null,
          sent_at: new Date().toISOString(),
        }),
      },
    );

    if (!logRes.res.ok) {
      console.warn(`[booking-email] Failed to log to email_log: ${logRes.res.status}`);
      const logError = logRes.raw;  // Use the already-consumed raw text
      console.warn(`[booking-email] Log error details: ${logError}`);
    } else {
      console.log(`[booking-email] Logged to email_log successfully`);
    }

    // 7) Mark sent (idempotency latch)
    const { res: updRes, data: updData } = await fetchJson(
      `${SUPABASE_URL}/rest/v1/booking?id=eq.${encodeURIComponent(b.id)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
          "prefer": "return=representation",
        },
        body: JSON.stringify({ email_confirm_sent_at: new Date().toISOString() }),
      },
    );

    if (!updRes.ok) {
      console.error(`[booking-email] Failed to update booking flag: ${updRes.status}`);
      return json(
        { error: "Email sent but failed to update flag", details: updData ?? (await updRes.text()) },
        502,
      );
    }

    console.log(`[booking-email] Successfully sent email for booking ${b.id}`);

    return json({
      ok: true,
      booking_id: b.id,
      sent_to: b.email,
      resend: (send.data as any)?.data ?? null,
      needs_intake: needsIntake,
    });
  } catch (err) {
    console.error("[booking-email] error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});