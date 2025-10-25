// Robust parsers for Google Calendar booking events.
// Place this file inside supabase/functions/gcal-sync/ and import from index.ts:
// import { extractContactFromEvent, extractPickupFromEvent } from "./gcal-parsers.ts";

const EMAIL_RX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
const PHONE_RX = /(\+?\d[\d\-\s\(\)]{5,}\d)/;

/* Convert HTML-ish description into plain text lines:
   - replace <br>, <br/> and <p> with newlines
   - remove tags
   - decode common HTML entities (basic)
*/
function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  // Normalize common breaks to newlines
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*p\s*\/?\s*>/gi, "\n");
  // Remove tags
  s = s.replace(/<\/?[^>]+(>|$)/g, "");
  // Decode a few common entities (expand if needed)
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  // Trim each line and collapse multiple blank lines
  const lines = s.split(/\r?\n/).map(l => l.trim());
  return lines.join("\n").replace(/\n{2,}/g, "\n\n").trim();
}

/* Parse labelled answers from description text lines.
   Looks for labels like:
   - "Booked by" -> next non-empty line is name (then possibly email on following line)
   - "Email address" or email anywhere -> captured
   - "Mobile" or "Phone" -> next non-empty line is phone
   - "Pickup Address" or "Pickup" -> next non-empty line is pickup
*/
function parseDescriptionFields(descHtml: string | null | undefined) {
  const text = htmlToText(descHtml);
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lines = rawLines; // already trimmed & filtered blanks

  let name: string | null = null;
  let email: string | null = null;
  let mobile: string | null = null;
  let pickup: string | null = null;

  // Quick email search anywhere
  for (const l of lines) {
    const m = l.match(EMAIL_RX);
    if (m) {
      email = m[0];
      break;
    }
  }

  // Scan for labelled blocks (Booked by, Mobile, Pickup Address)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();

    if (!name && /^booked by$/i.test(lines[i])) {
      // next non-empty line is likely the name
      if (i + 1 < lines.length) {
        name = lines[i + 1] || null;
        // check following line for email if not already found
        if (!email && i + 2 < lines.length) {
          const m = lines[i + 2].match(EMAIL_RX);
          if (m) email = m[0];
        }
      }
    }

    // Sometimes label and value are on same line "Booked by: John Reed"
    const bookedInline = lines[i].match(/^Booked by\s*[:\-]\s*(.+)$/i);
    if (!name && bookedInline) {
      name = bookedInline[1].trim();
    }

    // Mobile
    if (!mobile && /^mobile$/i.test(lines[i])) {
      if (i + 1 < lines.length) mobile = lines[i + 1] || null;
      continue;
    }
    const mobileInline = lines[i].match(/^(?:Mobile|Phone)\s*[:\-]\s*(.+)$/i);
    if (!mobile && mobileInline) {
      mobile = mobileInline[1].trim();
      continue;
    }
    // Pickup
    if (!pickup && /^pickup address$/i.test(lines[i])) {
      if (i + 1 < lines.length) pickup = lines[i + 1] || null;
      continue;
    }
    const pickupInline = lines[i].match(/^(?:Pickup Address|Pickup)\s*[:\-]\s*(.+)$/i);
    if (!pickup && pickupInline) {
      pickup = pickupInline[1].trim();
      continue;
    }
  }

  // If we still don't have name, try common "Booked by" patterns inside same block
  if (!name) {
    // Try first line if it looks like a name (no email/phone)
    for (const l of lines) {
      if (!EMAIL_RX.test(l) && !PHONE_RX.test(l) && /^[A-Za-z\-' ]{2,}$/.test(l) && l.split(/\s+/).length <= 4) {
        name = l;
        break;
      }
    }
  }

  // Normalize mobile (strip non-digits except leading +)
  if (mobile) {
    mobile = String(mobile).replace(/[^\d+]/g, "");
  } else {
    // fallback: try to find any phone-like token in lines
    for (const l of lines) {
      const m = l.match(PHONE_RX);
      if (m) {
        mobile = m[1].replace(/[^\d+]/g, "");
        break;
      }
    }
  }

  // Split name into first/last
  let first_name: string | null = null;
  let last_name: string | null = null;
  if (name) {
    const parts = name.trim().split(/\s+/, 2);
    first_name = parts[0] || null;
    last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
  }

  return { first_name, last_name, email, mobile, pickup };
}

/* Exported helper: extract pickup from event (location / extendedProperties / description)
   Prefers: e.location -> extendedProperties.private/shared (common keys) -> description labels.
*/
export function extractPickupFromEvent(e: any): string | null {
  if (!e) return null;
  // 1) explicit location
  if (typeof e.location === "string" && e.location.trim().length > 0) return e.location.trim();

  // 2) extendedProperties (common keys)
  const epPrivate = e.extendedProperties?.private ?? {};
  const epShared = e.extendedProperties?.shared ?? {};
  const candidateKeys = ["pickup_address", "pickup", "Pickup Address", "Pickup", "pickupAddress", "pickup-address"];
  for (const k of candidateKeys) {
    if (epPrivate && typeof epPrivate[k] === "string" && epPrivate[k].trim().length > 0) return epPrivate[k].trim();
    if (epShared && typeof epShared[k] === "string" && epShared[k].trim().length > 0) return epShared[k].trim();
  }

  // 3) description labels (HTML or plain)
  const parsed = parseDescriptionFields(e.description);
  if (parsed.pickup) return parsed.pickup;

  return null;
}

/* Exported helper: extract contact info (first_name, last_name, email, mobile)
   Prefers: attendee (guest) -> extendedProperties -> description -> creator
*/
export function extractContactFromEvent(e: any): { first_name: string | null, last_name: string | null, email: string | null, mobile: string | null } {
  if (!e) return { first_name: null, last_name: null, email: null, mobile: null };

  // 1) Prefer a non-self attendee (guest)
  const attendees = Array.isArray(e.attendees) ? e.attendees : [];
  const guest = attendees.find((a: any) => !a.self && a.email) ?? attendees.find(Boolean) ?? null;
  if (guest) {
    const emailFromAtt = guest.email ?? null;
    const display = guest.displayName ?? guest.displayname ?? null;
    let first = null, last = null;
    if (typeof display === "string" && display.trim().length > 0) {
      const parts = display.trim().split(/\s+/, 2);
      first = parts[0] || null;
      last = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }
    // Phone sometimes present on attendee object
    const phoneFromAtt = guest.phone ?? guest.displayPhone ?? null;
    const mobileNorm = phoneFromAtt ? String(phoneFromAtt).replace(/[^\d+]/g, "") : null;
    return { first_name: first, last_name: last, email: emailFromAtt, mobile: mobileNorm };
  }

  // 2) extendedProperties (private/shared)
  const epPrivate = e.extendedProperties?.private ?? {};
  const epShared = e.extendedProperties?.shared ?? {};
  const keySets = {
    first: ["first_name", "first-name", "first name", "given_name", "givenName", "given-name"],
    last:  ["last_name", "last-name", "last name", "surname", "family_name"],
    email: ["email", "email_address", "email-address", "your_email", "Email address"],
    mobile:["mobile", "mobile_number", "mobile-number", "phone", "phone_number", "phone-number"]
  };
  const pickKey = (obj: any, keys: string[]) => {
    for (const k of keys) {
      if (obj && typeof obj[k] === "string" && obj[k].trim().length > 0) return obj[k].trim();
    }
    return null;
  };
  const firstFromEp = pickKey(epPrivate, keySets.first) ?? pickKey(epShared, keySets.first);
  const lastFromEp  = pickKey(epPrivate, keySets.last)  ?? pickKey(epShared, keySets.last);
  const emailFromEp = pickKey(epPrivate, keySets.email) ?? pickKey(epShared, keySets.email);
  const mobileFromEp= pickKey(epPrivate, keySets.mobile) ?? pickKey(epShared, keySets.mobile);
  if (firstFromEp || lastFromEp || emailFromEp || mobileFromEp) {
    const normalizedMobile = mobileFromEp ? mobileFromEp.replace(/[^\d+]/g, '') : null;
    return { first_name: firstFromEp ?? null, last_name: lastFromEp ?? null, email: emailFromEp ?? null, mobile: normalizedMobile };
  }

  // 3) description parse (handles booking form HTML)
  const parsed = parseDescriptionFields(e.description);
  if (parsed.first_name || parsed.email || parsed.mobile) {
    return { first_name: parsed.first_name, last_name: parsed.last_name, email: parsed.email, mobile: parsed.mobile };
  }

  // 4) fallback to creator/organizer metadata
  const creatorEmail = e.creator?.email ?? null;
  const creatorName = e.creator?.displayName ?? e.organizer?.displayName ?? null;
  if (creatorEmail || creatorName) {
    let first = null, last = null;
    if (typeof creatorName === 'string' && creatorName.trim().length > 0) {
      const parts = creatorName.trim().split(/\s+/, 2);
      first = parts[0] || null;
      last = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }
    return { first_name: first, last_name: last, email: creatorEmail, mobile: null };
  }

  return { first_name: null, last_name: null, email: null, mobile: null };
}