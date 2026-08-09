/**
 * backupCrypto.js
 * Password-based encryption for backup files.
 *
 * ⚠️ FIX: deriveKey() is now async and yields control back to the JS
 * event loop periodically DURING the 200,000-iteration loop, instead
 * of running as one long, uninterrupted synchronous block. React
 * Native's JS thread is single-threaded — a long synchronous
 * computation genuinely freezes everything, including any loading
 * spinner already on screen, since RN often doesn't get a chance to
 * paint a state update if a blocking call starts immediately
 * afterward in the same execution flow. Yielding every few thousand
 * iterations (via a zero-delay setTimeout, which hands control back
 * to the event loop) breaks the work into small bursts, letting the
 * UI actually render and stay responsive throughout — and gives a
 * natural point to report real progress via onProgress, rather than
 * just showing a spinner that can't reflect how far along it is.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

const KDF_ITERATIONS = 200_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const YIELD_EVERY = 2_000;

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function deriveKey(password, saltBytes, iterations, onProgress) {
  const passwordBytes = decodeUTF8(password);
  const material = new Uint8Array(passwordBytes.length + saltBytes.length);
  material.set(passwordBytes, 0);
  material.set(saltBytes, passwordBytes.length);

  let digest = nacl.hash(material);

  for (let i = 1; i < iterations; i++) {
    digest = nacl.hash(digest);

    if (i % YIELD_EVERY === 0) {
      onProgress?.(i / iterations);
      await yieldToEventLoop();
    }
  }

  onProgress?.(1);
  return digest.slice(0, KEY_LENGTH);
}

export async function encryptWithPassword(plaintextObj, password, onProgress) {
  const salt = nacl.randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, KDF_ITERATIONS, onProgress);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const messageBytes = decodeUTF8(JSON.stringify(plaintextObj));
  const box = nacl.secretbox(messageBytes, nonce, key);

  return {
    kdfIterations: KDF_ITERATIONS,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(box),
  };
}

export async function decryptWithPassword(envelope, password, onProgress) {
  const salt = decodeBase64(envelope.salt);
  const nonce = decodeBase64(envelope.nonce);
  const box = decodeBase64(envelope.ciphertext);
  const iterations = envelope.kdfIterations || KDF_ITERATIONS;

  const key = await deriveKey(password, salt, iterations, onProgress);
  const opened = nacl.secretbox.open(box, nonce, key);

  if (!opened) {
    const err = new Error('Incorrect password, or this backup file is corrupted.');
    err.code = 'wrong_password';
    throw err;
  }

  return JSON.parse(encodeUTF8(opened));
}
