/**
 * signingKeyPair.js
 * A SEPARATE keypair from the existing Curve25519 encryption keypair
 * (see keyPair.js), used purely to prove ownership of a device_id —
 * never for encrypting messages.
 *
 * Why a second keypair rather than reusing the encryption key: signing
 * and encryption serve fundamentally different security roles, and
 * mixing their use is a well-known cryptographic anti-pattern. Ed25519
 * (via tweetnacl's nacl.sign) is used here rather than reusing the
 * Curve25519 box keypair's algorithm — this is the standard choice for
 * a pure signing key.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

const SECURE_STORE_SIGNING_PRIVATE_KEY = 'dchat_signing_private_key';

/**
 * Generates a new Ed25519 signing keypair.
 * Returns { publicKey: base64, privateKey: base64 }
 */
export function generateSigningKeyPair() {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey:  encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey),
  };
}

export async function saveSigningPrivateKey(privateKeyBase64) {
  await SecureStore.setItemAsync(SECURE_STORE_SIGNING_PRIVATE_KEY, privateKeyBase64);
}

export async function loadSigningPrivateKey() {
  return await SecureStore.getItemAsync(SECURE_STORE_SIGNING_PRIVATE_KEY);
}

/**
 * Signs a base64-encoded nonce with the signing private key.
 * Returns a base64-encoded detached signature.
 */
export function signNonce(nonceBase64, signingPrivateKeyBase64) {
  const nonceBytes = decodeBase64(nonceBase64);
  const privateKeyBytes = decodeBase64(signingPrivateKeyBase64);
  const signature = nacl.sign.detached(new Uint8Array(nonceBytes), new Uint8Array(privateKeyBytes));
  return encodeBase64(signature);
}
