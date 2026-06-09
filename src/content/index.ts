/**
 * Content script — runs at document_start in ALL frames (all_frames: true).
 * This catches Evolution Gaming's WebSocket connections whether they're
 * established in the top page or inside a nested game iframe.
 *
 * Phase 1: manual hand entry sidebar (top frame only)
 * Phase 2: automatic card detection via WebSocket tap (all frames)
 */

const isTopFrame = window === window.top;

// ── 1. Inject the page-world WebSocket interceptor ─────────────────────────
// Runs in every frame so we catch whichever frame Evolution connects from.
const interceptorScript = document.createElement('script');
interceptorScript.src = chrome.runtime.getURL('content/ws-interceptor.js');
interceptorScript.onload = () => interceptorScript.remove();
(document.head || document.documentElement).appendChild(interceptorScript);

console.log(`[BAC] content script loaded (${isTopFrame ? 'top' : 'iframe'}) on`, window.location.hostname);

// ── 2. Relay intercepted WS game events → background service worker ─────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.source !== 'bac-wsi') return;
  // Use callback form to swallow "receiving end does not exist" when SW is idle
  chrome.runtime.sendMessage({ type: 'WS_GAME_EVENT', payload: e.data.msg }, () => {
    void chrome.runtime.lastError; // suppress unchecked error warning
  });
});

// ── 3. Sidebar only in top frame ────────────────────────────────────────────
if (isTopFrame) {
  function injectSidebar() {
    if (document.getElementById('bac-analyzer-root')) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'bac-analyzer-root';
    iframe.src = chrome.runtime.getURL('src/popup/index.html');
    Object.assign(iframe.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '360px',
      height: '100vh',
      border: 'none',
      zIndex: '2147483647',
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
      if (el) el.remove();
      else injectSidebar();
    }
  });
}
