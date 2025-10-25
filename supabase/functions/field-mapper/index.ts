// Standalone Field Mapper function
// - POST JSON { calendar_id: "<calendar id>" }
// - Samples events for the calendar, runs detectFieldMappings, and persists mapping to gcal_state.field_map
// - Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON

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
  const claims: any = {
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
    ["sign"]
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
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) throw new Error(`Token error: ${res.status} ${JSON.stringify(tok)}`);
  return tok.access_token;
}

/* detectFieldMappings - same conservative detector used previously */
function detectFieldMappings(events: any[], opts?: { sampleLimit?: number }) {
  const sampleLimit = opts?.sampleLimit ?? 200;
  const samples: Record<string, string[]> = {};
  const labelSamples: Record<string, string[]> = {};

  const pushSample = (map: Record<string, string[]>, key: string, value: any) => {
    if (value == null) return;
    const s = String(value).trim();
    if (!s) return;
    if (!map[key]) map[key] = [];
    if (map[key].length < 20) map[key].push(s);
  };

  const emailRx = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
  const phoneRx = /(\+?\d[\d\-\s\(\)]{6,}\d)/;
  const addressHintRx = /\d+\s+\w+|street|st\.|road|rd\.|ave|avenue|lane|ln\.|drive|dr\./i;
  const nameHintRx = /^[A-Za-z\-' ]{2,}$/;

  let count = 0;
  for (const e of events ?? []) {
    if (count++ >= sampleLimit) break;

    const epPriv = e.extendedProperties?.private ?? {};
    const epShared = e.extendedProperties?.shared ?? {};
    for (const k of Object.keys(epPriv)) pushSample(samples, `private:${k}`, epPriv[k]);
    for (const k of Object.keys(epShared)) pushSample(samples, `shared:${k}`, epShared[k]);

    if (typeof e.location === 'string' && e.location.trim().length) pushSample(samples, `location`, e.location);

    if (typeof e.description === 'string' && e.description.trim().length) {
      const lines = e.description.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^(.{1,60}?)\s*[:\-]\s*(.+)$/);
        if (m) {
          const label = m[1].trim();
          const val = m[2].trim();
          pushSample(labelSamples, label, val);
          pushSample(samples, `desc:${label}`, val);
        }
      }
      const labelBlockRx = /([A-Za-z0-9 \-]{3,40})\s*[:\-]\s*([^\n\r]{3,200})/g;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = labelBlockRx.exec(e.description)) !== null) {
        const label = m[1].trim();
        const val = m[2].trim();
        pushSample(labelSamples, label, val);
        pushSample(samples, `desc:${label}`, val);
      }
    }

    if (Array.isArray(e.attendees)) {
      for (const a of e.attendees.slice(0, 3)) {
        if (a?.displayName) pushSample(samples, 'attendee:displayName', a.displayName);
        if (a?.email) pushSample(samples, 'attendee:email', a.email);
        if (a?.phone) pushSample(samples, 'attendee:phone', a.phone);
      }
    }

    if (e.creator?.email) pushSample(samples, 'creator:email', e.creator.email);
    if (e.creator?.displayName) pushSample(samples, 'creator:displayName', e.creator.displayName);
    if (e.organizer?.email) pushSample(samples, 'organizer:email', e.organizer.email);
    if (e.organizer?.displayName) pushSample(samples, 'organizer:displayName', e.organizer.displayName);
  }

  type CandidateScore = { key: string; source: string; score: number; samples: string[] };
  const emailCandidates: CandidateScore[] = [];
  const phoneCandidates: CandidateScore[] = [];
  const pickupCandidates: CandidateScore[] = [];
  const nameCandidates: CandidateScore[] = [];

  const evaluateValues = (key: string, values: string[]) => {
    let emailMatches = 0;
    let phoneMatches = 0;
    let addressMatches = 0;
    let nameLike = 0;
    for (const v of values) {
      if (emailRx.test(v)) emailMatches++;
      if (phoneRx.test(v)) phoneMatches++;
      if (addressHintRx.test(v) || /,/.test(v)) addressMatches++;
      if (nameHintRx.test(v) && v.split(/\s+/).length <= 4 && !emailRx.test(v) && !phoneRx.test(v)) nameLike++;
    }
    const total = values.length || 1;
    return {
      emailScore: emailMatches / total,
      phoneScore: phoneMatches / total,
      addressScore: addressMatches / total,
      nameScore: nameLike / total,
      samples: values
    };
  };

  for (const rawKey of Object.keys(samples)) {
    const values = samples[rawKey];
    const { emailScore, phoneScore, addressScore, nameScore, samples: s } = evaluateValues(rawKey, values);

    const source = rawKey.startsWith('private:') ? 'extended.private'
      : rawKey.startsWith('shared:') ? 'extended.shared'
      : rawKey.startsWith('desc:') ? 'description'
      : rawKey === 'location' ? 'location'
      : rawKey.startsWith('attendee:') ? 'attendee'
      : rawKey.startsWith('creator:') ? 'creator'
      : 'unknown';

    if (emailScore > 0) emailCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: emailScore, samples: s });
    if (phoneScore > 0) phoneCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: phoneScore, samples: s });
    if (addressScore > 0) pickupCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: addressScore, samples: s });
    if (nameScore > 0) nameCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: nameScore, samples: s });
  }

  for (const label of Object.keys(labelSamples)) {
    const values = labelSamples[label];
    const { emailScore, phoneScore, addressScore, nameScore, samples: s } = evaluateValues(label, values);
    const source = 'description';
    if (emailScore > 0) emailCandidates.push({ key: label, source, score: emailScore, samples: s });
    if (phoneScore > 0) phoneCandidates.push({ key: label, source, score: phoneScore, samples: s });
    if (addressScore > 0) pickupCandidates.push({ key: label, source, score: addressScore, samples: s });
    if (nameScore > 0) nameCandidates.push({ key: label, source, score: nameScore, samples: s });
  }

  const choose = (cands: CandidateScore[], minScore = 0.5) => {
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    if (best.score >= minScore) return { key: best.key, source: best.source, score: best.score, samples: best.samples };
    return null;
  };

  const chosenEmail = choose(emailCandidates, 0.5);
  const chosenPhone = choose(phoneCandidates, 0.5);
  const chosenPickup = choose(pickupCandidates, 0.4);

  let chosenFirst = null, chosenLast = null, chosenNameFull = null;
  const lookFirstKeys = ['first_name','first-name','first name','given_name','givenName','given-name'];
  const lookLastKeys =  ['last_name','last-name','last name','surname','family_name'];
  for (const k of Object.keys(samples)) {
    const simple = k.replace(/^(private:|shared:|desc:)/,'');
    if (!chosenFirst && lookFirstKeys.includes(simple) && samples[k].length) {
      const ev = evaluateValues(k, samples[k]);
      if (ev.nameScore > 0) chosenFirst = { key: simple, source: k.startsWith('private:') ? 'extended.private' : k.startsWith('shared:') ? 'extended.shared' : 'description', score: ev.nameScore, samples: samples[k] };
    }
    if (!chosenLast && lookLastKeys.includes(simple) && samples[k].length) {
      const ev = evaluateValues(k, samples[k]);
      if (ev.nameScore > 0) chosenLast = { key: simple, source: k.startsWith('private:') ? 'extended.private' : k.startsWith('shared:') ? 'extended.shared' : 'description', score: ev.nameScore, samples: samples[k] };
    }
  }
  if (!chosenFirst && nameCandidates.length) {
    const bestName = choose(nameCandidates, 0.5);
    if (bestName) {
      chosenNameFull = { key: bestName.key, source: bestName.source, score: bestName.score, samples: bestName.samples };
    }
  }

  const mapping: Record<string, { key: string | null, source: string | null, score: number | null, examples?: string[] }> = {
    first_name: chosenFirst ? { key: chosenFirst.key, source: chosenFirst.source, score: chosenFirst.score, examples: chosenFirst.samples } : (chosenNameFull ? { key: chosenNameFull.key, source: chosenNameFull.source, score: chosenNameFull.score, examples: chosenNameFull.samples } : { key: null, source: null, score: null }),
    last_name: chosenLast ? { key: chosenLast.key, source: chosenLast.source, score: chosenLast.score, examples: chosenLast.samples } : (chosenNameFull ? { key: chosenNameFull.key, source: chosenNameFull.source, score: chosenNameFull.score, examples: chosenNameFull.samples } : { key: null, source: null, score: null }),
    email: chosenEmail ? { key: chosenEmail.key, source: chosenEmail.source, score: chosenEmail.score, examples: chosenEmail.samples } : { key: null, source: null, score: null },
    mobile: chosenPhone ? { key: chosenPhone.key, source: chosenPhone.source, score: chosenPhone.score, examples: chosenPhone.samples } : { key: null, source: null, score: null },
    pickup: chosenPickup ? { key: chosenPickup.key, source: chosenPickup.source, score: chosenPickup.score, examples: chosenPickup.samples } : { key: null, source: null, score: null }
  };

  return { mapping, candidates: { emailCandidates, phoneCandidates, pickupCandidates, nameCandidates }, rawSamples: samples };
}

/* small helper to extract a mapped value from an event (if mapping says source/key) */
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function getMappedValueFromEvent(e: any, mapEntry: { key: string|null, source: string|null }|null): string|null {
  if (!mapEntry || !mapEntry.key || !mapEntry.source) return null;
  const key = mapEntry.key;
  const source = mapEntry.source;
  try {
    if (source === 'extended.private') return e.extendedProperties?.private?.[key] ?? null;
    if (source === 'extended.shared') return e.extendedProperties?.shared?.[key] ?? null;
    if (source === 'location') return typeof e.location === 'string' && e.location.trim().length ? e.location.trim() : null;
    if (source === 'attendee') {
      if (Array.isArray(e.attendees) && e.attendees.length) {
        const a = e.attendees.find((x:any)=>x.email && x.email !== '') ?? e.attendees[0];
        return a?.[key] ?? (a?.displayName ?? null);
      }
      return null;
    }
    if (source === 'creator' || source === 'organizer') {
      const obj = e.creator ?? e.organizer;
      return obj?.[key] ?? null;
    }
    if (source === 'description') {
      if (typeof e.description !== 'string') return null;
      const label = escapeRegExp(key);
      const rx = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, 'i');
      const m = e.description.match(rx);
      if (m && m[1]) return m[1].split(/\r?\n/)[0].trim();
      const blockRx = new RegExp(`${label}[\\s\\S]{0,60}[:\\-]\\s*([^\\n\\r]+)`, 'i');
      const bm = e.description.match(blockRx);
      if (bm && bm[1]) return bm[1].trim();
      return null;
    }
  } catch (ex) {}
  return null;
}

/* Deno function entrypoint (POST handler) */
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: "Use POST with JSON: { calendar_id: '...' }" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(()=> ({}));
    const calendar_id = String(body?.calendar_id || "").trim();
    if (!calendar_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing calendar_id in request body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const supa = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supa || !key) return new Response(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers: { "Content-Type": "application/json" } });

    const accessToken = await getAccessToken();

    // fetch sample events (30d window)
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const future = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events?singleEvents=true&orderBy=startTime&timeMin=${past.toISOString()}&timeMax=${future.toISOString()}&maxResults=500`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) {
      const txt = await listRes.text().catch(()=>"(no text)");
      return new Response(JSON.stringify({ ok:false, error: `Google API error ${listRes.status}`, detail: txt }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
    const listData = await listRes.json();
    const events = listData.items ?? [];

    const detect = detectFieldMappings(events, { sampleLimit: 200 });
    const mapping = detect.mapping ?? {};

    // persist mapping in gcal_state (upsert)
    try {
      const persistRows = [{
        calendar_id,
        field_map: mapping,
        updated_at: new Date().toISOString()
      }];
      const up = await fetch(`${supa}/rest/v1/gcal_state?on_conflict=calendar_id`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(persistRows)
      });
      if (!up.ok) {
        const t = await up.text().catch(()=>"(no text)");
        console.warn("Persist mapping failed:", up.status, t);
      }
    } catch (e) {
      console.warn("Persist mapping error:", e);
    }

    return new Response(JSON.stringify({ ok: true, mapping, samples: detect.rawSamples }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("field-mapper error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});