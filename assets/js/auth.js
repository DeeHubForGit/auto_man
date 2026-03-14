// Supabase Auth helpers for static site
(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  function byId(id){ return document.getElementById(id); }

  // In-flight promise tracker to prevent concurrent session checks
  let sessionCheckInFlight = null;

  // Helper: redirect to login on session expiry, avoiding loops on login/reset pages
  function redirectToLoginIfNeeded() {
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.includes('login.html') && !currentPath.includes('reset-password.html')) {
      window.location.href = '/login.html?session=expired';
    }
  }

  // Check if session should be invalidated due to password change
  // Returns: true ONLY if session is validated as valid, false for any validation failure
  // This function is designed to fail closed for protected portal access
  async function checkPasswordChangedSession(){
    console.log('[auth] checkPasswordChangedSession start');
    
    // Reuse in-flight check to prevent concurrent checks during startup
    if (sessionCheckInFlight) {
      console.log('[auth] Reusing in-flight session check');
      return sessionCheckInFlight;
    }
    
    // Start new check and track it
    sessionCheckInFlight = (async () => {
      try {
        return await performSessionCheck();
      } finally {
        sessionCheckInFlight = null;
      }
    })();
    
    return sessionCheckInFlight;
  }

  // Internal function that performs the actual session validation
  async function performSessionCheck() {
    // Fail closed: if Supabase client unavailable when validation is needed, deny access
    if (!window.supabaseClient) {
      console.warn('[auth] Session check failed: Supabase client unavailable');
      return false;
    }

    try {
      console.log('[auth] About to call auth.getSession()');
      const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
      console.log('[auth] auth.getSession() resolved', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        userId: session?.user?.id || null,
        sessionError: sessionError?.message || null
      });
      
      // Fail closed: getSession error
      if (sessionError) {
        console.error('[auth] Session check failed: could not get session:', sessionError.message);
        return false;
      }
      
      // Fail closed: if no session when validation is needed, deny access
      // (Portal callers handle their own unauthenticated redirect before calling this)
      if (!session || !session.access_token || !session.user) {
        console.warn('[auth] Session check failed: no active session');
        return false;
      }

      // Fail closed: missing user id
      if (!session.user.id) {
        console.error('[auth] Session check failed: missing user id');
        return false;
      }

      // Decode JWT to get iat (issued at) timestamp
      const token = session.access_token;
      const parts = token.split('.');
      
      // Fail closed: invalid JWT structure
      if (parts.length !== 3) {
        console.error('[auth] Session check failed: Invalid JWT structure');
        return false;
      }

      let payload;
      try {
        payload = JSON.parse(atob(parts[1]));
      } catch (_e) {
        console.error('[auth] Session check failed: JWT decode error');
        return false;
      }

      const tokenIat = payload.iat; // Unix timestamp in seconds

      // Fail closed: missing or invalid iat claim
      if (typeof tokenIat !== 'number') {
        console.error('[auth] Session check failed: missing or invalid iat claim in JWT');
        return false;
      }

      const tokenIssuedAt = new Date(tokenIat * 1000);

      // Fail closed: invalid tokenIssuedAt date
      if (Number.isNaN(tokenIssuedAt.getTime())) {
        console.error('[auth] Session check failed: invalid tokenIssuedAt date');
        return false;
      }

      // Query client table for password_changed_at
      console.log('[auth] About to query client.password_changed_at for user', session.user.id);
      const { data: clientData, error: clientError } = await window.supabaseClient
        .from('client')
        .select('id, password_changed_at')
        .eq('id', session.user.id)
        .maybeSingle();
      console.log('[auth] client query resolved', {
        hasClientData: !!clientData,
        clientError: clientError?.message || null,
        passwordChangedAt: clientData?.password_changed_at || null
      });

      // Fail closed: client lookup failed
      if (clientError) {
        console.error('[auth] Session check failed: client query error:', clientError.message);
        return false;
      }

      if (!clientData) {
        console.warn('[auth] No client record found for user, skipping password_changed_at check');
        return true;
      }

      // If no password_changed_at, session is valid (password never changed)
      if (!clientData.password_changed_at) return true;

      const passwordChangedAt = new Date(clientData.password_changed_at);

      // Fail closed: invalid passwordChangedAt date
      if (Number.isNaN(passwordChangedAt.getTime())) {
        console.error('[auth] Session check failed: invalid password_changed_at date');
        return false;
      }

      // Log for debugging
      console.log('[auth] Session check:', {
        password_changed_at: passwordChangedAt.toISOString(),
        token_iat: tokenIssuedAt.toISOString(),
        should_logout: tokenIssuedAt < passwordChangedAt
      });

      // If session was issued before password change, invalidate it
      if (tokenIssuedAt < passwordChangedAt) {
        console.log('[auth] Session invalidated: password changed after token issuance');
        
        // Prevent duplicate redirects
        if (window.__sessionExpiryRedirectInProgress) {
          return false;
        }
        window.__sessionExpiryRedirectInProgress = true;
        
        await window.supabaseClient.auth.signOut();
        redirectToLoginIfNeeded();
        
        return false; // Session is invalid
      }
      
      return true; // Session is valid
    } catch (err) {
      // Fail closed: unexpected errors deny access
      console.error('[auth] Session check failed: unexpected error:', err);
      return false;
    }
  }

  // Timeout wrapper for checkPasswordChangedSession to prevent infinite hangs
  async function checkPasswordChangedSessionWithTimeout(timeoutMs = 5000) {
    let timeoutId;

    try {
      console.log('[auth] Running session check with timeout', timeoutMs);

      const result = await Promise.race([
        checkPasswordChangedSession(),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            console.error('[auth] Session check timed out');
            resolve(false);
          }, timeoutMs);
        })
      ]);

      console.log('[auth] Session check with timeout completed', { result });
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function refreshHeader(){
    if (!window.supabaseClient) return;

    // Check if session should be invalidated before updating UI
    const isSessionValid = await checkPasswordChangedSessionWithTimeout(5000);
    if (!isSessionValid) return;

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
  function isBlockedSignupDomain(email){
    const normalized = (email || '').trim().toLowerCase();
    const parts = normalized.split('@');
    if (parts.length !== 2) return false;
    const domain = parts[1];
    return domain.includes('automandrivingschool');
  }

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

    if (isBlockedSignupDomain(email)) {
      const msg = 'This email domain cannot be used for public sign-up. Please contact support if you need access.';
      if (window.Modal) window.Modal.error(msg, 'Sign-up Error');
      else alert(msg);
      throw new Error(msg);
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
    const isSessionValid = await checkPasswordChangedSession();
    if (!isSessionValid) {
      // Session invalid after login - should not happen normally, but fail safely
      console.warn('[auth] Login succeeded but session validation failed');
      return data;
    }

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
    checkPasswordChangedSession,  // Expose for manual checks
    checkPasswordChangedSessionWithTimeout  // Expose timeout wrapper
  };

  // Set up auth state change listener for immediate session invalidation
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      // Check session validity on any auth state change
      if (session && session.user) {
        const isSessionValid = await checkPasswordChangedSessionWithTimeout(5000);
        if (!isSessionValid) {
          // Session invalidated - checkPasswordChangedSession already handled signout/redirect
          return;
        }
      }
    });
  }

  // Skip refreshHeader on intake.html to avoid startup race conditions
  const currentPath = window.location.pathname.toLowerCase();
  if (!currentPath.includes('intake.html')) {
    ready(refreshHeader);
  }
})();
