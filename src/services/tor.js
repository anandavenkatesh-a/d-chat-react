/**
 * tor.js
 * JS-side lifecycle wrapper around the native TorModule bridge
 * (android/app/.../tor/TorModule.java).
 *
 * Responsibilities:
 *  - Start Tor on app launch, before any relay connection is attempted
 *  - Expose current status (OFF / STARTING / ON / STOPPING) to the UI
 *  - Resolve once Tor has bootstrapped and a SOCKS5 port is available
 *
 * This module is Android-only. There is no iOS native module yet — see
 * BUILD.md for the iOS Tor embedding gap.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { TorModule } = NativeModules;

let emitter = null;
let currentStatus = 'OFF';
let currentSocksPort = null;
let statusListeners = [];

/**
 * Starts the embedded Tor daemon and waits for it to fully bootstrap.
 * Resolves with { socksPort, httpTunnelPort } once ready.
 *
 * Typical bootstrap time is 3-15 seconds depending on network conditions.
 * Call this once, early in App.js, before connecting to the relay.
 */
export async function startTor() {
  if (Platform.OS !== 'android') {
    throw new Error(
      'Tor embedding is only implemented for Android in this build. ' +
      'See BUILD.md for the iOS gap.'
    );
  }

  if (!TorModule) {
    throw new Error(
      'TorModule native module not found. This usually means the app ' +
      'was built without the native android/ changes (e.g. still running ' +
      'in Expo Go, which cannot load custom native modules). Run a real ' +
      'development build or release APK.'
    );
  }

  if (!emitter) {
    emitter = new NativeEventEmitter(TorModule);
    emitter.addListener('TorStatusChanged', ({ status }) => {
      currentStatus = status;
      console.log(`[Tor] Status: ${status}`);
      statusListeners.forEach((fn) => fn(status));
    });
  }

  console.log('[Tor] Starting…');
  const { socksPort, httpTunnelPort } = await TorModule.start();
  currentSocksPort = socksPort;
  console.log(`[Tor] Bootstrapped — SOCKS5 on 127.0.0.1:${socksPort}`);
  return { socksPort, httpTunnelPort };
}

export async function stopTor() {
  if (!TorModule) return;
  await TorModule.stop();
  currentStatus = 'OFF';
  currentSocksPort = null;
}

export async function getTorStatus() {
  if (!TorModule) return 'UNAVAILABLE';
  return TorModule.getStatus();
}

export function getSocksPort() {
  return currentSocksPort;
}

export function getCurrentStatus() {
  return currentStatus;
}

/**
 * Subscribe to status changes (STARTING → ON → STOPPING → OFF).
 * Returns an unsubscribe function.
 */
export function onStatusChange(callback) {
  statusListeners.push(callback);
  return () => {
    statusListeners = statusListeners.filter((fn) => fn !== callback);
  };
}
