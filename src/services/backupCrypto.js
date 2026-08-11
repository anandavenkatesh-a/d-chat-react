/**
 * backupCrypto.js
 * Password-based encryption for backup files.
 *
 * Uses react-native-argon2 (wraps argon2kt on Android, Argon2Swift on
 * iOS) for the KDF — a genuine memory-hard construction, replacing
 * the earlier iterated-SHA512 approach. Memory-hardness is the
 * property that actually matters here: it makes large-scale parallel
 * brute-forcing on GPUs/ASICs far more expensive than a plain
 * iterated hash does, since each guess requires real memory
 * bandwidth, not just compute.
 *
 * ⚠️ Since the actual computation happens in native code (Kotlin/
 * Swift), not on React Native's JS thread, this call does NOT block
 * UI rendering the way a long synchronous JS loop would — the earlier
 * version needed to manually yield every few thousand iterations
 * specifically to avoid freezing the UI; that's no longer necessary
 * here. The trade-off: this library has no progress callback (it's a
 * single opaque native call from JS's perspective), so there's no way
 * to show a live percentage anymore. A spinner during the await is
 * the honest representation of what's actually knowable from JS here
 * — showing a fabricated progress bar would be worse than showing
 * none at all.
 *
 * ⚠️ This specific native-module call could not be executed in the
 * sandbox this was built in (no React Native runtime available there)
 * — unlike the pure-JS tweetnacl code elsewhere in this file, which
 * was tested directly. Please verify real-device timing after
 * building; the parameters below are reasonable starting values but
 * may be worth tuning based on what you actually observe.
 */

import argon2 from 'react-native-argon2';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

const SALT_LENGTH = 16;

const ARGON2_DEFAULTS = {
  iterations: 3,
  memory: 65536,
  parallelism: 1,
  hashLength: 32,
  mode: 'argon2id',
};

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveKey(password, saltBytes, argon2Params) {
  const saltHex = bytesToHex(saltBytes);
  const { rawHash } = await argon2(password, saltHex, {
    ...argon2Params,
    saltEncoding: 'hex',
  });
  return hexToBytes(rawHash);
}

export async function encryptWithPassword(plaintextObj, password) {
  const salt = nacl.randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, ARGON2_DEFAULTS);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const messageBytes = decodeUTF8(JSON.stringify(plaintextObj));
  const box = nacl.secretbox(messageBytes, nonce, key);

  return {
    argon2: ARGON2_DEFAULTS,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(box),
  };
}

export async function decryptWithPassword(envelope, password) {
  const salt = decodeBase64(envelope.salt);
  const nonce = decodeBase64(envelope.nonce);
  const box = decodeBase64(envelope.ciphertext);
  const argon2Params = envelope.argon2 || ARGON2_DEFAULTS;

  const key = await deriveKey(password, salt, argon2Params);
  const opened = nacl.secretbox.open(box, nonce, key);

  if (!opened) {
    const err = new Error('Incorrect password, or this backup file is corrupted.');
    err.code = 'wrong_password';
    throw err;
  }

  return JSON.parse(encodeUTF8(opened));
}
