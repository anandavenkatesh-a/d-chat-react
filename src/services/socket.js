/**
 * socket.js
 * Singleton WebSocket connection to the relay server — routed through
 * Tor, with cryptographic identity proof on every connect.
 *
 * ⚠️ Uses TorWebSocketModule.connect(url, socksPort, pingIntervalSeconds).
 * The native module's signature now requires this third argument (see
 * TorWebSocketModule.java) — 45s is appropriate here since this is
 * the persistent, mostly-idle chat connection, which benefits from
 * relatively fast dead-connection detection. The registration
 * connection (registration.js) uses 0 (disabled) instead, for
 * different reasons specific to that connection's sustained data load.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { RELAY_WS_URL } from '../constants/config';
import { startTor, getSocksPort } from './tor';
import { signNonce } from '../crypto/signingKeyPair';
import useConnectionStore from '../store/useConnectionStore';
import useIdentityStore from '../store/useIdentityStore';

const { TorWebSocketModule } = NativeModules;

const PING_INTERVAL_SECONDS = 30;

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

function _setupEmitterOnce() {
  if (_state.emitter) return;

  _state.emitter = new NativeEventEmitter(TorWebSocketModule);

  _state.emitter.addListener('TorWS_open', () => {
    console.log('[WS] Transport open — waiting for challenge…');
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
        send({ type: 'pull_acks', device_id: _state.deviceId });
        break;
      }

      case 'error': {
        console.warn('[WS] Relay rejected connection:', parsed.reason);
        _state.isOpen = false;
        _state.isConnecting = false;
        _setConnectionStatus('disconnected');

        if (parsed.reason === 'not_registered') {
          console.warn('[WS] Identity not recognized by relay — routing back through registration.');
          useIdentityStore.getState().resetRegistration();
        } else {
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
    await TorWebSocketModule.connect(RELAY_WS_URL, socksPort, PING_INTERVAL_SECONDS);
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
