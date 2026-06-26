/**
 * deviceId.js
 * Computes the device_id used for relay routing.
 *
 * device_id = base64( SHA256( username + ":" + publicKey ) )
 *
 * This is an opaque routing token — the relay only sees it, never the username.
 * It is embedded in the QR code alongside the public key.
 */

import * as Crypto from 'expo-crypto';

/**
 * @param {string} username     - The user's chosen username
 * @param {string} publicKeyB64 - The user's public key (base64)
 * @returns {Promise<string>}   - base64url-safe device_id string
 */
export async function computeDeviceId(username, publicKeyB64) {
  const input  = `${username}:${publicKeyB64}`;
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Strip base64 padding and make URL-safe (for WebSocket routing)
  return digest.replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
