/**
 * Content script — injected into casino pages.
 * Phase 1: manual hand entry via sidebar overlay.
 * Phase 2: DOM scraping / screenshot capture for auto-detection.
 */

function injectSidebar() {
  if (document.getElementById("bac-analyzer-root")) return;

  const iframe = document.createElement("iframe");
  iframe.id = "bac-analyzer-root";
  iframe.src = chrome.runtime.getURL("src/popup/index.html");
  Object.assign(iframe.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "360px",
    height: "100vh",
    border: "none",
    zIndex: "2147483647",
    boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
  });

  document.body.appendChild(iframe);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_SIDEBAR") {
    const el = document.getElementById("bac-analyzer-root");
    if (el) el.remove();
    else injectSidebar();
  }
});

// Auto-inject on load (can be toggled via extension icon)
injectSidebar();
