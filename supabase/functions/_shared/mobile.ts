// supabase/functions/_shared/mobile.ts

// Keep helpers here so all Edge Functions share one AU mobile rule.

export function normaliseDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

export function parseAuMobile(mobile: string | null | undefined): {
  raw: string | null;
  digits: string | null;
  e164: string | null;
  isValid: boolean;
} {
  if (!mobile) return { raw: null, digits: null, e164: null, isValid: false };

  const raw = mobile.trim();
  if (!raw) return { raw: null, digits: null, e164: null, isValid: false };

  const digits = normaliseDigits(raw);

  // Accept 04xxxxxxxx or 614xxxxxxxx
  if (!/^(04\d{8}|614\d{8})$/.test(digits)) {
    return { raw, digits, e164: null, isValid: false };
  }

  const e164 = digits.startsWith("04")
    ? `+61${digits.slice(1)}`
    : `+${digits}`; // 614...

  return { raw, digits, e164, isValid: true };
}

// Normalise AU mobile for comparison (always returns 04xxxxxxxx format or null)
export function normaliseAuMobileForCompare(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  
  const digits = normaliseDigits(mobile.trim());
  
  // Convert 614xxxxxxxx to 04xxxxxxxx
  if (/^614\d{8}$/.test(digits)) {
    return `04${digits.slice(3)}`;
  }
  
  // Already in 04xxxxxxxx format
  if (/^04\d{8}$/.test(digits)) {
    return digits;
  }
  
  return null;
}
