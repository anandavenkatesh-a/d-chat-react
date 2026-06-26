/**
 * identity.js
 * CRUD for the identity table — always a single row (id = 1).
 * Stores username, device_id, and public key.
 * Private key lives in expo-secure-store, NOT here.
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';

/**
 * Saves the user's identity (called once during onboarding).
 */
export async function saveIdentity({ username, deviceId, publicKey }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${TABLES.IDENTITY} (id, username, device_id, public_key)
     VALUES (1, ?, ?, ?)`,
    [username, deviceId, publicKey],
  );
}

/**
 * Loads the identity. Returns null if onboarding hasn't been completed.
 */
export async function loadIdentity() {
  const db = getDatabase();
  const row = await db.getFirstAsync(
    `SELECT username, device_id, public_key FROM ${TABLES.IDENTITY} WHERE id = 1`,
  );
  if (!row) return null;
  return {
    username:  row.username,
    deviceId:  row.device_id,
    publicKey: row.public_key,
  };
}

/**
 * Returns true if onboarding is complete (identity row exists).
 */
export async function hasIdentity() {
  const identity = await loadIdentity();
  return identity !== null;
}
