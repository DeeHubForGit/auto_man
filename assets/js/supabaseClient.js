// Fill these with your Supabase project details (Project Settings → API)
// It is safe to expose the anon key in the browser. Do NOT put the service role key here.
(function(){
  var URL = window.SUPABASE_URL || '';
  var KEY = window.SUPABASE_ANON_KEY || '';
  if (!URL || !KEY || !window.supabase) {
    // Leave a hint for developers in console without spamming users
    console && console.log && console.log('[supabase] Not initialized. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY or hardcode here.');
    return;
  }
  window.supabaseClient = window.supabase.createClient(URL, KEY);
})();
