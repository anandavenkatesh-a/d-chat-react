/**
 * decrypt.js
 * Decrypts an incoming message using the recipient's private key
 * and the sender's public key (NaCl box — authenticated encryption).
 *
 * Returns null if decryption fails (wrong key, tampered message, etc.)
 * — never throws, so the app can silently handle bad/unknown messages.
 */

import nacl from 'tweetnacl';
import { decodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { publicKeyToBytes, privateKeyToBytes } from './keyPair';

/**
 * Decrypts a payload produced by encryptMessage().
 *
 * @param {string} encryptedPayload  - base64-encoded payload from the wire
 * @param {string} senderPublicKey   - Sender's public key (base64)
 * @param {string} recipientPrivateKey - Own private key (base64)
 * @returns {string|null} Decrypted plaintext, or null if decryption failed
 */
export function decryptMessage(encryptedPayload, senderPublicKey, recipientPrivateKey) {
  try {
    // Decode outer base64 → bytes → JSON string → parse
    const payloadJson = encodeUTF8(decodeBase64(encryptedPayload)); // bytes → string
    const { nonce, ciphertext } = JSON.parse(payloadJson);

    const decrypted = nacl.box.open(
      new Uint8Array(decodeBase64(ciphertext)),
      new Uint8Array(decodeBase64(nonce)),
      publicKeyToBytes(senderPublicKey),
      privateKeyToBytes(recipientPrivateKey),
    );

    if (!decrypted) return null; // Authentication failed

    return encodeUTF8(decrypted); // bytes → string
  } catch {
    return null; // Malformed payload
  }
}
