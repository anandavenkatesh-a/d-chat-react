/**
 * keyPair.js
 * Generates a NaCl keypair on first launch.
 * Private key → expo-secure-store (hardware-backed secure enclave)
 * Public key  → returned for storage in SQLite identity table
 *
 * tweetnacl uses Curve25519 for asymmetric encryption (box).
 * Keys are stored as base64 strings.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_PRIVATE_KEY } from '../constants/config';

/**
 * Generates a new Curve25519 keypair.
 * Returns { publicKey: base64, privateKey: base64 }
 */
export function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey:  encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey),
  };
}

/**
 * Persists the private key to the device secure enclave.
 * This key never leaves the device.
 */
export async function savePrivateKey(privateKeyBase64) {
  await SecureStore.setItemAsync(SECURE_STORE_PRIVATE_KEY, privateKeyBase64);
}

/**
 * Loads the private key from secure store.
 * Returns null if not yet generated (first launch).
 */
export async function loadPrivateKey() {
  return await SecureStore.getItemAsync(SECURE_STORE_PRIVATE_KEY);
}

/**
 * Deletes the private key from secure store.
 * ⚠️ Destructive — all messages become permanently unreadable.
 * Only call on full account reset.
 */
export async function deletePrivateKey() {
  await SecureStore.deleteItemAsync(SECURE_STORE_PRIVATE_KEY);
}

/**
 * Converts a base64 public key string to a Uint8Array for use with nacl.
 *
 * Wrapped in `new Uint8Array(...)` defensively: under React Native's New
 * Architecture (Hermes + JSI), values crossing certain async boundaries
 * (SecureStore, SQLite) can occasionally end up as Uint8Array-like objects
 * that fail tweetnacl's strict `instanceof Uint8Array` check even though
 * they behave identically. Re-wrapping guarantees a true, freshly
 * constructed Uint8Array from the current realm.
 */
export function publicKeyToBytes(publicKeyBase64) {
  return new Uint8Array(decodeBase64(publicKeyBase64));
}

/**
 * Converts a base64 private key string to a Uint8Array for use with nacl.
 * See publicKeyToBytes() comment for why the explicit re-wrap is needed.
 */
export function privateKeyToBytes(privateKeyBase64) {
  return new Uint8Array(decodeBase64(privateKeyBase64));
}
