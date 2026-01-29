// supabase/functions/email/index.ts
// Send an email via Resend REST API
// Env: RESEND_API_KEY

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
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing to, subject or html' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(req),
        },
      });
    }

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
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
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
