// supabase/functions/email/index.ts
// Send an email via Resend using npm package
// Env: RESEND_API_KEY
import { Resend } from 'https://esm.sh/resend@4.4.0?target=deno';

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

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const data = await resend.emails.send({
      from: 'Auto-Man Driving School <noreply@automandrivingschool.com.au>',
      to,
      subject,
      html,
    });

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
