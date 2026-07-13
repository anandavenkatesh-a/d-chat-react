/**
 * useConnectionStore.js
 * Tiny reactive store for the relay connection status, so screens can
 * subscribe and re-render live (socket.js's isConnected() alone is a
 * plain synchronous function — it doesn't trigger React re-renders when
 * the underlying state changes).
 *
 * Statuses:
 *   'connecting'    — Tor bootstrapping and/or WebSocket handshake in progress
 *   'connected'     — live connection to relay established
 *   'disconnected'  — not connected (initial state, or lost connection)
 */

import { create } from 'zustand';

const useConnectionStore = create((set) => ({
  status: 'connecting',
  // Tracks whether we've EVER successfully connected once this app
  // session — used by ContactListScreen to decide whether to show the
  // full first-launch "connecting" gate vs. a small non-blocking banner
  // for a later, transient disconnect.
  hasConnectedOnce: false,

  setStatus: (status) =>
    set((state) => ({
      status,
      hasConnectedOnce: state.hasConnectedOnce || status === 'connected',
    })),
}));

export default useConnectionStore;
