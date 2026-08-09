/**
 * useIdentityStore.js
 * Global state for the current user's identity.
 *
 * ⚠️ Behavior change: loadIdentity() no longer auto-generates a fresh
 * identity when none exists. On a genuinely first-ever launch, it now
 * just sets isReady: true with everything else null — App.js detects
 * this (!deviceId) and shows WelcomeChoiceScreen, letting the user
 * explicitly choose "Create new account" (which calls createIdentity()
 * directly) or "Restore from backup" (which calls importIdentity()
 * via the backup flow). Both of those already existed as store
 * actions; only the automatic fallback call was removed.
 */

import { create } from 'zustand';
import { loadIdentity, saveIdentity, markAsRegistered } from '../db/identity';
import { generateKeyPair, loadPrivateKey, savePrivateKey } from '../crypto/keyPair';
import {
  generateSigningKeyPair,
  loadSigningPrivateKey,
  saveSigningPrivateKey,
} from '../crypto/signingKeyPair';
import { computeDeviceId } from '../crypto/deviceId';

const useIdentityStore = create((set, get) => ({
  deviceId:            null,
  publicKey:           null,
  privateKey:          null,
  signingPublicKey:    null,
  signingPrivateKey:   null,
  isRegistered:        false,
  isReady:             false,

  /**
   * Called on app start after DB is initialized. Loads identity from
   * SQLite + private keys from SecureStore if they exist. If none
   * exist yet, no longer auto-generates anything — just marks isReady
   * so App.js can route to WelcomeChoiceScreen and let the user pick.
   */
  loadIdentity: async () => {
    try {
      const identity          = await loadIdentity();
      const privateKey        = await loadPrivateKey();
      const signingPrivateKey = await loadSigningPrivateKey();

      if (identity && privateKey && signingPrivateKey && identity.signingPublicKey) {
        set({
          deviceId:          identity.deviceId,
          publicKey:         identity.publicKey,
          privateKey,
          signingPublicKey:  identity.signingPublicKey,
          signingPrivateKey,
          isRegistered:      identity.isRegistered,
          isReady:           true,
        });
      } else {
        set({ isReady: true });
      }
    } catch (err) {
      console.error('[Identity] Failed to load identity:', err);
      set({ isReady: true });
    }
  },

  createIdentity: async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const { publicKey: signingPublicKey, privateKey: signingPrivateKey } = generateSigningKeyPair();
    const deviceId = await computeDeviceId(signingPublicKey);

    await savePrivateKey(privateKey);
    await saveSigningPrivateKey(signingPrivateKey);
    await saveIdentity({ deviceId, publicKey, signingPublicKey });

    set({
      deviceId, publicKey, privateKey,
      signingPublicKey, signingPrivateKey,
      isRegistered: false,
      isReady: true,
    });

    return { deviceId, publicKey, signingPublicKey };
  },

  importIdentity: async (identity) => {
    await savePrivateKey(identity.privateKey);
    await saveSigningPrivateKey(identity.signingPrivateKey);
    await saveIdentity({
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      signingPublicKey: identity.signingPublicKey,
    });
    await markAsRegistered();

    set({
      deviceId:          identity.deviceId,
      publicKey:         identity.publicKey,
      privateKey:        identity.privateKey,
      signingPublicKey:  identity.signingPublicKey,
      signingPrivateKey: identity.signingPrivateKey,
      isRegistered:      true,
      isReady:           true,
    });
  },

  confirmRegistered: async () => {
    await markAsRegistered();
    set({ isRegistered: true });
  },

  resetRegistration: () => {
    set({ isRegistered: false });
  },

  getQRPayload: () => {
    const { deviceId, publicKey } = get();
    return JSON.stringify({ device_id: deviceId, public_key: publicKey });
  },
}));

export default useIdentityStore;
