/**
 * socket.js
 * Singleton WebSocket connection to the relay server.
 *
 * Responsibilities:
 *  - Connect on app start, announce device_id
 *  - Auto-reconnect with exponential backoff on disconnect
 *  - Pull pending ACKs immediately after reconnect
 *  - Route all incoming events to messageRouter
 *  - Expose send() for outgoing events
 */

import { RELAY_WS_URL } from '../constants/config';

// ── State ─────────────────────────────────────────────────────────────────────
// Stored on globalThis so Fast Refresh (Metro hot reload) doesn't wipe the
// live WebSocket connection when this module is re-evaluated mid-session.
// Without this, editing ANY file while the socket is open causes a stale
// closure / dangling connection that crashes with cryptic React errors.
const _state = (globalThis.__dchatSocketState ??= {
  ws: null,
  deviceId: null,
  reconnectTimer: null,
  retryCount: 0,
  isDestroyed: false,
  onMessageCallback: null,
});

const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 1_000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Connect to the relay and begin listening for events.
 * @param {string} id         - device_id to announce on connect
 * @param {function} onEvent  - called with every parsed incoming event
 */
export function connect(id, onEvent) {
  _state.deviceId          = id;
  _state.onMessageCallback = onEvent;
  _state.isDestroyed       = false;
  _connect();
}

/**
 * Gracefully close and stop reconnecting (e.g. app goes to background).
 */
export function disconnect() {
  _state.isDestroyed = true;
  _clearReconnectTimer();
  if (_state.ws) {
    _state.ws.onclose = null; // prevent reconnect loop
    _state.ws.close();
    _state.ws = null;
  }
}

/**
 * Send a structured event to the relay.
 * Returns false if not connected.
 */
export function send(event) {
  if (!_state.ws || _state.ws.readyState !== WebSocket.OPEN) {
    console.warn('[WS] Cannot send — not connected:', event.type);
    return false;
  }
  try {
    _state.ws.send(JSON.stringify(event));
    return true;
  } catch (err) {
    console.error('[WS] Send error:', err.message);
    return false;
  }
}

export function isConnected() {
  return _state.ws !== null && _state.ws.readyState === WebSocket.OPEN;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _connect() {
  if (_state.isDestroyed) return;
  if (_state.ws && (_state.ws.readyState === WebSocket.CONNECTING || _state.ws.readyState === WebSocket.OPEN)) return;

  console.log(`[WS] Connecting to ${RELAY_WS_URL} (attempt ${_state.retryCount + 1})`);

  let socket;
  try {
    socket = new WebSocket(RELAY_WS_URL);
  } catch (err) {
    console.error('[WS] Failed to create WebSocket:', err.message);
    _scheduleReconnect();
    return;
  }
  _state.ws = socket;

  socket.onopen = () => {
    console.log('[WS] Connected');
    _state.retryCount = 0;

    // Announce device identity
    send({ type: 'connect', device_id: _state.deviceId });

    // Pull any ACKs queued while we were offline
    send({ type: 'pull_acks', device_id: _state.deviceId });
  };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn('[WS] Non-JSON message received');
      return;
    }
    if (_state.onMessageCallback) _state.onMessageCallback(data);
  };

  socket.onclose = (event) => {
    console.log(`[WS] Disconnected (code: ${event.code})`);
    // Only clear if this close event belongs to the CURRENT socket
    // (guards against a stale socket from before a Fast Refresh firing late)
    if (_state.ws === socket) {
      _state.ws = null;
      if (!_state.isDestroyed) _scheduleReconnect();
    }
  };

  socket.onerror = (err) => {
    console.warn('[WS] Error:', err.message);
    // onclose will fire after onerror — reconnect handled there
  };
}

function _scheduleReconnect() {
  _clearReconnectTimer();
  const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** _state.retryCount, MAX_RETRY_DELAY_MS);
  _state.retryCount++;
  console.log(`[WS] Reconnecting in ${delay}ms…`);
  _state.reconnectTimer = setTimeout(_connect, delay);
}

function _clearReconnectTimer() {
  if (_state.reconnectTimer) {
    clearTimeout(_state.reconnectTimer);
    _state.reconnectTimer = null;
  }
}
