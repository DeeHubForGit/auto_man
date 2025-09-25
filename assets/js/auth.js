// Supabase Auth helpers for static site
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  function byId(id){ return document.getElementById(id); }

  async function refreshHeader(){
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const loginLink = byId('loginLink');
    const loginLinkMobile = byId('loginLinkMobile');
    const authControls = byId('authControls');
    const emailEl = byId('authUserEmail');
    const logoutBtn = byId('logoutBtn');

    if (session && session.user){
      if (emailEl) emailEl.textContent = session.user.email || '';
      if (authControls) authControls.classList.remove('hidden');
      if (loginLink) loginLink.classList.add('hidden');
      if (loginLinkMobile) loginLinkMobile.classList.add('hidden');
      if (logoutBtn) logoutBtn.onclick = async function(){
        await window.supabaseClient.auth.signOut();
        // simple refresh to update UI
        location.reload();
      };
    } else {
      if (authControls) authControls.classList.add('hidden');
      if (loginLink) loginLink.classList.remove('hidden');
      if (loginLinkMobile) loginLinkMobile.classList.remove('hidden');
    }
  }

  // Auth actions
  async function signInWithOAuth(provider){
    if (!window.supabaseClient) return alert('Auth not configured');
    const redirectTo = window.location.origin + '/index.html';
    const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) alert('Sign-in error: ' + error.message);
  }

  async function signInWithMagicLink(email){
    if (!window.supabaseClient) return alert('Auth not configured');
    const redirectTo = window.location.origin + '/index.html';
    const { error } = await window.supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) alert('Error: ' + error.message); else alert('Check your email for the login link.');
  }

  async function signUpWithEmail(email, password){
    if (!window.supabaseClient) return alert('Auth not configured');
    const redirectTo = window.location.origin + '/index.html';
    const { error } = await window.supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) alert('Sign-up error: ' + error.message); else alert('Check your email to confirm your account.');
  }

  async function signInWithPassword(email, password){
    if (!window.supabaseClient) return alert('Auth not configured');
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert('Login error: ' + error.message);
    // logged in
    const next = new URLSearchParams(location.search).get('next') || 'index.html';
    location.href = next;
  }

  // Expose
  window.AuthUI = {
    signInWithGoogle: function(){ return signInWithOAuth('google'); },
    signInWithFacebook: function(){ return signInWithOAuth('facebook'); },
    signInWithMagicLink,
    signUpWithEmail,
    signInWithPassword,
    refreshHeader
  };

  ready(refreshHeader);
})();
