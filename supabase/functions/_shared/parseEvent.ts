// Robust parser for Google Calendar events -> booking fields

export type ParsedBooking = {
  service_code?: string | null;
  price_cents?: number | null;
  pickup_location?: string | null;
  extended?: boolean | null;
  notes?: string | null;
};

export function parseGcalEvent(event: any): ParsedBooking {
  const out: ParsedBooking = {
    service_code: null,
    price_cents: null,
    pickup_location: null,
    extended: null,
    notes: null,
  };

  const priv = getPriv(event);
  const shared = getShared(event);

  // 1) Prefer extendedProperties
  out.service_code = coalesceStr(priv?.service_code, shared?.service_code);
  out.price_cents = firstNum([
    toCents(priv?.price_cents),
    toCents(shared?.price_cents),
  ]);
  out.pickup_location = coalesceStr(priv?.pickup_location, shared?.pickup_location);
  out.extended = toBool(firstDefined([priv?.extended, shared?.extended]));
  out.notes = coalesceStr(priv?.notes, shared?.notes);

  // 2) Fallbacks from description/location/summary
  const desc = String(event?.description ?? "");
  const loc = String(event?.location ?? "");
  const summary = String(event?.summary ?? "");

  const kv = parseKV(desc);

  out.service_code ||= pickStr([
    kv.get("service_code"),
    kv.get("service"),
    kv.get("service code"),
    findServiceCode(summary),
  ]);

  const centsFromDesc = toCents(
    pickStr([kv.get("price_cents"), kv.get("price (aud)"), kv.get("price")])
  );
  if (out.price_cents == null && centsFromDesc != null) out.price_cents = centsFromDesc;

  out.pickup_location ||= pickStr([kv.get("pickup_location"), kv.get("pickup"), loc || null]);

  const extFromDesc = toBool(pickStr([kv.get("extended"), kv.get("ext"), kv.get("extra")]));
  if (out.extended == null && extFromDesc != null) out.extended = extFromDesc;

  out.notes ||= kv.get("notes") || null;

  return out;
}

// -------- helpers (flat, no nesting) --------
export function getPriv(e: any): Record<string, any> | null {
  return e?.extendedProperties?.private ?? null;
}

export function getShared(e: any): Record<string, any> | null {
  return e?.extendedProperties?.shared ?? null;
}

export function coalesceStr(...vals: any[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function pickStr(vals: any[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function firstDefined(vals: any[]): any {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
}

export function firstNum(vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function toCents(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (String(v).includes(".")) return Math.round(num * 100);
  if (num >= 1000) return Math.round(num);      // likely already cents
  return Math.round(num * 100);                  // dollars -> cents
}

export function toBool(v: any): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

export function parseKV(text: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!text) return map;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z _-]{2,40})\s*[:\-]\s*(.+)$/);
    if (!m) continue;
    map.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return map;
}

export function findServiceCode(summary: string): string | null {
  const m = summary.match(/\b([a-z0-9]+_[a-z0-9]+)\b/i); // e.g., auto_60
  return m ? m[1] : null;
}
