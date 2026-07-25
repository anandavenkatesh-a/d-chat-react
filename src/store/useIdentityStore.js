/**
 * useIdentityStore.js
 * Global state for the current user's identity.
 *
 * Identity now consists of TWO keypairs, generated together on first
 * launch, with zero user input required for either:
 *   - encryption keypair (Curve25519, via keyPair.js) — for E2EE
 *   - signing keypair (Ed25519, via signingKeyPair.js) — for proving
 *     device_id ownership to the relay (registration + connect)
 *
 * device_id = SHA256(signing_public_key)
 *
 * isRegistered tracks whether the relay has confirmed registration
 * (passed the puzzle gauntlet) — this is separate from whether local
 * keys exist, since key generation is instant and local, but
 * registration requires a live round trip with the relay and solving
 * the puzzle challenge.
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
   * SQLite + private keys from SecureStore. Generates a fresh identity
   * automatically if none exists yet (first launch) — no user input.
   * Also handles the upgrade path for an install that has an
   * encryption keypair but no signing keypair yet (pre-registration
   * schema), generating just the missing signing keypair rather than
   * a whole fresh identity (preserves existing device_id... actually
   * NOTE: device_id changes once a signing key is introduced, since
   * it's now derived from the signing key rather than being absent —
   * pre-registration installs never had a stable device_id derivation
   * tied to a signing key at all, so this is a one-time, unavoidable
   * device_id change for anyone upgrading from a pre-registration
   * build. Their existing contacts will need to re-exchange QR codes.
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
        // First launch ever, OR an upgrade from a pre-signing-key
        // install — either way, generate whatever's missing.
        await get().createIdentity();
      }
    } catch (err) {
      console.error('[Identity] Failed to load identity:', err);
      set({ isReady: true });
    }
  },

  /**
   * Generates a fresh identity (both keypairs) and persists everything.
   * Called automatically — never requires user input.
   */
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

  /**
   * Called once the relay confirms registration succeeded (register_ack
   * with success:true). Persists locally so the app never has to
   * repeat the puzzle gauntlet on future launches.
   */
  confirmRegistered: async () => {
    await markAsRegistered();
    set({ isRegistered: true });
  },

  /**
   * QR payload for sharing identity with contacts. Contains only the
   * device_id and ENCRYPTION public key — the signing public key is
   * never shared this way, since it's only ever needed by the relay
   * for identity proof, not by other users for messaging.
   */
  getQRPayload: () => {
    const { deviceId, publicKey } = get();
    return JSON.stringify({ device_id: deviceId, public_key: publicKey });
  },
}));

export default useIdentityStore;
