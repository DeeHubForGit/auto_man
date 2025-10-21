// Single global Supabase client for the whole site
(function () {
  if (window.supabaseClient) return; // already initialized

  var url = window.SUPABASE_URL;
  var key = window.SUPABASE_ANON_KEY;
  if (!url || !key || !window.supabase) {
    console.error('[supabaseClient] Missing SUPABASE_URL/ANON_KEY or supabase lib');
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
        storageKey: 'sb-automansite-auth',
      },
    });
    window.supabaseClient.auth.getSession().then(({ data }) => {
      console.log('[supabaseClient] restored session:', !!data?.session);
    });
  } catch (e) {
    console.error('[supabaseClient] init failed:', e);
  }
})();

