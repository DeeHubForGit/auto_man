// supabase/functions/email-test/index.ts
import { Resend } from 'npm:resend';
Deno.serve(async (req)=>{
  try {
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const data = await resend.emails.send({
      from: 'Auto-Man Driving School <noreply@automandrivingschool.com.au>',
      to: 'darren@automandrivingschool.com.au',
      subject: 'Test Email - Domain Verified!',
      html: '<h1>Success!</h1><p>Your domain is verified and ready to send emails! 🎉</p>'
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
    console.error('Email send error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 500
    });
  }
});
