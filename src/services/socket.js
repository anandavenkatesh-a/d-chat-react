/**
 * socket.js
 * Singleton WebSocket connection to the relay server — routed through
 * Tor, now with cryptographic identity proof on every connect.
 *
 * Handshake, per connection:
 *   1. Relay sends { type: "challenge", nonce } immediately on open
 *   2. This module signs that nonce with the signing private key and
 *      replies with { type: "connect", device_id, signing_public_key,
 *      encryption_public_key, nonce, signature }
 *   3. Relay verifies the signature, confirms the device is
 *      registered, checks the rate limit, and only then responds
 *      { type: "connected" }
 *
 * This connection assumes registration has ALREADY completed — see
 * registration.js for the one-time register + puzzle flow that must
 * happen first. If the relay responds with
 * { type: "error", reason: "not_registered" }, something is wrong
 * with the app's own state (this shouldn't be reachable through
 * normal UI flow, since App.js gates the main app behind
 * isRegistered).
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { RELAY_WS_URL } from '../constants/config';
import { startTor, getSocksPort } from './tor';
import { signNonce } from '../crypto/signingKeyPair';
import useConnectionStore from '../store/useConnectionStore';

const { TorWebSocketModule } = NativeModules;

const _state = (globalThis.__dchatSocketState ??= {
  isOpen: false,
  isConnecting: false,
  deviceId: null,
  signingPublicKey: null,
  signingPrivateKey: null,
  encryptionPublicKey: null,
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

/**
 * @param {object} identity - { deviceId, signingPublicKey, signingPrivateKey, encryptionPublicKey }
 * @param {function} onEvent - called with every parsed incoming event
 *   (challenge/connected/error are handled internally and NOT passed
 *   through to onEvent — only actual chat protocol events are)
 */
export async function connect(identity, onEvent) {
  if (_state.isOpen) {
    console.log('[WS] connect() called but already connected — ignoring');
    return;
  }
  if (_state.isConnecting) {
    console.log('[WS] connect() called but a connection attempt is already in progress — ignoring');
    return;
  }

  _state.isConnecting        = true;
  _state.deviceId             = identity.deviceId;
  _state.signingPublicKey     = identity.signingPublicKey;
  _state.signingPrivateKey    = identity.signingPrivateKey;
  _state.encryptionPublicKey  = identity.encryptionPublicKey;
  _state.onMessageCallback    = onEvent;
  _state.isDestroyed          = false;
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

export function disconnect() {
  _state.isDestroyed = true;
  _state.isConnecting = false;
  _clearReconnectTimer();
  if (_state.isOpen && TorWebSocketModule) {
    TorWebSocketModule.close();
  }
  _state.isOpen = false;
  // A deliberate disconnect means "start over" — the exponential
  // backoff counter belongs to a chain of failed *retry* attempts,
  // not to a fresh, intentional reconnect (e.g. returning to the
  // foreground). Without this reset, a foreground-triggered reconnect
  // could inherit a multi-second backoff delay left over from before
  // the app was backgrounded, even though logically it's attempt #1
  // of a brand new sequence.
  _state.retryCount = 0;
  _setConnectionStatus('disconnected');
}

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
    console.log('[WS] Transport open — waiting for challenge…');
    // NOT marking isOpen/connected yet — that only happens once the
    // relay confirms { type: "connected" } after the full identity
    // proof handshake succeeds. Until then we're transport-connected
    // but not authenticated.
  });

  _state.emitter.addListener('TorWS_message', ({ data }) => {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn('[WS] Non-JSON message received');
      return;
    }

    switch (parsed.type) {
      case 'challenge': {
        const signature = signNonce(parsed.nonce, _state.signingPrivateKey);
        TorWebSocketModule.send(JSON.stringify({
          type: 'connect',
          device_id: _state.deviceId,
          signing_public_key: _state.signingPublicKey,
          encryption_public_key: _state.encryptionPublicKey,
          nonce: parsed.nonce,
          signature,
        }));
        break;
      }

      case 'connected': {
        console.log('[WS] Connected (authenticated via signature)');
        _state.isOpen = true;
        _state.isConnecting = false;
        _state.retryCount = 0;
        _setConnectionStatus('connected');

        // pull_acks is a normal chat-protocol message, not part of the
        // identity handshake — send it through the usual send() path.
        send({ type: 'pull_acks', device_id: _state.deviceId });
        break;
      }

      case 'error': {
        console.warn('[WS] Relay rejected connection:', parsed.reason);
        _state.isOpen = false;
        _state.isConnecting = false;
        _setConnectionStatus('disconnected');
        // 'not_registered' specifically should not normally be
        // reachable — App.js gates the main app behind isRegistered.
        // If seen, it likely means local state got out of sync with
        // the relay (e.g. relay registry was reset) — don't just spin
        // reconnecting forever in that specific case.
        if (parsed.reason !== 'not_registered') {
          _scheduleReconnect();
        }
        break;
      }

      case 'rate_limited': {
        console.warn('[WS] Rate limited by relay, retry_after:', parsed.retry_after);
        _state.isOpen = false;
        _state.isConnecting = false;
        _setConnectionStatus('disconnected');
        _scheduleReconnect();
        break;
      }

      default:
        // Everything else (message/ack_sent/ack_stored/ack_seen/
        // ack_queued/pending_acks) is normal chat protocol — hand off
        // to the app's own message router.
        if (_state.onMessageCallback) _state.onMessageCallback(parsed);
    }
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