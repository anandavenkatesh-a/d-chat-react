/**
 * registration.js
 * Handles the one-time registration flow: opens its own short-lived
 * Tor-routed WebSocket connection, proves identity ownership, then
 * plays a single streamed audio-discrimination puzzle.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { RELAY_WS_URL } from '../constants/config';
import { startTor, getSocksPort } from './tor';
import { signNonce } from '../crypto/signingKeyPair';
import useIdentityStore from '../store/useIdentityStore';

const { TorWebSocketModule } = NativeModules;

const CONNECTION_TIMEOUT_MS = 150_000;
const PING_INTERVAL_SECONDS = 30;

let _activeRegistration = null;

export function startRegistration(callbacks) {
  if (_activeRegistration) {
    console.warn('[Register] startRegistration() called while already in progress — returning the existing attempt.');
    return _activeRegistration;
  }

  const handle = _startRegistrationInternal(callbacks);
  _activeRegistration = handle;

  handle.result.finally(() => {
    if (_activeRegistration === handle) _activeRegistration = null;
  });

  return handle;
}

function _startRegistrationInternal({ onSessionStart, onChunk, onAnswerWindowOpen, onStatusChange }) {
  let resolveResult;
  let hasResolved = false;
  const result = new Promise((res) => { resolveResult = res; });

  let emitter = null;
  let connectionTimeout = null;
  const subscriptions = [];

  function status(s) {
    console.log(`[Register] ${s}`);
    onStatusChange?.(s);
  }

  function finish(outcome) {
    if (hasResolved) return;
    hasResolved = true;

    if (connectionTimeout) clearTimeout(connectionTimeout);
    for (const sub of subscriptions) sub.remove();
    subscriptions.length = 0;

    try {
      TorWebSocketModule?.close();
    } catch {
      // already closed / never opened
    }

    if (!outcome.success) {
      console.warn('[Register] Failed:', outcome.reason);
    }
    resolveResult(outcome);
  }

  function submitAnswer(count) {
    TorWebSocketModule.send(JSON.stringify({ type: 'puzzle_response', count }));
  }

  async function run() {
    if (Platform.OS !== 'android') {
      finish({ success: false, reason: 'android_only' });
      return;
    }
    if (!TorWebSocketModule) {
      finish({ success: false, reason: 'native_module_missing' });
      return;
    }

    status('Waiting for Tor to bootstrap…');
    try {
      await startTor();
    } catch (err) {
      finish({ success: false, reason: 'tor_failed: ' + err.message });
      return;
    }

    const socksPort = getSocksPort();
    if (!socksPort) {
      finish({ success: false, reason: 'no_socks_port' });
      return;
    }

    emitter = new NativeEventEmitter(TorWebSocketModule);

    subscriptions.push(
      emitter.addListener('TorWS_open', () => {
        status('Connected — waiting for challenge…');
      })
    );

    subscriptions.push(
      emitter.addListener('TorWS_error', ({ message }) => {
        console.warn('[Register] TorWS_error:', message);
        finish({ success: false, reason: 'connection_error: ' + message });
      })
    );

    subscriptions.push(
      emitter.addListener('TorWS_close', ({ code, reason }) => {
        console.warn(`[Register] TorWS_close (code: ${code}, reason: ${reason})`);
        finish({ success: false, reason: `connection_closed: ${reason || code}` });
      })
    );

    subscriptions.push(
      emitter.addListener('TorWS_message', async ({ data }) => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          console.warn('[Register] Received non-JSON message, ignoring:', data);
          return;
        }

        const { deviceId, signingPublicKey, signingPrivateKey, publicKey } = useIdentityStore.getState();

        switch (msg.type) {
          case 'challenge': {
            status('Proving identity and requesting registration…');
            const signature = signNonce(msg.nonce, signingPrivateKey);
            TorWebSocketModule.send(JSON.stringify({
              type: 'register_request',
              device_id: deviceId,
              signing_public_key: signingPublicKey,
              encryption_public_key: publicKey,
              nonce: msg.nonce,
              signature,
            }));
            break;
          }

          case 'puzzle_session_start': {
            status(`Listening… (continuous audio over the next minute)`);
            onSessionStart?.(msg.total_chunks, msg.chunk_duration_ms);
            break;
          }

          case 'puzzle_audio_chunk': {
            onChunk?.({
              index: msg.index,
              total: msg.total,
              audioBase64: msg.audio_base64,
              isFinal: msg.is_final,
            });
            break;
          }

          case 'puzzle_answer_window': {
            status('How many were high-pitched?');
            onAnswerWindowOpen?.(msg.deadline_ms);
            break;
          }

          case 'register_ack': {
            if (msg.success) {
              status('Registered!');
              finish({ success: true });
            } else {
              status('Registration failed: ' + msg.reason);
              finish({ success: false, reason: msg.reason });
            }
            break;
          }

          case 'error': {
            finish({ success: false, reason: msg.reason || msg.message });
            break;
          }

          default:
            console.log('[Register] Unhandled message type:', msg.type);
        }
      })
    );

    status(`Connecting to relay via Tor SOCKS5 :${socksPort}…`);

    connectionTimeout = setTimeout(() => {
      console.warn('[Register] Registration timed out with no result.');
      finish({ success: false, reason: 'connection_timeout' });
    }, CONNECTION_TIMEOUT_MS);

    try {
      await TorWebSocketModule.connect(RELAY_WS_URL, socksPort, PING_INTERVAL_SECONDS);
      console.log('[Register] TorWebSocketModule.connect() dispatched — waiting for TorWS_open/error/close…');
    } catch (err) {
      console.warn('[Register] TorWebSocketModule.connect() threw synchronously:', err.message);
      finish({ success: false, reason: 'connect_failed: ' + err.message });
    }
  }

  run();

  return { result, submitAnswer };
}
