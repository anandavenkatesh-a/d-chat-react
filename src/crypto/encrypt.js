/**
 * encrypt.js
 * Encrypts a plaintext message using the recipient's public key
 * and the sender's private key (NaCl box — authenticated encryption).
 *
 * NaCl box uses Curve25519 + XSalsa20 + Poly1305.
 * Each message gets a unique random nonce.
 *
 * Output format (base64-encoded JSON):
 *   { nonce: base64, ciphertext: base64 }
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { publicKeyToBytes, privateKeyToBytes } from './keyPair';

/**
 * Encrypts a plaintext string.
 *
 * @param {string} plaintext          - The message to encrypt
 * @param {string} recipientPublicKey - Recipient's public key (base64)
 * @param {string} senderPrivateKey   - Sender's private key (base64)
 * @returns {string} base64-encoded encrypted payload (safe to send over network)
 */
export function encryptMessage(plaintext, recipientPublicKey, senderPrivateKey) {
  const nonce       = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = encodeUTF8(plaintext);

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    publicKeyToBytes(recipientPublicKey),
    privateKeyToBytes(senderPrivateKey),
  );

  const payload = {
    nonce:      encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };

  // Encode entire payload as base64 so it's a single opaque string on the wire
  return encodeBase64(encodeUTF8(JSON.stringify(payload)));
}
