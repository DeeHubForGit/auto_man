// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Simple JSON response helper
function json(body: unknown, init: number | ResponseInit = 200) {
  const initObj: ResponseInit = typeof init === 'number' ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      ...(initObj.headers || {}),
    }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const { name, email, phone, message } = await req.json().catch(() => ({}));
    if (!name || !email || !message) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const TO_EMAIL = Deno.env.get('CONTACT_TO_EMAIL') || 'info@automandrivingschool.com.au';
    const FROM_EMAIL = Deno.env.get('CONTACT_FROM_EMAIL') || 'no-reply@automandrivingschool.com.au';
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      console.error('[contact] Missing RESEND_API_KEY env');
      return json({ error: 'Server not configured' }, 500);
    }

    const subject = `Website contact form (Auto-Man)`;
    const text = `New contact enquiry\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\n\nMessage:\n${message}\n`;

    // Log into contact_messages (if table exists)
    try {
      const supa = Deno.env.get('SUPABASE_URL')!;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${supa}/rest/v1/contact_messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify([{ name, email, phone, message, created_at: new Date().toISOString() }])
      });
    } catch (_) {
      // best effort
    }

    // Send via Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject,
        text,
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      console.error('[contact] Resend failure:', res.status, errTxt);
      return json({ error: 'Email send failed' }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[contact] unexpected error', e);
    return json({ error: 'Unexpected error' }, 500);
  }
});
