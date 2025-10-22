// supabase/functions/pull-calendar/index.ts
// Poll Google Calendar ICS feed and upsert events into public.bookings
// No OAuth needed. Uses secret ICS URL.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Event = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
};

// Minimal ICS parser: splits by VEVENT and reads common fields
function parseICS(ics: string): Event[] {
  const events: Event[] = [];
  const blocks = ics.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const vevent = block.split("END:VEVENT")[0];
    const lines = vevent.split(/\r?\n/);

    const get = (prop: string) => {
      // Handle line folding (RFC 5545)
      const joined: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(prop + ":") || lines[i].startsWith(prop + ";")) {
          let v = lines[i];
          // unfold
          while (i + 1 < lines.length && (lines[i + 1].startsWith(" ") || lines[i + 1].startsWith("\t"))) {
            v += lines[++i].slice(1);
          }
          joined.push(v);
        }
      }
      if (!joined.length) return null;
      const raw = joined[0];
      const idx = raw.indexOf(":");
      return idx >= 0 ? raw.slice(idx + 1) : null;
    };

    const uid = get("UID")?.trim();
    if (!uid) continue;

    const summary = get("SUMMARY") ?? "Booking";
    const description = get("DESCRIPTION") ?? "";
    const location = get("LOCATION") ?? "";

    // Prefer DTSTART/DTEND in UTC (Z) if present, else treat as local then to ISO
    const parseDate = (s: string | null) => {
      if (!s) return null;
      // Formats like: 20251030T010000Z  or 20251030T120000
      const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
      if (!m) return null;
      const [_, Y, M, D, h, m2, s2, z] = m;
      if (z === "Z") {
        return new Date(Date.UTC(+Y, +M - 1, +D, +h, +m2, +s2)).toISOString();
      } else {
        // interpret as local time of the server; convert to ISO UTC
        return new Date(+Y, +M - 1, +D, +h, +m2, +s2).toISOString();
      }
    };

    const dtStart = parseDate(get("DTSTART"));
    const dtEnd = parseDate(get("DTEND"));
    if (!dtStart || !dtEnd) continue;

    events.push({
      id: uid,
      title: summary,
      description,
      location,
      starts_at: dtStart,
      ends_at: dtEnd,
    });
  }
  return events;
}

serve(async () => {
  try {
    const ICS_URL = Deno.env.get("GOOGLE_CAL_ICS_URL");
    if (!ICS_URL) {
      return new Response("Missing GOOGLE_CAL_ICS_URL", { status: 500 });
    }

    const res = await fetch(ICS_URL, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) {
      return new Response(`ICS fetch failed: ${res.status}`, { status: 502 });
    }
    const icsText = await res.text();
    const events = parseICS(icsText);

    // Upsert into public.bookings
    // Use service role automatically provided to Edge Functions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(
        events.map(e => ({
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          updated_at: new Date().toISOString(),
        }))
      ),
    });

    if (!upsertRes.ok) {
      const txt = await upsertRes.text();
      return new Response(`Upsert failed: ${upsertRes.status} ${txt}`, { status: 500 });
    }

    return new Response(`OK: upserted ${events.length} events`);
  } catch (err) {
    return new Response(`Error: ${err}`, { status: 500 });
  }
});
