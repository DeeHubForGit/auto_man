// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

function digits(v: string) { return (v || '').replace(/\D+/g, ''); }
function toE164Au(mobile: string): string | null {
  const d = digits(mobile);
  if (/^04\d{8}$/.test(d)) return `+61${d.slice(1)}`; // 04XXXXXXXX -> +614XXXXXXXX
  if (/^614\d{8}$/.test(d)) return `+${d}`;           // 614XXXXXXXX -> +614XXXXXXXX
  if (/^\+614\d{8}$/.test(mobile)) return mobile;    // already E.164
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const { to, message } = await req.json().catch(() => ({}));
    if (!to || !message) return json({ error: 'Missing to or message' }, 400);

    const e164 = toE164Au(String(to));
    if (!e164) return json({ error: 'Invalid AU mobile. Use 04XXXXXXXX or +614XXXXXXXX' }, 400);

    const USER = Deno.env.get('CLICKSEND_USERNAME');
    const KEY = Deno.env.get('CLICKSEND_API_KEY');
    const SENDER = Deno.env.get('SMS_SENDER') || Deno.env.get('CLICKSEND_SENDER') || 'Auto-Man';

    if (!USER || !KEY) {
      console.error('[sms] Missing ClickSend credentials');
      return json({ error: 'Server not configured' }, 500);
    }

    // ClickSend payload
    const payload = {
      messages: [
        {
          to: e164,
          body: String(message).slice(0, 1600),
          source: 'api',
          from: SENDER,
        },
      ],
    };

    const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${USER}:${KEY}`),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    
    console.log('[sms] ClickSend response:', {
      status: res.status,
      ok: res.ok,
      data: JSON.stringify(data)
    });
    
    if (!res.ok) {
      console.error('[sms] ClickSend error:', res.status, data);
      return json({ error: 'SMS send failed', details: data }, 502);
    }

    // Return the full ClickSend response so frontend can check it
    return json({ ok: true, clicksend: data });
  } catch (e) {
    console.error('[sms] unexpected error', e);
    return json({ error: 'Unexpected error' }, 500);
  }
});
