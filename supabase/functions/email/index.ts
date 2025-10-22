// supabase/functions/email/index.ts
// Send an email via Resend using npm package
// Env: RESEND_API_KEY

import { Resend } from 'npm:resend';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }

  const { to, subject, html } = await req.json();
  
  try {
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const data = await resend.emails.send({
      from: 'Auto-Man Driving School <onboarding@resend.dev>',
      to,
      subject,
      html
    });
    
    return new Response(JSON.stringify({
      ok: true,
      data
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({
      ok: false,
      error
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 500
    });
  }
});
