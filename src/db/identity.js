/**
 * identity.js
 * CRUD for the identity table — always a single row (id = 1).
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';

export async function saveIdentity({ deviceId, publicKey, signingPublicKey }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${TABLES.IDENTITY} (id, device_id, public_key, signing_public_key, is_registered)
     VALUES (1, ?, ?, ?, COALESCE((SELECT is_registered FROM ${TABLES.IDENTITY} WHERE id = 1), 0))`,
    [deviceId, publicKey, signingPublicKey],
  );
}

export async function loadIdentity() {
  const db = getDatabase();
  const row = await db.getFirstAsync(
    `SELECT device_id, public_key, signing_public_key, is_registered FROM ${TABLES.IDENTITY} WHERE id = 1`,
  );
  if (!row) return null;
  return {
    deviceId:         row.device_id,
    publicKey:        row.public_key,
    signingPublicKey: row.signing_public_key,
    isRegistered:     row.is_registered === 1,
  };
}

export async function markAsRegistered() {
  const db = getDatabase();
  await db.runAsync(`UPDATE ${TABLES.IDENTITY} SET is_registered = 1 WHERE id = 1`);
}

export async function hasIdentity() {
  const identity = await loadIdentity();
  return identity !== null;
}
