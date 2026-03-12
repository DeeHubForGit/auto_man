// Supabase Auth helpers for static site
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  function byId(id){ return document.getElementById(id); }

  // Check if session should be invalidated due to password change
  async function checkPasswordChangedSession(){
    if (!window.supabaseClient) return;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session || !session.access_token || !session.user) return;

      // Decode JWT to get iat (issued at) timestamp
      const token = session.access_token;
      const parts = token.split('.');
      if (parts.length !== 3) return;

      const payload = JSON.parse(atob(parts[1]));
      const tokenIat = payload.iat; // Unix timestamp in seconds

      if (!tokenIat) return;

      const tokenIssuedAt = new Date(tokenIat * 1000);

      // Query client table for password_changed_at
      const { data: clientData, error: clientError } = await window.supabaseClient
        .from('client')
        .select('id, password_changed_at')
        .eq('id', session.user.id)
        .single();

      if (clientError || !clientData) return;

      // If no password_changed_at, session is valid
      if (!clientData.password_changed_at) return;

      const passwordChangedAt = new Date(clientData.password_changed_at);

      // Log for debugging
      console.log('[auth] Session check:', {
        password_changed_at: passwordChangedAt.toISOString(),
        token_iat: tokenIssuedAt.toISOString(),
        should_logout: tokenIssuedAt < passwordChangedAt
      });

      // If session was issued before password change, invalidate it
      if (tokenIssuedAt < passwordChangedAt) {
        console.log('[auth] Session invalidated: password changed after token issuance');
        await window.supabaseClient.auth.signOut();

        // Avoid redirect loops on login/reset pages
        const currentPath = window.location.pathname.toLowerCase();
        if (!currentPath.includes('login.html') && !currentPath.includes('reset-password.html')) {
          window.location.href = '/login.html?session=expired';
        }
      }
    } catch (err) {
      console.error('[auth] Error checking password changed session:', err);
    }
  }

  async function refreshHeader(){
    if (!window.supabaseClient) return;

    // Check if session should be invalidated before updating UI
    await checkPasswordChangedSession();

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
    if (!window.supabaseClient) {
      if (window.Modal) return window.Modal.error('Authentication is not configured. Please contact support.');
      return alert('Auth not configured');
    }
    const redirectTo = window.location.origin + '/index.html';
    const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error && window.Modal) window.Modal.error(error.message, 'Sign-in Error');
    else if (error) alert('Sign-in error: ' + error.message);
  }

  async function signInWithMagicLink(email){
    if (!window.supabaseClient) {
      if (window.Modal) return window.Modal.error('Authentication is not configured. Please contact support.');
      return alert('Auth not configured');
    }
    const redirectTo = window.location.origin + '/index.html';
    const { error } = await window.supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error && window.Modal) window.Modal.error(error.message);
    else if (error) alert('Error: ' + error.message);
    else if (window.Modal) window.Modal.success('Check your email for the login link.', 'Email Sent');
    else alert('Check your email for the login link.');
  }

  async function signUpWithEmail(email, password){
    if (!window.supabaseClient) {
      if (window.Modal) return window.Modal.error('Authentication is not configured. Please contact support.');
      return alert('Auth not configured');
    }

    const redirectTo = window.location.origin + '/portal.html';

    const { error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });

    if (error) {
      if (window.Modal) window.Modal.error(error.message, 'Sign-up Error');
      else alert('Sign-up error: ' + error.message);
      return;
    }

    window.location.replace('login.html?email=' + encodeURIComponent(email) + '&verify=1');
  }

  async function signInWithPassword(email, password){
    if (!window.supabaseClient) {
      const msg = 'Authentication is not configured. Please contact support.';
      if (window.Modal) window.Modal.error(msg);
      throw new Error(msg);
    }

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Login error:', error);

      const msg = (error && error.message ? String(error.message) : '');
      const lower = msg.toLowerCase();

      // Do not show a popup for expected "not confirmed" state.
      // login.html shows the inline message.
      if (!(lower.includes('email not confirmed') || lower.includes('not confirmed'))) {
        if (window.Modal) window.Modal.error(msg, 'Login Error');
      }

      throw error;
    }

    // Check for password-invalidated sessions immediately after login
    await checkPasswordChangedSession();

    // logged in - redirect to portal immediately
    console.log('Login successful, user:', data.user?.email);
    const next = new URLSearchParams(window.location.search).get('next') || 'portal.html';
    console.log('Redirecting to:', next);
    window.location.replace(next); // Use replace to avoid back button issues
    return data; // Return data but redirect will happen first
  }

  // Expose
  window.AuthUI = {
    signInWithGoogle: function(){ return signInWithOAuth('google'); },
    signInWithFacebook: function(){ return signInWithOAuth('facebook'); },
    signInWithMagicLink,
    signUpWithEmail,
    signInWithPassword,
    refreshHeader,
    checkPasswordChangedSession  // Expose for manual checks
  };

  // Set up auth state change listener for immediate session invalidation
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      // Check session validity on any auth state change
      if (session && session.user) {
        await checkPasswordChangedSession();
      }
    });
  }

  ready(refreshHeader);
})();
