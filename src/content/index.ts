/**
 * Content script — runs at document_start so the WS interceptor is in place
 * before Evolution Gaming's JavaScript establishes its socket connections.
 *
 * Phase 1: manual hand entry sidebar
 * Phase 2: automatic card detection via WebSocket tap
 */

// ── 1. Inject the page-world WebSocket interceptor ─────────────────────────
// Must happen synchronously at document_start, before any page JS runs.
const interceptorScript = document.createElement('script');
interceptorScript.src = chrome.runtime.getURL('content/ws-interceptor.js');
interceptorScript.onload = () => interceptorScript.remove();
(document.head || document.documentElement).appendChild(interceptorScript);

// ── 2. Relay intercepted game events to the background service worker ───────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.source !== 'bac-wsi') return;
  chrome.runtime.sendMessage({ type: 'WS_GAME_EVENT', payload: e.data.msg });
});

// ── 3. Inject the sidebar iframe once the DOM body is available ─────────────
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

// ── 4. Handle toggle from extension popup / context menu ────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_SIDEBAR') {
    const el = document.getElementById('bac-analyzer-root');
    if (el) el.remove();
    else injectSidebar();
  }
});
