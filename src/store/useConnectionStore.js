/**
 * useConnectionStore.js
 * Tiny reactive store for the relay connection status, so screens can
 * subscribe and re-render live.
 */

import { create } from 'zustand';

const useConnectionStore = create((set) => ({
  status: 'connecting', // 'connecting' | 'connected' | 'disconnected'
  hasConnectedOnce: false,

  setStatus: (status) =>
    set((state) => ({
      status,
      hasConnectedOnce: state.hasConnectedOnce || status === 'connected',
    })),
}));

export default useConnectionStore;
