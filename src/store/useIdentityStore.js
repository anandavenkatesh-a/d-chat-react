/**
 * useIdentityStore.js
 * Global state for the current user's identity.
 * Loaded from SQLite + SecureStore on app start.
 *
 * Shape:
 *   username   — display name chosen during onboarding
 *   deviceId   — SHA256(username:publicKey), used for relay routing
 *   publicKey  — base64 Curve25519 public key (stored in SQLite)
 *   privateKey — base64 Curve25519 private key (stored in SecureStore)
 *   isReady    — true once identity has been loaded/checked
 */

import { create } from 'zustand';
import { loadIdentity, saveIdentity, hasIdentity } from '../db/identity';
import { generateKeyPair, loadPrivateKey, savePrivateKey } from '../crypto/keyPair';
import { computeDeviceId } from '../crypto/deviceId';

const useIdentityStore = create((set, get) => ({
  username:   null,
  deviceId:   null,
  publicKey:  null,
  privateKey: null,
  isReady:    false,

  /**
   * Called on app start after DB is initialized.
   * Loads identity from SQLite + private key from SecureStore.
   * Sets isReady = true when done (identity may still be null = needs onboarding).
   */
  loadIdentity: async () => {
    try {
      const identity   = await loadIdentity();
      const privateKey = await loadPrivateKey();

      if (identity && privateKey) {
        set({
          username:   identity.username,
          deviceId:   identity.deviceId,
          publicKey:  identity.publicKey,
          privateKey,
          isReady:    true,
        });
      } else {
        // Onboarding not done yet
        set({ isReady: true });
      }
    } catch (err) {
      console.error('[Identity] Failed to load identity:', err);
      set({ isReady: true });
    }
  },

  /**
   * Called at the end of onboarding when user picks a username.
   * Generates keypair, computes device_id, persists everything.
   */
  createIdentity: async (username) => {
    const { publicKey, privateKey } = generateKeyPair();
    const deviceId = await computeDeviceId(username, publicKey);

    // Persist private key to secure enclave
    await savePrivateKey(privateKey);

    // Persist public identity to SQLite
    await saveIdentity({ username, deviceId, publicKey });

    set({ username, deviceId, publicKey, privateKey, isReady: true });

    return { username, deviceId, publicKey };
  },

  /**
   * Returns the QR code payload for sharing identity with contacts.
   */
  getQRPayload: () => {
    const { username, deviceId, publicKey } = get();
    return JSON.stringify({ username, device_id: deviceId, public_key: publicKey });
  },
}));

export default useIdentityStore;
