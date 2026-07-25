/**
 * useSocketSetup.js
 * Initializes the WebSocket connection once identity is ready AND
 * registration has been confirmed by the relay — connecting before
 * registration would just get rejected with { reason: "not_registered" }.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { connect, disconnect }             from '../services/socket';
import { registerCallbacks, routeEvent }   from '../services/messageRouter';
import useIdentityStore                    from '../store/useIdentityStore';
import useMessagesStore                    from '../store/useMessagesStore';

export function useSocketSetup() {
  const deviceId           = useIdentityStore((s) => s.deviceId);
  const publicKey          = useIdentityStore((s) => s.publicKey);
  const signingPublicKey   = useIdentityStore((s) => s.signingPublicKey);
  const signingPrivateKey  = useIdentityStore((s) => s.signingPrivateKey);
  const isRegistered       = useIdentityStore((s) => s.isRegistered);
  const receiveMessage     = useMessagesStore((s) => s.receiveMessage);
  const updateStatus       = useMessagesStore((s) => s.updateStatus);
  const appState            = useRef(AppState.currentState);

  useEffect(() => {
    // Wait for both identity AND confirmed registration before ever
    // attempting to connect — see file header.
    if (!deviceId || !isRegistered) return;

    const identity = {
      deviceId,
      encryptionPublicKey: publicKey,
      signingPublicKey,
      signingPrivateKey,
    };

    registerCallbacks({
      onNewMessage:   receiveMessage,
      onStatusUpdate: updateStatus,
    });

    connect(identity, routeEvent);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current === 'background';
      appState.current = nextState;

      if (wasBackground && nextState === 'active') {
        console.log('[App] Returning to foreground — forcing a fresh reconnect');
        disconnect();
        connect(identity, routeEvent);
      }
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, [deviceId, isRegistered]);
}
