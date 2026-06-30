/**
 * contacts.js
 * CRUD for the contacts table.
 * Each contact = { device_id, username, public_key, created_at }
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';

export async function insertContact({ deviceId, username, publicKey }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${TABLES.CONTACTS} (device_id, username, public_key, created_at)
     VALUES (?, ?, ?, ?)`,
    [deviceId, username, publicKey, Date.now()],
  );
}

export async function getContact(deviceId) {
  const db = getDatabase();
  const row = await db.getFirstAsync(
    `SELECT * FROM ${TABLES.CONTACTS} WHERE device_id = ?`,
    [deviceId],
  );
  return row ? mapContact(row) : null;
}

export async function getAllContacts() {
  const db = getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLES.CONTACTS} ORDER BY created_at DESC`,
  );
  return rows.map(mapContact);
}

/**
 * Erase contact — nulls out the public key so messages become unreadable.
 * The contact ROW stays in the DB so the chat history is still visible
 * (as locked ciphertext) and the user knows to re-scan their QR.
 * Future messages from this device go to pending_messages automatically.
 */
export async function eraseContact(deviceId) {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE ${TABLES.CONTACTS} SET public_key = NULL WHERE device_id = ?`,
    [deviceId],
  );
}

export async function contactExists(deviceId) {
  const contact = await getContact(deviceId);
  return contact !== null;
}

function mapContact(row) {
  return {
    deviceId:  row.device_id,
    username:  row.username,
    publicKey: row.public_key,
    createdAt: row.created_at,
  };
}
