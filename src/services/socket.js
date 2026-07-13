/**
 * socket.js
 * Singleton WebSocket connection to the relay server — routed through Tor.
 *
 * Uses the native TorWebSocketModule bridge (OkHttp + Proxy.Type.SOCKS)
 * since React Native's built-in WebSocket has no way to route through a
 * local SOCKS5 proxy.
 *
 * Responsibilities:
 *  - Wait for Tor to be bootstrapped (via tor.js) before connecting
 *  - Connect on app start, announce device_id
 *  - Auto-reconnect with exponential backoff on disconnect
 *  - Pull pending ACKs immediately after reconnect
 *  - Route all incoming events to messageRouter
 *  - Expose send() for outgoing events
 *  - Publish live connection status to useConnectionStore for the UI
 *
 * Public API is unchanged from earlier versions (connect/disconnect/
 * send/isConnected) so the rest of the app did not need to change.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { RELAY_WS_URL } from '../constants/config';
import { startTor, getSocksPort } from './tor';
import useConnectionStore from '../store/useConnectionStore';

const { TorWebSocketModule } = NativeModules;

// ── State ─────────────────────────────────────────────────────────────────────
// Stored on globalThis so Fast Refresh (Metro hot reload) doesn't wipe the
// live connection when this module is re-evaluated mid-session.
const _state = (globalThis.__dchatSocketState ??= {
  isOpen: false,
  isConnecting: false,
  deviceId: null,
  reconnectTimer: null,
  retryCount: 0,
  isDestroyed: false,
  onMessageCallback: null,
  emitter: null,
  torReady: false,
});

const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 1_000;

function _setConnectionStatus(status) {
  useConnectionStore.getState().setStatus(status);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Connect to the relay through Tor and begin listening for events.
 * Starts Tor first if it isn't already running — this can take several
 * seconds on a cold start (Tor circuit bootstrap).
 *
 * @param {string} id         - device_id to announce on connect
 * @param {function} onEvent  - called with every parsed incoming event
 */
export async function connect(id, onEvent) {
  // Guard against duplicate calls — e.g. a spurious AppState "foreground"
  // event firing right after initial mount.
  if (_state.isOpen) {
    console.log('[WS] connect() called but already connected — ignoring');
    return;
  }
  if (_state.isConnecting) {
    console.log('[WS] connect() called but a connection attempt is already in progress — ignoring');
    return;
  }

  _state.isConnecting     = true;
  _state.deviceId         = id;
  _state.onMessageCallback = onEvent;
  _state.isDestroyed      = false;
  _setConnectionStatus('connecting');

  if (Platform.OS !== 'android') {
    console.error('[WS] Tor-routed WebSocket is Android-only in this build.');
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    return;
  }

  if (!TorWebSocketModule) {
    console.error('[WS] TorWebSocketModule not found — is this a dev build with native changes, not Expo Go?');
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    return;
  }

  _setupEmitterOnce();

  if (!_state.torReady) {
    console.log('[WS] Waiting for Tor to bootstrap before connecting…');
    try {
      await startTor();
      _state.torReady = true;
    } catch (err) {
      console.error('[WS] Tor failed to start:', err.message);
      _state.isConnecting = false;
      _setConnectionStatus('disconnected');
      _scheduleReconnect();
      return;
    }
  }

  await _connect();
}

/**
 * Gracefully close and stop reconnecting (e.g. app goes to background).
 */
export function disconnect() {
  _state.isDestroyed = true;
  _state.isConnecting = false;
  _clearReconnectTimer();
  if (_state.isOpen && TorWebSocketModule) {
    TorWebSocketModule.close();
  }
  _state.isOpen = false;
  _setConnectionStatus('disconnected');
}

/**
 * Send a structured event to the relay.
 * Returns false if not connected.
 */
export function send(event) {
  if (!_state.isOpen || !TorWebSocketModule) {
    console.warn('[WS] Cannot send — not connected:', event.type);
    return false;
  }
  try {
    TorWebSocketModule.send(JSON.stringify(event));
    return true;
  } catch (err) {
    console.error('[WS] Send error:', err.message);
    return false;
  }
}

export function isConnected() {
  return _state.isOpen;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _setupEmitterOnce() {
  if (_state.emitter) return;

  _state.emitter = new NativeEventEmitter(TorWebSocketModule);

  _state.emitter.addListener('TorWS_open', () => {
    console.log('[WS] Connected (via Tor)');
    _state.isOpen = true;
    _state.isConnecting = false;
    _state.retryCount = 0;
    _setConnectionStatus('connected');

    send({ type: 'connect', device_id: _state.deviceId });
    send({ type: 'pull_acks', device_id: _state.deviceId });
  });

  _state.emitter.addListener('TorWS_message', ({ data }) => {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn('[WS] Non-JSON message received');
      return;
    }
    if (_state.onMessageCallback) _state.onMessageCallback(parsed);
  });

  _state.emitter.addListener('TorWS_close', ({ code, reason }) => {
    console.log(`[WS] Disconnected (code: ${code}, reason: ${reason})`);
    _state.isOpen = false;
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    if (!_state.isDestroyed) _scheduleReconnect();
  });

  _state.emitter.addListener('TorWS_error', ({ message }) => {
    console.warn('[WS] Error:', message);
    _state.isOpen = false;
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    if (!_state.isDestroyed) _scheduleReconnect();
  });
}

async function _connect() {
  if (_state.isDestroyed) return;
  if (_state.isOpen) return;

  const socksPort = getSocksPort();
  if (!socksPort) {
    console.warn('[WS] Tor SOCKS port not available yet — retrying shortly');
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    _scheduleReconnect();
    return;
  }

  console.log(`[WS] Connecting to ${RELAY_WS_URL} via Tor SOCKS5 :${socksPort} (attempt ${_state.retryCount + 1})`);

  try {
    _state.isConnecting = true;
    await TorWebSocketModule.connect(RELAY_WS_URL, socksPort);
  } catch (err) {
    console.error('[WS] Failed to start WebSocket connection:', err.message);
    _state.isConnecting = false;
    _setConnectionStatus('disconnected');
    _scheduleReconnect();
  }
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
