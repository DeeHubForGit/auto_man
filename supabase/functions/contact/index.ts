import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Input validation helpers
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function isValidAUPhone(phone: string): boolean {
  // AU phone formats: 04XX XXX XXX or (0X) XXXX XXXX
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^0[2-478]\d{8}$/.test(cleaned) || /^04\d{8}$/.test(cleaned);
}

function sanitizeString(str: string, maxLength: number): string {
  return str.trim().slice(0, maxLength);
}

// Simple in-memory rate limiter (sliding window)
// For production with multiple instances, consider Upstash Redis
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string, maxRequests = 3, windowMs = 3600000): boolean {
  const now = Date.now();
  const key = `contact:${ip}`;
  
  // Get existing attempts and filter to only recent ones
  const attempts = rateLimitMap.get(key) || [];
  const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
  
  // Check if over limit
  if (recentAttempts.length >= maxRequests) {
    return true;
  }
  
  // Add current attempt and update map
  recentAttempts.push(now);
  rateLimitMap.set(key, recentAttempts);
  
  // Cleanup old entries periodically (simple GC)
  if (Math.random() < 0.01) { // 1% chance to cleanup
    for (const [k, timestamps] of rateLimitMap.entries()) {
      const recent = timestamps.filter(t => now - t < windowMs);
      if (recent.length === 0) {
        rateLimitMap.delete(k);
      } else {
        rateLimitMap.set(k, recent);
      }
    }
  }
  
  return false;
}

// Simple JSON response helper with CORS security
function json(body: unknown, init: number | ResponseInit = 200, req?: Request) {
  const initObj: ResponseInit = typeof init === 'number' ? { status: init } : init;
  
  // Restrict CORS to known origins
  const allowedOrigins = [
    'https://www.automandrivingschool.com.au',
    'https://automandrivingschool.com.au',
    'http://localhost:8080', // Local development
    'http://127.0.0.1:8080',
  ];
  
  const origin = req?.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : "null";
  
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
      'access-control-allow-credentials': 'false',
      ...(initObj.headers || {}),
    }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200, req);
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, req);

  try {
    // Rate limiting check - get IP from headers
    const ip = req.headers.get('cf-connecting-ip') || 
               req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               req.headers.get('x-real-ip') || 
               'unknown';
    
    if (isRateLimited(ip)) {
      console.warn(`[contact] Rate limit exceeded for IP: ${ip}`);
      return json({ 
        error: 'Too many contact form submissions. Please try again later.' 
      }, 429, req);
    }

    const { name, email, phone, message } = await req.json().catch(() => ({}));
    
    // Enhanced input validation
    if (!name || !email || !message) {
      return json({ error: 'Missing required fields' }, 400, req);
    }

    // Validate and sanitize inputs
    const sanitizedName = sanitizeString(name, 100);
    const sanitizedEmail = sanitizeString(email, 254);
    const sanitizedPhone = phone ? sanitizeString(phone, 20) : '';
    const sanitizedMessage = sanitizeString(message, 5000);

    if (sanitizedName.length < 1 || sanitizedName.length > 100) {
      return json({ error: 'Name must be between 1 and 100 characters' }, 400, req);
    }

    if (!isValidEmail(sanitizedEmail)) {
      return json({ error: 'Invalid email format' }, 400, req);
    }

    if (sanitizedMessage.length < 10) {
      return json({ error: 'Message must be at least 10 characters' }, 400, req);
    }

    if (sanitizedMessage.length > 5000) {
      return json({ error: 'Message is too long (max 5000 characters)' }, 400, req);
    }

    if (sanitizedPhone && !isValidAUPhone(sanitizedPhone)) {
      return json({ error: 'Invalid Australian phone number format' }, 400, req);
    }

    const TO_EMAIL = Deno.env.get('CONTACT_TO_EMAIL') || 'info@automandrivingschool.com.au';
    const FROM_EMAIL = Deno.env.get('CONTACT_FROM_EMAIL') || 'onboarding@resend.dev';
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      console.error('[contact] Missing RESEND_API_KEY env');
      return json({ error: 'Server not configured' }, 500, req);
    }

    const subject = `Website contact form (Auto-Man)`;
    const text = `New contact enquiry\n\nName: ${sanitizedName}\nEmail: ${sanitizedEmail}\nPhone: ${sanitizedPhone || '-'}\n\nMessage:\n${sanitizedMessage}\n`;

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
        body: JSON.stringify([{ 
          name: sanitizedName, 
          email: sanitizedEmail, 
          phone: sanitizedPhone || null, 
          message: sanitizedMessage, 
          created_at: new Date().toISOString() 
        }])
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
      return json({ error: 'Email send failed' }, 502, req);
    }

    return json({ ok: true }, 200, req);
  } catch (e) {
    console.error('[contact] unexpected error', e);
    return json({ error: 'Unexpected error' }, 500, req);
  }
});
