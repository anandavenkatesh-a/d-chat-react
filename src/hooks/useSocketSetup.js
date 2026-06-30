/**
 * useSocketSetup.js
 * Initializes the WebSocket connection once identity is ready.
 * Wires messageRouter callbacks to the messages store.
 * Handles app foreground/background lifecycle.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { connect, disconnect }              from '../services/socket';
import { registerCallbacks, routeEvent }   from '../services/messageRouter';
import useIdentityStore                    from '../store/useIdentityStore';
import useMessagesStore                    from '../store/useMessagesStore';

export function useSocketSetup() {
  const deviceId                         = useIdentityStore((s) => s.deviceId);
  const receiveMessage                   = useMessagesStore((s) => s.receiveMessage);
  const updateStatus                     = useMessagesStore((s) => s.updateStatus);
  const appState                         = useRef(AppState.currentState);

  useEffect(() => {
    if (!deviceId) return; // identity not ready yet

    registerCallbacks({
      onNewMessage:   receiveMessage,
      onStatusUpdate: updateStatus,
    });

    connect(deviceId, routeEvent);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        console.log('[App] Returning to foreground — reconnecting if needed');
        connect(deviceId, routeEvent);
      }
      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, [deviceId]);
}
