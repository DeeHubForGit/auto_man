// supabase/functions/sms/index.ts
// Send SMS via ClickSend REST API
// Env: CLICKSEND_USERNAME, CLICKSEND_API_KEY, SMS_SENDER, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const allowedOrigins = [
  'https://www.automandrivingschool.com.au',
  'https://automandrivingschool.com.au',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

function json(req: Request, body: unknown, init: number | ResponseInit = 200) {
  const initObj: ResponseInit = typeof init === 'number' ? { status: init } : init;
  const origin = req.headers.get('origin');
  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : (origin ? undefined : '*');
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {}),
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
      ...(initObj.headers || {}),
    }
  });
}

function digits(v: string) { return (v || '').replace(/\D+/g, ''); }

function toE164Au(mobile: string): string | null {
  const d = digits(mobile);
  if (/^04\d{8}$/.test(d)) return `+61${d.slice(1)}`; // 04XXXXXXXX -> +614XXXXXXXX
  if (/^614\d{8}$/.test(d)) return `+${d}`;           // 614XXXXXXXX or +614XXXXXXXX (after digit strip)
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (req.method !== 'POST') return json(req, { error: 'Method Not Allowed' }, 405);

  try {
    // 1. Enforce origin check
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      console.warn('[sms] Blocked request from disallowed origin:', origin);
      return json(req, { error: 'Forbidden: Invalid origin' }, 403);
    }

    // 2. Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(req, { error: 'Unauthorized: Missing authorization header' }, 401);
    }

    if (!authHeader.startsWith('Bearer ')) {
      return json(req, { error: 'Unauthorized: Invalid auth header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[sms] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return json(req, { error: 'Server configuration error' }, 500);
    }

    // Service role client (validates auth, bypasses RLS for admin check, rate limiting, and logging)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json(req, { error: 'Unauthorized: Invalid token' }, 401);
    }

    // 3. Check admin status
    const { data: clientRecord, error: clientError } = await supabaseAdmin
      .from('client')
      .select('id, is_admin')
      .eq('email', user.email)
      .single();

    if (clientError || !clientRecord) {
      console.error('[sms] Error fetching client record:', clientError);
      return json(req, { error: 'Forbidden: User not found' }, 403);
    }

    if (!clientRecord.is_admin) {
      return json(req, { error: 'Forbidden: Admin access required' }, 403);
    }

    // 4. Parse and validate inputs
    const body = await req.json().catch(() => ({}));
    let { to, message } = body;

    // Type validation
    if (typeof to !== 'string' || typeof message !== 'string') {
      return json(req, { error: 'Invalid input types: to and message must be strings' }, 400);
    }

    // Trim values
    to = to.trim();
    message = message.trim();

    // Check for empty values
    if (!to || !message) {
      return json(req, { error: 'Missing or empty to or message' }, 400);
    }

    // Length validation (before normalization)
    if (to.length > 30) {
      return json(req, { error: 'Phone number too long (max 30 characters)' }, 400);
    }

    if (message.length > 1600) {
      return json(req, { error: 'Message too long (max 1600 characters)' }, 400);
    }

    // Normalize phone to E.164 format
    const e164 = toE164Au(to);
    if (!e164) {
      return json(req, { error: 'Invalid AU mobile. Use 04XXXXXXXX or +614XXXXXXXX' }, 400);
    }

    // 5. Rate limiting using sms_log table (with service role)
    // Limit 1: Max 10 SMS per admin user in 10 minutes
    const { count: userSmsCount, error: userCountError } = await supabaseAdmin
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientRecord.id)
      .eq('template', 'admin_sms')
      .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (userCountError) {
      console.error('[sms] Error checking user rate limit:', userCountError);
    } else if (userSmsCount !== null && userSmsCount >= 10) {
      return json(req, { 
        error: 'Rate limit exceeded: Maximum 10 SMS per 10 minutes per user' 
      }, 429);
    }

    // Limit 2: Max 3 SMS to same recipient in 10 minutes
    const { count: recipientSmsCount, error: recipientCountError } = await supabaseAdmin
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('to_phone', e164)
      .eq('template', 'admin_sms')
      .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (recipientCountError) {
      console.error('[sms] Error checking recipient rate limit:', recipientCountError);
    } else if (recipientSmsCount !== null && recipientSmsCount >= 3) {
      return json(req, { 
        error: 'Rate limit exceeded: Maximum 3 SMS per recipient per 10 minutes' 
      }, 429);
    }

    // 6. Send SMS via ClickSend
    const USER = Deno.env.get('CLICKSEND_USERNAME');
    const KEY = Deno.env.get('CLICKSEND_API_KEY');
    const SENDER = Deno.env.get('SMS_SENDER') || Deno.env.get('CLICKSEND_SENDER') || 'Auto-Man';

    if (!USER || !KEY) {
      console.error('[sms] Missing ClickSend credentials');
      return json(req, { error: 'Server not configured' }, 500);
    }

    // ClickSend payload
    const payload = {
      messages: [
        {
          to: e164,
          body: message,
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

    // 7. Log SMS send to sms_log (using service role)
    const providerId = data?.data?.messages?.[0]?.message_id || null;
    const logEntry = {
      client_id: clientRecord.id,
      to_phone: e164,
      template: 'admin_sms',
      body: message,
      provider: 'clicksend',
      provider_message_id: providerId,
      status: res.ok ? 'sent' : 'failed',
      error_message: res.ok ? null : JSON.stringify(data),
      sent_at: new Date().toISOString(),
    };

    const { error: logError } = await supabaseAdmin
      .from('sms_log')
      .insert(logEntry);

    if (logError) {
      console.error('[sms] Error logging SMS send:', logError);
    }
    
    if (!res.ok) {
      console.error('[sms] ClickSend error:', res.status, data);
      return json(req, { error: 'SMS send failed' }, 502);
    }

    return json(req, { ok: true });
  } catch (e) {
    console.error('[sms] unexpected error', e);
    return json(req, { error: 'Unexpected error' }, 500);
  }
});
