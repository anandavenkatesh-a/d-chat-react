/**
 * deviceId.js
 * Computes the device_id used for relay routing.
 *
 * device_id = base64url( SHA256( publicKey ) )
 *
 * There is no username anywhere in the app's identity model, so this
 * hash has zero relationship to any human-chosen name at any point —
 * it is derived purely from the Curve25519 public key generated on
 * this device. This is an opaque routing token; the relay only ever
 * sees this value, never the public key itself.
 */

import * as Crypto from 'expo-crypto';

/**
 * @param {string} publicKeyB64 - The user's public key (base64)
 * @returns {Promise<string>}   - base64url-safe device_id string
 */
export async function computeDeviceId(publicKeyB64) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    publicKeyB64,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Strip base64 padding and make URL-safe (for WebSocket routing)
  return digest.replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
