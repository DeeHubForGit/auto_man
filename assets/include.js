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

          // Parse the HTML so we can execute any <script> tags reliably
          if (!el.parentNode) continue; // Guard: element may already be detached
          const container = document.createElement('div');
          container.innerHTML = html;

          // Insert non-script nodes in place
          const parent = el.parentNode;
          const marker = document.createComment('include:' + src);
          parent.replaceChild(marker, el);
          const scripts = [];
          Array.from(container.childNodes).forEach(node => {
            if (node.nodeName && node.nodeName.toLowerCase() === 'script') {
              scripts.push(node);
            } else {
              parent.insertBefore(node, marker);
            }
          });
          // Remove marker after DOM insertion of non-scripts
          parent.removeChild(marker);

          // Recreate and append scripts to ensure they execute, preserving order
          for (const oldScript of scripts) {
            const newScript = document.createElement('script');
            // Copy attributes (type, src, async, defer, etc.)
            for (const { name, value } of Array.from(oldScript.attributes || [])) {
              newScript.setAttribute(name, value);
            }
            if (oldScript.src) {
              // External script
              newScript.src = oldScript.src;
              // Append to head for predictable execution
              document.head.appendChild(newScript);
              // Wait for load to preserve execution order between sequential scripts
              await new Promise((resolve, reject) => {
                newScript.onload = resolve;
                newScript.onerror = resolve; // don't block on error
              });
            } else {
              // Inline script
              newScript.textContent = oldScript.textContent || '';
              document.head.appendChild(newScript);
            }
          }
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
