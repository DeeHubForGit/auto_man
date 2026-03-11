// supabase/functions/email/index.ts
// Send an email via Resend REST API
// Env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const allowedOrigins = [
  'https://www.automandrivingschool.com.au',
  'https://automandrivingschool.com.au',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Credentials': 'false',
  };
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(req),
      },
    });
  }

  try {
    // 1. Enforce origin check
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden: Invalid origin' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // 2. Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Missing authorization header' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid auth header' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ ok: false, error: 'Server configuration error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // Service role client (used for auth validation, admin check, rate limiting, logging)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Extract token from Authorization header
    const token = authHeader.replace('Bearer ', '').trim();

    // 3. Determine caller type: internal trusted caller or admin UI user
    let isInternalCaller = false;
    let actorClientId: string | null = null;

    if (token === supabaseServiceKey) {
      // Internal trusted caller (e.g. booking-email function)
      isInternalCaller = true;
      actorClientId = null;
    } else {
      // Admin UI caller - validate user and check admin status
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid token' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(req),
          },
        });
      }

      // Check admin status and get client ID
      const { data: clientRecord, error: clientError } = await supabaseAdmin
        .from('client')
        .select('id, is_admin')
        .eq('email', user.email)
        .single();

      if (clientError || !clientRecord) {
        console.error('Error fetching client record:', clientError);
        return new Response(JSON.stringify({ ok: false, error: 'Forbidden: User not found' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(req),
          },
        });
      }

      if (!clientRecord.is_admin) {
        return new Response(JSON.stringify({ ok: false, error: 'Forbidden: Admin access required' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(req),
          },
        });
      }

      isInternalCaller = false;
      actorClientId = clientRecord.id;
    }

    // 4. Parse and validate inputs
    const body = await req.json();
    let { to, subject, html, type, client_id } = body;

    // Type validation for required fields
    if (typeof to !== 'string' || typeof subject !== 'string' || typeof html !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid input types: to, subject, and html must be strings' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // Optional metadata from internal callers
    const emailType = typeof type === 'string' && type ? type : 'admin_email';
    const logClientId = isInternalCaller 
      ? (typeof client_id === 'string' ? client_id : null)
      : actorClientId;

    // Trim values
    to = to.trim();
    subject = subject.trim();
    html = html.trim();

    // Basic HTML sanitisation to reduce risk of script injection
    html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/on\w+="[^"]*"/gi, '');

    // Check for empty values
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or empty to, subject or html' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // Length validation
    if (to.length > 320) {
      return new Response(JSON.stringify({ ok: false, error: 'Recipient email too long (max 320 characters)' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    if (subject.length > 200) {
      return new Response(JSON.stringify({ ok: false, error: 'Subject too long (max 200 characters)' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    if (html.length > 20000) {
      return new Response(JSON.stringify({ ok: false, error: 'HTML content too long (max 20000 characters)' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // Email format validation
    if (!validateEmail(to)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid email address format' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    // 5. Rate limiting using email_log table (only for admin UI emails)
    if (!isInternalCaller && emailType === 'admin_email') {
      // Limit 1: Max 10 emails per user in 10 minutes
      const { count: userEmailCount, error: userCountError } = await supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', actorClientId)
        .eq('type', 'admin_email')
        .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

      if (userCountError) {
        console.error('Error checking user rate limit:', userCountError);
      } else if (userEmailCount !== null && userEmailCount >= 10) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'Rate limit exceeded: Maximum 10 emails per 10 minutes per user' 
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(req),
          },
        });
      }

      // Limit 2: Max 3 emails to same recipient in 10 minutes
      const { count: recipientEmailCount, error: recipientCountError } = await supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('to_email', to)
        .eq('type', 'admin_email')
        .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

      if (recipientCountError) {
        console.error('Error checking recipient rate limit:', recipientCountError);
      } else if (recipientEmailCount !== null && recipientEmailCount >= 3) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'Rate limit exceeded: Maximum 3 emails per recipient per 10 minutes' 
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(req),
          },
        });
      }
    }

    // 6. Send email via Resend
    const apiKey = Deno.env.get('RESEND_API_KEY') || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing RESEND_API_KEY' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    const payload = {
      from: 'Auto-Man Driving School <noreply@automandrivingschool.com.au>',
      to,
      subject,
      html,
    };

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }

    // 7. Log email send to email_log (using service role)
    const logEntry = {
      client_id: logClientId,
      to_email: to,
      subject: subject,
      type: emailType,
      status: r.ok ? 'sent' : 'failed',
      error_message: r.ok ? null : JSON.stringify(data),
      sent_at: new Date().toISOString(),
    };

    const { error: logError } = await supabaseAdmin
      .from('email_log')
      .insert(logEntry);

    if (logError) {
      console.error('Error logging email send:', logError);
    }

    if (!r.ok) {
      console.error('Resend API error', r.status, data);
      return new Response(JSON.stringify({ ok: false, status: r.status, data }), {
        status: r.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(req),
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(req),
      },
    });
  }
});
