/**
 * deviceId.js
 * Computes the device_id used for relay routing AND identity proof.
 *
 * device_id = SHA256(signing_public_key), base64url-encoded
 *
 * Must exactly match how the relay computes it (see
 * d-chat-relay-server/src/identityVerification.js's computeDeviceId)
 * — both sides derive it identically, and the relay independently
 * re-derives it from the presented signing_public_key on every
 * register/connect handshake rather than trusting the claimed value.
 *
 * This deliberately does NOT fold the encryption public key into the
 * derivation. The encryption key's authenticity is established
 * separately, at QR-scan time — the scanning device trusts the
 * (device_id, encryption_public_key) pair together because both were
 * physically present in the same QR code shown in person. Binding it
 * into device_id would add complexity without closing a gap that
 * QR-based trust-on-first-use doesn't already close for that key.
 */

import * as Crypto from 'expo-crypto';

/**
 * @param {string} signingPublicKeyB64 - the signing public key (base64)
 * @returns {Promise<string>} base64url-safe device_id string
 */
export async function computeDeviceId(signingPublicKeyB64) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    signingPublicKeyB64,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return digest.replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
