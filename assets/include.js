// Lightweight HTML partial include utility
// Usage: <div data-include="partials/header.html"></div>
(function(){
  const isFileProtocol = location.protocol === 'file:';

  async function includePartials(){
    const nodes = document.querySelectorAll('[data-include]');
    await Promise.all(Array.from(nodes).map(async (el) => {
      const src = el.getAttribute('data-include');
      try {
        if (isFileProtocol) {
          // Most browsers block fetch/XHR for local files for security.
          throw new Error('Cannot load partials over file://. Please use a local web server.');
        }
        const res = await fetch(src, { cache: 'no-cache' });
        if (!res.ok) throw new Error('Failed to load ' + src + ' (' + res.status + ')');
        const html = await res.text();
        el.outerHTML = html; // replace placeholder with loaded HTML
      } catch (e) {
        // Remove the placeholder to avoid leaving stray nodes
        el.outerHTML = '';
        console.error('Include error for', src, e);
      }
    }));

    if (isFileProtocol) {
      console.warn('[Auto-Man] You are opening the site via file:// which blocks loading shared header/footer. Start a local server and open http://localhost instead.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includePartials);
  } else {
    includePartials();
  }
})();
