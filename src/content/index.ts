/**
 * Content script — runs at document_start in ALL frames.
 * Wrapped in a try/catch so an orphaned extension context (after reload)
 * fails silently instead of throwing uncaught errors on the casino page.
 */

try {
  // Guard: if runtime is already invalid, bail immediately
  if (!chrome.runtime?.id) throw new Error('extension context invalid');

  const isTopFrame = window === window.top;

  // ── 1. Inject WS interceptor into page world ──────────────────────────────
  const interceptorScript = document.createElement('script');
  interceptorScript.src = chrome.runtime.getURL('content/ws-interceptor.js');
  interceptorScript.onload = () => interceptorScript.remove();
  (document.head || document.documentElement).appendChild(interceptorScript);

  console.log(`[BAC] loaded (${isTopFrame ? 'top' : 'iframe'}) on`, window.location.hostname);

  // ── 2. Relay WS game events → background ─────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== 'bac-wsi') return;
    if (!chrome.runtime?.id) return; // context was invalidated after load
    try {
      chrome.runtime.sendMessage({ type: 'WS_GAME_EVENT', payload: e.data.msg }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_) { /* extension reloaded mid-session, ignore */ }
  });

  // ── 3. Sidebar — top frame only ───────────────────────────────────────────
  if (isTopFrame) {
    function injectSidebar() {
      if (!chrome.runtime?.id) return;
      if (document.getElementById('bac-analyzer-root')) return;
      const iframe = document.createElement('iframe');
      iframe.id = 'bac-analyzer-root';
      iframe.src = chrome.runtime.getURL('src/popup/index.html');
      Object.assign(iframe.style, {
        position: 'fixed', top: '0', right: '0',
        width: '360px', height: '100vh',
        border: 'none', zIndex: '2147483647',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
      });
      document.body.appendChild(iframe);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectSidebar);
    } else {
      injectSidebar();
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'TOGGLE_SIDEBAR') {
        const el = document.getElementById('bac-analyzer-root');
        if (el) el.remove(); else injectSidebar();
      }
    });
  }

} catch (_) {
  // Extension context invalidated or unavailable — fail silently
}
