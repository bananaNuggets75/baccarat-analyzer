/**
 * Injected into the page's JS world (not the extension sandbox).
 * Patches window.WebSocket before Evolution's code runs so we can
 * read every game message off the wire.
 * Communicates back to the content script via window.postMessage.
 */
(function () {
  const _WS = window.WebSocket;

  function BacWS(url, protocols) {
    const ws = protocols !== undefined ? new _WS(url, protocols) : new _WS(url);
    const urlStr = typeof url === 'string' ? url : (url && url.url) || '';

    // Tap only the game-data sockets, skip video/audio streams
    if (urlStr.includes('socket?')) {
      ws.addEventListener('message', function (e) {
        try {
          const data = JSON.parse(e.data);
          if (!data || !data.type) return;
          // Drop chat noise, logging, keepalives
          if (
            data.type.startsWith('chat.') ||
            data.type === 'connection.kickout' ||
            data.type === 'connection.keepalive' ||
            data.log
          ) return;

          window.postMessage({ source: 'bac-wsi', wsUrl: urlStr.substring(0, 60), msg: data }, '*');
        } catch (_) { /* non-JSON frame, ignore */ }
      });
    }

    return ws;
  }

  // Preserve static constants and prototype so instanceof checks still work
  BacWS.prototype = _WS.prototype;
  BacWS.CONNECTING = _WS.CONNECTING;
  BacWS.OPEN       = _WS.OPEN;
  BacWS.CLOSING    = _WS.CLOSING;
  BacWS.CLOSED     = _WS.CLOSED;

  window.WebSocket = BacWS;
})();
