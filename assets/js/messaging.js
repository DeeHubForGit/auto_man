// /js/messaging.js
(function () {
  function fail(msg) {
    return { ok: false, error: msg };
  }

  async function sendSms({ to, message }) {
    const toTrim = (to || '').trim();
    const msgTrim = (message || '').trim();

    if (!toTrim) return fail('MISSING_TO');
    if (!msgTrim) return fail('MISSING_MESSAGE');

    if (window.Validation?.isValidAuMobile && !window.Validation.isValidAuMobile(toTrim)) {
      return fail('INVALID_MOBILE');
    }

    try {
      const { data, error } = await window.supabaseClient.functions.invoke('sms', {
        body: { to: toTrim, message: msgTrim },
        headers: { apikey: window.SITE_CONFIG.SUPABASE_ANON_KEY }
      });

      if (error) return fail(error.message || 'SMS_FAILED');

      if (!data?.ok) return fail('SMS_FAILED');

      const cs = data.clicksend || data.data;
      if (cs?.response_code === 'SUCCESS' || cs?.http_code === 200) {
        return { ok: true };
      }

      if (cs?.response_msg) {
        return fail(`ClickSend: ${cs.response_msg}`);
      }

      return fail('SMS_FAILED');
    } catch (e) {
      return fail(e.message || 'SMS_FAILED');
    }
  }

  async function sendEmail({ to, subject, text }) {
    const toTrim = (to || '').trim();
    const subjTrim = (subject || '').trim();
    const textTrim = (text || '').trim();

    if (!toTrim) return fail('MISSING_TO');
    if (!subjTrim) return fail('MISSING_SUBJECT');
    if (!textTrim) return fail('MISSING_BODY');

    if (window.Validation?.isValidEmail && !window.Validation.isValidEmail(toTrim)) {
      return fail('INVALID_EMAIL');
    }

    const html = `<p>${textTrim.replace(/\n/g, '<br>')}</p>`;
    const fnUrl = `${window.SITE_CONFIG.SUPABASE_URL}/functions/v1/email`;

    try {
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + window.SITE_CONFIG.SUPABASE_ANON_KEY,
          'apikey': window.SITE_CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ to: toTrim, subject: subjTrim, html })
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) return fail(`HTTP_${resp.status}`);
      if (data?.ok) return { ok: true };

      return fail('EMAIL_FAILED');
    } catch (e) {
      return fail(e.message || 'EMAIL_FAILED');
    }
  }

  window.Messaging = {
    sendSms,
    sendEmail
  };
})();
