/**
 * useSocketSetup.js
 * Initializes the WebSocket connection once identity is ready.
 * Wires messageRouter callbacks to the messages store.
 * Handles app foreground/background lifecycle.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { connect, disconnect }             from '../services/socket';
import { registerCallbacks, routeEvent }   from '../services/messageRouter';
import useIdentityStore                    from '../store/useIdentityStore';
import useMessagesStore                    from '../store/useMessagesStore';

export function useSocketSetup() {
  const deviceId        = useIdentityStore((s) => s.deviceId);
  const receiveMessage  = useMessagesStore((s) => s.receiveMessage);
  const updateStatus    = useMessagesStore((s) => s.updateStatus);
  const appState        = useRef(AppState.currentState);

  useEffect(() => {
    if (!deviceId) return; // identity not ready yet

    registerCallbacks({
      onNewMessage:   receiveMessage,
      onStatusUpdate: updateStatus,
    });

    connect(deviceId, routeEvent);

    const subscription = AppState.addEventListener('change', (nextState) => {
      // Only treat this as "returning to foreground" if we were
      // PREVIOUSLY confirmed to be in the background — not on any
      // transition away from a non-'active' value. AppState.currentState
      // can briefly read as null/undefined during early app startup,
      // which previously caused a false "background → active" reconnect
      // trigger immediately after the very first connect().
      const wasBackground = appState.current === 'background';
      appState.current = nextState;

      if (wasBackground && nextState === 'active') {
        console.log('[App] Returning to foreground — forcing a fresh reconnect');

        // IMPORTANT: force a real disconnect + reconnect here, rather
        // than just calling connect() again. connect() intentionally
        // no-ops if it thinks a connection is already open (to avoid
        // tearing down a genuinely healthy one) — but after the phone
        // has been off/backgrounded for a while, the OS can silently
        // drop the underlying socket without ever firing our onClose/
        // onFailure callbacks promptly. That leaves the app's isOpen
        // flag stale-true, so a plain connect() call would do nothing,
        // and the app would just sit there appearing "connected" with
        // no new messages arriving until OkHttp's next ping happens to
        // fail on its own. Forcing disconnect() first guarantees a
        // fresh, verified connection every time the app becomes active
        // again after being backgrounded.
        disconnect();
        connect(deviceId, routeEvent);
      }
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, [deviceId]);
}
