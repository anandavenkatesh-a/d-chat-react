/**
 * useIdentityStore.js
 * Global state for the current user's identity.
 * Loaded from SQLite + SecureStore on app start.
 *
 * There is NO username anywhere in this app's identity model. Identity
 * is purely: a Curve25519 keypair, generated automatically the first
 * time the app runs, plus a device_id derived from the public key alone.
 *
 * Shape:
 *   deviceId   — SHA256(publicKey), used for relay routing
 *   publicKey  — base64 Curve25519 public key (stored in SQLite)
 *   privateKey — base64 Curve25519 private key (stored in SecureStore)
 *   isReady    — true once identity has been loaded/generated
 */

import { create } from 'zustand';
import { loadIdentity, saveIdentity } from '../db/identity';
import { generateKeyPair, loadPrivateKey, savePrivateKey } from '../crypto/keyPair';
import { computeDeviceId } from '../crypto/deviceId';

const useIdentityStore = create((set, get) => ({
  deviceId:   null,
  publicKey:  null,
  privateKey: null,
  isReady:    false,

  /**
   * Called on app start after DB is initialized.
   * Loads identity from SQLite + private key from SecureStore. If none
   * exists yet (very first launch ever), automatically generates one —
   * there is no onboarding step that requires user input to reach this.
   */
  loadIdentity: async () => {
    try {
      const identity   = await loadIdentity();
      const privateKey = await loadPrivateKey();

      if (identity && privateKey) {
        set({
          deviceId:   identity.deviceId,
          publicKey:  identity.publicKey,
          privateKey,
          isReady:    true,
        });
      } else {
        // First launch ever — generate identity automatically, no
        // username or any other user input required.
        await get().createIdentity();
      }
    } catch (err) {
      console.error('[Identity] Failed to load identity:', err);
      set({ isReady: true });
    }
  },

  /**
   * Generates a fresh keypair and device_id, persists everything.
   * Called automatically on first launch — never requires any input
   * from the user.
   */
  createIdentity: async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const deviceId = await computeDeviceId(publicKey);

    // Persist private key to secure enclave
    await savePrivateKey(privateKey);

    // Persist public identity to SQLite
    await saveIdentity({ deviceId, publicKey });

    set({ deviceId, publicKey, privateKey, isReady: true });

    return { deviceId, publicKey };
  },

  /**
   * Returns the QR code payload for sharing identity with contacts.
   * Contains ONLY the device_id and public key — no username, since
   * none exists. Whoever scans this chooses their own local nickname
   * for you.
   */
  getQRPayload: () => {
    const { deviceId, publicKey } = get();
    return JSON.stringify({ device_id: deviceId, public_key: publicKey });
  },
}));

export default useIdentityStore;
