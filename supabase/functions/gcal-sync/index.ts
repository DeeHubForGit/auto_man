// @ts-nocheck: Edge Functions run in Deno with dynamic env/request shapes; keep type checking off for this file.
// supabase/functions/gcal-sync/index.ts
// Google Calendar → Supabase Booking Sync (v5.0 - SMS with Email fallback)
// =================================================================
// - Syncs ALL future events
// - Stores full event object in extended field
// - ALWAYS creates sync log entries
// - Simple booking detection: "Driving Lesson" in title OR pickup exists
// - SMS confirmation with email fallback for invalid mobiles
// - IMPROVED: Better notification logging shows booking ID and reason for skip

import { parseGcalEvent } from "../_shared/parseEvent.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- ENV FLAGS ----------
const SMS_ENABLED = (Deno.env.get("SMS_ENABLED") || "false").toLowerCase() === "true";

// ---------- ACCESS TOKEN LOGIC ----------
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
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
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
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
  if (!tok.access_token) throw new Error("Token error");
  return tok.access_token;
}

// ---------- HTML DESCRIPTION PARSER ----------
const EMAIL_RX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;

function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  // Preserve line breaks
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*p\s*\/?\s*>/gi, "\n");
  // Strip tags
  s = s.replace(/<\/?[^>]+(>|$)/g, "");
  // Entities
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  const lines = s.split(/\r?\n/).map(l => l.trim());
  return lines.join("\n").replace(/\n{2,}/g, "\n\n").trim();
}

/**
 * Parse structured fields from the Google event description.
 * Looks for:
 *  - "Booked by" (then name & email on following lines)
 *  - "Mobile" (next line)
 *  - "Pickup Address" (next line)
 * Also falls back to any email found anywhere in the text.
 */
function parseDescriptionFields(descHtml: string | null | undefined) {
  const text = htmlToText(descHtml);
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let name: string | null = null;
  let email: string | null = null;
  let mobile: string | null = null;
  let pickup: string | null = null;

  // 1. Find first email anywhere as a fallback
  for (const l of lines) {
    const m = l.match(EMAIL_RX);
    if (m) { 
      email = m[0];
      break; 
    }
  }

  // 2. Structured fields by labels
  for (let i = 0; i < lines.length; i++) {
    // "Booked by" → next line = name, next next line may contain email
    if (!name && /^booked by$/i.test(lines[i])) {
      if (i + 1 < lines.length) {
        name = lines[i + 1];
        if (!email && i + 2 < lines.length) {
          const m = lines[i + 2].match(EMAIL_RX);
          if (m) email = m[0];
        }
      }
    }
    // "Mobile" → next line
    if (!mobile && /^mobile$/i.test(lines[i]) && i + 1 < lines.length) {
      mobile = lines[i + 1];
    }
    // "Pickup Address" → next line
    if (!pickup && /^pickup address$/i.test(lines[i]) && i + 1 < lines.length) {
      pickup = lines[i + 1];
    }
  }

  // 3. Keep raw mobile as entered; validation / SMS will normalise later.
  // (Do not strip characters here so we can see what the customer typed.)
  //if (mobile) mobile = mobile.replace(/[^\d+]/g, "");
  
  // 4. Split name into first/last
  const parts = name ? name.trim().split(/\s+/, 2) : [];
  const first_name = parts[0] || null;
  const last_name = parts.length > 1 ? parts[1] : null;

  return { first_name, last_name, email, mobile, pickup };
}

// ---------- UNIFIED FIELD EXTRACTOR ----------
/**
 * Pulls fields from:
 *  - description (structured)
 *  - location (pickup fallback)
 *  - extendedProperties (private/shared)
 *  - title suffix "(First Last)" as fallback for name
 *  - attendees list (first non-self) as fallback for email
 */
function extractFieldsFromEvent(e: any) {
  // PRIORITY ORDER (highest to lowest):
  // 1. extendedProperties.shared (stable, immune to Google UI quirks)
  // 2. description parsing (legacy fallback)
  // 3. location field (pickup fallback)
  // 4. title/attendees (name/email fallback)

  // Start with extendedProperties.shared (stable source of truth)
  const shared = e.extendedProperties?.shared || {};
  let mobile = shared.mobile?.trim() || null;
  let pickup = shared.pickup_location?.trim() || null;
  
  // Parse description fields (will be overridden by extendedProperties if present)
  const fromDesc = parseDescriptionFields(e.description);
  let { first_name, last_name, email } = fromDesc;
  
  // Only use description mobile/pickup if extendedProperties don't have them (legacy fallback)
  if (!mobile && fromDesc.mobile) {
    mobile = fromDesc.mobile;
  }
  if (!pickup && fromDesc.pickup) {
    pickup = fromDesc.pickup;
  }

  // Use top-level 'location' field as fallback for pickup
  if (!pickup && e.location?.trim()) {
    pickup = e.location.trim();
  }

  // Check extendedProperties.private for any additional fields (legacy support)
  const ep = e.extendedProperties?.private || {};
  for (const [k, v] of Object.entries(ep)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const val = v.trim();
    const key = k.toLowerCase();
    if (key.includes("first") && !first_name) first_name = val;
    else if (key.includes("last") && !last_name) last_name = val;
    else if (key.includes("email") && !email) email = val;
    // Note: mobile and pickup from .private only if .shared didn't have them
    else if ((key.includes("mobile") || key.includes("phone")) && !mobile) mobile = val;
    else if (key.includes("pickup") && !pickup) pickup = val;
  }

  // Fallback for name from event title, e.g., "Lesson (John Smith)"
  if (!first_name && typeof e.summary === "string") {
    const match = e.summary.match(/\(([^)]+)\)/);
    if (match) {
      const parts = match[1].trim().split(/\s+/, 2);
      if (parts.length > 0) {
        first_name = parts[0];
        last_name = parts.length > 1 ? parts[1] : null;
      }
    }
  }

  // Final fallback for email from attendee list
  if (!email && Array.isArray(e.attendees)) {
    const guest = e.attendees.find((a: any) => a.email && !a.self);
    if (guest) email = guest.email;
  }

  // Final cleanup
  if (email && !email.includes("@")) email = null;

  // Keep whatever mobile was entered so we can see what the customer typed.
  // Only treat it as null if it is completely blank/whitespace.
  if (mobile && mobile.trim().length === 0) mobile = null;
  
  return { first_name, last_name, email, mobile, pickup_location: pickup };
}

function isNonEmpty(value: any): boolean {
  return typeof value === "string" ? value.trim() !== "" : Boolean(value);
}

// ---------- BOOKING DETECTION ----------
// The Google Appointment Schedule booking form is configurable.
// Only First name, Last name and Email address are guaranteed mandatory fields.
// Mobile and Pickup Address are currently required in our configuration,
// but they can be removed at any time, so booking detection cannot rely on them.
function isBookingEvent(e: any, fields: any): boolean {
  // Check for explicit is_booking flag from admin-created bookings
  const isBookingFlag = e.extendedProperties?.shared?.is_booking;
  if (isBookingFlag === "true") {
    return true;
  }
  if (isBookingFlag === "false") {
    return false;
  }

  // Fall back to heuristic detection for Google-created bookings
  const hasFirstName = isNonEmpty(fields.first_name);
  const hasLastName  = isNonEmpty(fields.last_name);
  const hasEmail     = isNonEmpty(fields.email);

  // Core rule: only treat as a booking if it looks like a booking form submission.
  const looksLikeBookingForm = hasFirstName && hasLastName && hasEmail;

  if (!looksLikeBookingForm) {
    return false;
  }

  // Optional: soft warnings if mobile / pickup are missing, but do NOT block booking
  const hasMobile = isNonEmpty(fields.mobile);
  const hasPickup = isNonEmpty(fields.pickup_location);

  if (!hasMobile || !hasPickup) {
    console.log('[gcal-sync][WARN] Booking detected but missing mobile or pickup', {
      eventId: e.id,
      summary: e.summary,
      hasMobile,
      hasPickup,
    });
  }

  return true;
}

// ---------- SERVICE CODE ----------
function mapDurationToAutoServiceCode(mins: number | null) {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "auto_60";
  if (Math.abs(mins - 90) <= 15) return "auto_90";
  if (Math.abs(mins - 120) <= 20) return "auto_120";
  return null;
}
function inferServiceCode(title: string | null, mins: number | null) {
  if (!title) return null;
  if (/senior/i.test(title)) return mapDurationToAutoServiceCode(mins)?.replace("auto_", "senior_auto_");
  if (/manual/i.test(title)) return mapDurationToAutoServiceCode(mins)?.replace("auto_", "manual_");
  return mapDurationToAutoServiceCode(mins);
}

// ---------- MAIN FUNCTION ----------
Deno.serve(async () => {
  const supa = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supa, key, {
    auth: { persistSession: false },
  });
  const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  console.log(`[gcal-sync] Starting sync for ${calendars.length} calendar(s), SMS_ENABLED=${SMS_ENABLED}`);

  const token = await getAccessToken();
  const results: any[] = [];
  const startTime = new Date();

  for (const calendar_id of calendars) {
    console.log(`[gcal-sync] Processing calendar: ${calendar_id}`);
    
    // Fetch all future events (removed updatedMin restriction)
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events?singleEvents=true&timeMin=${new Date().toISOString()}&showDeleted=true&eventTypes=default`;
    
    console.log(`[gcal-sync] Fetching events...`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    
    if (!res.ok) {
      console.error(`[gcal-sync] ERROR: Google Calendar API returned ${res.status}`);
      const errorText = await res.text();
      console.error(`[gcal-sync] Response: ${errorText}`);
      continue;
    }
    
    const data = await res.json();
    const events = data.items ?? [];
    console.log(`[gcal-sync] Fetched ${events.length} event(s)`);
    
    let synced = 0;
    let cancelled = 0;
    let skipped = 0;

    for (const e of events) {
      const start = e.start?.dateTime ?? e.start?.date;
      const end = e.end?.dateTime ?? e.end?.date;
      
      if (!start || !end) {
        console.warn(`[gcal-sync] ⚠ Skipping event ${e.id} - missing start/end`);
        skipped++;
        continue;
      }

      console.log(`[gcal-sync] Processing: ${e.id} | "${e.summary}" | ${start}`);

      // Skip Google working-location "Home" events so they do not create junk rows
      if (
        e.eventType === "workingLocation" ||
        e.workingLocationProperties ||
        e.summary === "Home"
      ) {
        //console.log(`[gcal-sync]   → Skipping workingLocation event ${e.id} "${e.summary}"`);
        skipped++;
        continue;
      }

      // Handle cancelled events
      if (e.status === "cancelled") {
        console.log(`[gcal-sync]   → Marking as cancelled`);
        const cancelRes = await fetch(`${supa}/rest/v1/rpc/mark_booking_cancelled`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_google_event_id: e.id,
            p_cancelled_at: e.updated || null,  // Use Google's event.updated timestamp
          }),
        });
        if (cancelRes.ok) {
          cancelled++;
          console.log(`[gcal-sync]   ✓ Cancelled`);
        } else {
          console.error(`[gcal-sync]   ✗ Failed to cancel: ${cancelRes.status}`);
        }
        continue;
      }

      // Process active events
      const durationMinutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
      const parsed = parseGcalEvent(e);
      const fields = extractFieldsFromEvent(e);
      const isBooking = isBookingEvent(e, fields);
      
      // Convert Google Calendar ISO strings to UTC for PostgreSQL
      // Google sends: "2025-11-23T15:00:00+11:00" (3 PM Melbourne)
      // We need PostgreSQL to store: "2025-11-23T04:00:00Z" (4 AM UTC)
      const startUTC = new Date(start).toISOString();
      const endUTC = new Date(end).toISOString(); 
      
      // Determine service code
      const serviceCode = parsed.service_code ?? inferServiceCode(e.summary, durationMinutes);
      
      // Fetch price_cents from service table based on serviceCode
      let priceCents: number | null = parsed.price_cents ?? null;
      
      if (serviceCode) {
        try {
          const priceRes = await fetch(
            `${supa}/rest/v1/service?code=eq.${serviceCode}&select=price_cents`,
            {
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
            }
          );
          
          if (priceRes.ok) {
            const services = await priceRes.json();
            if (services && services.length > 0 && typeof services[0].price_cents === 'number') {
              priceCents = services[0].price_cents;
            }
          } else {
            console.error(`[gcal-sync] Failed to load service price for ${serviceCode}: ${priceRes.status}`);
          }
        } catch (err) {
          console.error(`[gcal-sync] Error fetching service price for ${serviceCode}:`, err);
        }
      }
      
      const payload = {
        p_google_event_id: e.id,
        p_calendar_id: calendar_id,
        p_client_email: fields.email,
        p_first_name: fields.first_name,
        p_last_name: fields.last_name,
        p_mobile: fields.mobile,
        p_service_code: serviceCode,
        p_price_cents: priceCents,
        p_start: startUTC,  // Send as proper UTC ISO string
        p_end: endUTC,      // Send as proper UTC ISO string
        p_pickup: fields.pickup_location ?? parsed.pickup_location ?? null,
        p_extended: e,  // Store full event object for debugging/audit
        p_is_booking: isBooking,  // Simple booking detection
        p_title: e.summary ?? null
      };
      
      const up = await fetch(`${supa}/rest/v1/rpc/upsert_booking_from_google`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
          body: JSON.stringify(payload),
        });

      const upBodyText = await up.text();
      
      if (!up.ok) {
        skipped++;
        console.error(`[gcal-sync]   ✗ Failed to upsert: ${up.status}`);
        console.error(`[gcal-sync]   Response: ${upBodyText}`);
        continue; // Skip to next event - don't break the whole sync
      }

      synced++;
      console.log(`[gcal-sync]   ✓ Upserted successfully`);

      // ---------- SMS/EMAIL NOTIFICATION LOGIC (wrapped in try-catch to prevent breaking sync) ----------
      try {
        if (isBooking) {
          const upData = upBodyText;
          let row: any = null;
          
          try {
            const parsed = JSON.parse(upData);
            row = Array.isArray(parsed) ? parsed[0] : parsed;
          } catch (parseErr) {
            console.warn(`[gcal-sync]   ⚠ Could not parse upsert response for notification check:`, parseErr);
          }

          if (row && row.booking_id) {
            const bookingId = row.booking_id;

            // Send confirmation SMS if not already sent (calendar-created bookings).
            // Fail-safe: log and continue if anything fails.
            let b: any = null;
            let sentSmsThisSync = false;
            let sentEmailThisSync = false;

            try {
              const { data: bData, error: bErr } = await supabase
                .from('booking')
                .select('id, mobile, is_mobile_valid, sms_confirm_sent_at, email_confirm_sent_at, status, is_booking')
                .eq('id', bookingId)
                .maybeSingle();

              b = bData;

              if (bErr) {
                console.warn('[gcal-sync] Failed to load booking for notification check (continuing anyway):', bookingId, bErr);
              } else if (!b) {
                console.warn('[gcal-sync] Booking not found for notification check (continuing anyway):', bookingId);
              } else if (b.is_booking !== true) {
                // Not a booking row
              } else if ((b.status || '').toLowerCase() === 'cancelled') {
                // Cancelled bookings should not get confirmations
              } else {
                const rawMobile = (b.mobile || '').toString();
                const compact = rawMobile.replace(/\s+/g, '').trim();

                let normalisedMobile: string | null = null;
                let isValidMobile = false;

                if (/^\+614\d{8}$/.test(compact)) {
                  isValidMobile = true;
                  normalisedMobile = compact;
                } else if (/^614\d{8}$/.test(compact)) {
                  isValidMobile = true;
                  normalisedMobile = `+${compact}`;
                } else if (/^04\d{8}$/.test(compact)) {
                  isValidMobile = true;
                  normalisedMobile = `+61${compact.slice(1)}`;
                }

                // Always persist validation result (independent of SMS_ENABLED)
                // Do NOT normalise or rewrite the stored mobile number.
                const updatePayload: Record<string, unknown> = {
                  is_mobile_valid: isValidMobile,
                };

                const { error: updErr } = await supabase
                  .from('booking')
                  .update(updatePayload)
                  .eq('id', bookingId);

                if (updErr) {
                  console.warn('[gcal-sync] Failed to update mobile validity (continuing anyway):', bookingId, updErr);
                }

                const startTs = new Date(start).getTime();
                const isFuture = startTs > Date.now();
                const status = String(b.status || 'confirmed').toLowerCase();
                const isConfirmed = status === 'confirmed';

                let isEmailRequired = false;

                if (SMS_ENABLED) {
                  if (b.sms_confirm_sent_at) {
                    console.log(`[gcal-sync] SMS already sent, skipping: ${bookingId}`);
                  } else if (!isValidMobile || !normalisedMobile) {
                    console.log(`[gcal-sync] SMS not sent (invalid mobile), will require email: ${bookingId} ${rawMobile}`);
                    isEmailRequired = true;
                  } else if (!isFuture || !isConfirmed) {
                    // Only send confirmation SMS for future, confirmed bookings
                  } else {
                    console.log(`[gcal-sync] Invoking booking-sms: ${bookingId} ${normalisedMobile}`);
                    const { data: smsData, error: smsErr } = await supabase.functions.invoke('booking-sms', {
                      body: { booking_id: bookingId },
                    });

                    const smsSkippedMsg = String(smsData?.skipped || smsData?.message || '');
                    const smsErrMsg = String(smsErr?.message || '');
                    const isInvalidMobileErr =
                      (smsErr && ((smsErr?.context?.status === 400) || smsErrMsg.includes('Invalid or missing'))) ||
                      smsSkippedMsg.includes('Invalid or missing');

                    if (smsErr) {
                      console.warn('[gcal-sync] booking-sms invoke failed (continuing anyway):', bookingId, smsErr);
                      if (isInvalidMobileErr) {
                        isEmailRequired = true;
                      }
                    } else if (smsData?.ok === true) {
                      console.log(`[gcal-sync] booking-sms ok for booking ${bookingId}`);

                      const { error: smsFlagErr } = await supabase
                        .from('booking')
                        .update({ sms_confirm_sent_at: new Date().toISOString() })
                        .eq('id', bookingId);

                      if (smsFlagErr) {
                        console.warn('[gcal-sync] Failed to set sms_confirm_sent_at (continuing anyway):', bookingId, smsFlagErr);
                      } else {
                        sentSmsThisSync = true;
                      }
                    } else {
                      console.warn('[gcal-sync] booking-sms returned non-ok (continuing anyway):', bookingId, smsData);
                      if (isInvalidMobileErr) {
                        isEmailRequired = true;
                      }
                    }
                  }
                } else {
                  // SMS disabled: send email only if no SMS has been sent
                  if (b.sms_confirm_sent_at) {
                    console.log(`[gcal-sync] SMS_ENABLED=false, SMS already sent, skipping email: ${bookingId}`);
                  } else {
                    isEmailRequired = true;
                    console.log(`[gcal-sync] SMS_ENABLED=false, email required for booking ${bookingId}`);
                  }
                }
                
                if (isEmailRequired) {
                  const hasEmailAlready = b.email_confirm_sent_at != null;
                  if (hasEmailAlready) {
                    console.log(`[gcal-sync] Email already sent, skipping: ${bookingId}`);
                  } else {
                    console.log(`[gcal-sync] Invoking booking-email: ${bookingId}`);
                    const { data: emailData, error: emailErr } = await supabase.functions.invoke('booking-email', {
                      body: { booking_id: bookingId },
                    });

                    if (emailErr) {
                      console.error('[gcal-sync] Email failed (non-fatal):', bookingId, emailErr);
                    } else if (emailData?.ok === true) {
                      console.log(`[gcal-sync] Email ok for booking ${bookingId}`);
                      sentEmailThisSync = true;
                    } else if (emailData?.skipped) {
                      console.warn(`[gcal-sync] Email skipped for booking ${bookingId}: ${emailData.skipped}`);
                    } else {
                      console.warn('[gcal-sync] Email returned non-ok (non-fatal):', bookingId, emailData);
                    }
                  }
                }
              }
            } catch (smsCheckErr) {
              console.warn('[gcal-sync] Notification check failed (continuing anyway):', bookingId, smsCheckErr);
            }

            const startTs = new Date(start).getTime();
            const isFuture = startTs > Date.now();
            const status = String((b && b.status) || 'confirmed').toLowerCase();
            const isConfirmed = status === 'confirmed';
            const hasSMS = (b && b.sms_confirm_sent_at != null) || sentSmsThisSync;
            const hasEmail = (b && b.email_confirm_sent_at != null) || sentEmailThisSync;

            console.log(`[gcal-sync]   → Notification check for booking ${bookingId}: has_sms=${hasSMS}, has_email=${hasEmail}, future=${isFuture}, confirmed=${isConfirmed}`);
          } else {
            console.warn(`[gcal-sync]   ⚠ No booking_id in upsert response for notification`);
          }
        }
      } catch (notificationError) {
        // Critical: Notification errors should NOT break the sync
        console.error(`[gcal-sync]   ✗ Notification error (non-fatal):`, notificationError);
        console.error(`[gcal-sync]   ℹ Sync continues despite notification failure`);
      }
    }
    
    console.log(`[gcal-sync] Calendar complete: ${synced} synced, ${cancelled} cancelled, ${skipped} skipped`);
    results.push({ calendar_id, synced, cancelled, skipped });
  }

  const finishedTime = new Date();
  
  // ALWAYS log the sync, even if 0 events were synced
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const totalCancelled = results.reduce((sum, r) => sum + r.cancelled, 0);
  const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0);
  
  console.log(`[gcal-sync] === SYNC COMPLETE ===`);
  console.log(`[gcal-sync] Total: ${totalSynced} synced, ${totalCancelled} cancelled, ${totalSkipped} skipped`);

  await fetch(`${supa}/rest/v1/gcal_sync_log`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      calendar_id: calendars[0] || null,
      status: "success",
      started_at: startTime.toISOString(),
      finished_at: finishedTime.toISOString(),
      inserted_count: 0,  // We don't track inserts vs updates separately yet
      updated_count: totalCancelled,
      synced_count: totalSynced,
    }),
  });

  // Trigger validation for any new/unchecked bookings (once per sync)
  try {
    const validateRes = await fetch(`${supa}/functions/v1/validate-bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({}),
    });

    if (!validateRes.ok) {
      console.warn(
        `[gcal-sync] validate-bookings failed after sync:`,
        validateRes.status,
        await validateRes.text().catch(() => "<no body>"),
      );
    } else {
      console.log("[gcal-sync] validate-bookings triggered successfully after sync");
    }
  } catch (err) {
    console.error("[gcal-sync] Error calling validate-bookings after sync:", err);
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
});