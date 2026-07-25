/**
 * registration.js
 * Handles the one-time registration flow: opens its own short-lived
 * Tor-routed WebSocket connection (separate from the main persistent
 * one in socket.js), proves identity ownership, solves the puzzle
 * gauntlet, and closes once done.
 *
 * ⚠️ CRITICAL: every event listener registered here MUST be removed
 * the moment this flow finishes (success, failure, or timeout — any
 * path through finish()). TorWebSocketModule is a singleton native
 * connection; if these listeners were left attached, they would keep
 * reacting to every future message on whatever connection comes next
 * — including the completely unrelated main persistent connection in
 * socket.js. Previously this WAS the bug: a stale registration.js
 * listener kept responding to every new `challenge` (sent for the
 * main connection's own handshake) with a duplicate `register_request`,
 * racing socket.js's own `connect` message for the same single-use
 * nonce — whichever reached the relay first won, and the other failed
 * with "invalid_or_expired_nonce", forever, on every single reconnect.
 *
 * Usage from a UI component:
 *
 *   const reg = startRegistration({
 *     onPuzzleRound: (round, total) => { ... show the tap target ... },
 *     onStatusChange: (status) => { ... },
 *   });
 *
 *   reg.submitTap();               // call when the user taps
 *   const outcome = await reg.result;  // { success: boolean, reason?: string }
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { RELAY_WS_URL } from '../constants/config';
import { startTor, getSocksPort } from './tor';
import { signNonce } from '../crypto/signingKeyPair';
import useIdentityStore from '../store/useIdentityStore';

const { TorWebSocketModule } = NativeModules;

const CONNECTION_TIMEOUT_MS = 45_000;

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

function _startRegistrationInternal({ onPuzzleRound, onStatusChange }) {
  let resolveResult;
  let hasResolved = false;
  const result = new Promise((res) => { resolveResult = res; });

  let emitter = null;
  let awaitingTap = false;
  let connectionTimeout = null;

  // Every subscription returned by emitter.addListener() gets stored
  // here so finish() can precisely remove exactly these listeners —
  // and only these, since each `new NativeEventEmitter(...)` call
  // creates its own independent JS-side listener registry, even
  // though multiple instances all wrap the same underlying native
  // module. Removing THIS instance's listeners does not touch
  // socket.js's separately-created emitter or its listeners.
  const subscriptions = [];

  function status(s) {
    console.log(`[Register] ${s}`);
    onStatusChange?.(s);
  }

  /**
   * The ONLY place result ever gets resolved. Guarantees:
   *   1. The connection timeout is always cleared
   *   2. ALL event listeners registered by this attempt are removed —
   *      this is the fix for the stale-listener bug described above
   *   3. The native connection is closed if it's still open
   *   4. The promise is never double-resolved
   * ...no matter which of the many possible paths (success, native
   * error, unexpected close, timeout, etc.) gets there first.
   */
  function finish(outcome) {
    if (hasResolved) return;
    hasResolved = true;

    if (connectionTimeout) clearTimeout(connectionTimeout);

    for (const sub of subscriptions) {
      sub.remove();
    }
    subscriptions.length = 0;

    // Defensive — safe to call even if already closed, or if the
    // connection never fully opened in the first place.
    try {
      TorWebSocketModule?.close();
    } catch {
      // ignore — already closed / never opened
    }

    if (!outcome.success) {
      console.warn('[Register] Failed:', outcome.reason);
    }
    resolveResult(outcome);
  }

  function submitTap() {
    if (!awaitingTap) return;
    awaitingTap = false;
    TorWebSocketModule.send(JSON.stringify({ type: 'puzzle_response' }));
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

          case 'puzzle_reveal': {
            awaitingTap = true;
            onPuzzleRound?.(msg.round, msg.total);
            break;
          }

          case 'register_ack': {
            if (msg.success) {
              status('Registered!');
              finish({ success: true }); // finish() itself now closes the connection
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
      console.warn('[Register] Connection attempt timed out with no response from relay.');
      finish({ success: false, reason: 'connection_timeout' });
    }, CONNECTION_TIMEOUT_MS);

    try {
      await TorWebSocketModule.connect(RELAY_WS_URL, socksPort);
      console.log('[Register] TorWebSocketModule.connect() dispatched — waiting for TorWS_open/error/close…');
    } catch (err) {
      console.warn('[Register] TorWebSocketModule.connect() threw synchronously:', err.message);
      finish({ success: false, reason: 'connect_failed: ' + err.message });
    }
  }

  run();

  return { result, submitTap };
}
