// Lightweight HTML partial include utility
// Usage: <div data-include="partials/header.html"></div>
(function(){
  const isFileProtocol = location.protocol === 'file:';

  // Fetch with timeout for robustness
  async function fetchWithTimeout(url, { timeout = 10000, ...opts } = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  async function includePartials(){
    // Support nested includes by making a few passes until no placeholders remain
    const MAX_PASSES = 3;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const nodes = Array.from(document.querySelectorAll('[data-include]'));
      if (nodes.length === 0) break;

      for (const el of nodes) {
        const src = el.getAttribute('data-include');
        try {
          if (isFileProtocol) {
            // Most browsers block fetch/XHR for local files for security.
            throw new Error('Cannot load partials over file://. Please use a local web server.');
          }
          const res = await fetchWithTimeout(src, { cache: 'no-cache', timeout: 10000 });
          if (!res.ok) throw new Error('Failed to load ' + src + ' (' + res.status + ')');
          const html = await res.text();

          // Safely replace element with parsed nodes. Avoid outerHTML to prevent NoModificationAllowedError.
          if (!el.parentNode) continue; // Guard: element may already be detached
          const frag = document.createRange().createContextualFragment(html);
          el.replaceWith(frag);
        } catch (e) {
          // Remove the placeholder to avoid leaving stray nodes, only if still attached
          if (el && el.parentNode) el.parentNode.removeChild(el);
          console.error('Include error for', src, e);
        }
      }
    }

    if (isFileProtocol) {
      console.warn('[Auto-Man] You are opening the site via file:// which blocks loading shared header/footer. Start a local server and open http://localhost instead.');
    }

    // Trigger an event after partials are loaded so config placeholders can be replaced
    window.dispatchEvent(new CustomEvent('partialsLoaded'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includePartials);
  } else {
    includePartials();
  }
})();
