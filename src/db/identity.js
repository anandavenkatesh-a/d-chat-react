/**
 * identity.js
 * CRUD for the identity table — always a single row (id = 1).
 * Stores device_id and public key only — there is no username anywhere
 * in this app's identity model. Private key lives in expo-secure-store,
 * NOT here.
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';

/**
 * Saves the user's identity (called once, automatically, on first launch).
 */
export async function saveIdentity({ deviceId, publicKey }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${TABLES.IDENTITY} (id, device_id, public_key)
     VALUES (1, ?, ?)`,
    [deviceId, publicKey],
  );
}

/**
 * Loads the identity. Returns null if it hasn't been generated yet
 * (should only ever be null very briefly, on the very first app launch
 * before the automatic keypair generation completes).
 */
export async function loadIdentity() {
  const db = getDatabase();
  const row = await db.getFirstAsync(
    `SELECT device_id, public_key FROM ${TABLES.IDENTITY} WHERE id = 1`,
  );
  if (!row) return null;
  return {
    deviceId:  row.device_id,
    publicKey: row.public_key,
  };
}

/**
 * Returns true if identity generation has completed.
 */
export async function hasIdentity() {
  const identity = await loadIdentity();
  return identity !== null;
}
