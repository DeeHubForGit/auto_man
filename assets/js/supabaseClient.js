// Single global Supabase client for the whole site
(function () {
  if (window.supabaseClient) return; // already initialized

  // Try both direct globals and SITE_CONFIG for backwards compatibility
  var url = window.SUPABASE_URL || window.SITE_CONFIG?.SUPABASE_URL;
  var key = window.SUPABASE_ANON_KEY || window.SITE_CONFIG?.SUPABASE_ANON_KEY;
  if (!url || !key || !window.supabase) {
    console.error('[supabaseClient] Missing SUPABASE_URL/ANON_KEY or supabase lib. Check config.js and ensure SITE_CONFIG is loaded.');
    console.error('[supabaseClient] URL:', url, 'KEY:', key ? 'present' : 'missing', 'supabase lib:', !!window.supabase);
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        debug: false,  // Disable auth debug logging
        storageKey: 'sb-automansite-auth',
      },
    });
    
    // Silently restore session, handle refresh token errors gracefully
    window.supabaseClient.auth.getSession().catch(function(err) {
      // Ignore refresh token errors - user just needs to log in again
      if (err?.code === 'refresh_token_not_found' || err?.message?.includes('Refresh Token')) {
        console.log('[supabaseClient] Session expired, user needs to log in');
        // Clear invalid session data
        try {
          Object.keys(localStorage).forEach(function(k) {
            if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k);
          });
        } catch (e) {}
      } else {
        console.warn('[supabaseClient] getSession error:', err);
      }
    });
  } catch (e) {
    console.error('[supabaseClient] init failed:', e);
  }
})();

