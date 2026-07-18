/**
 * contacts.js
 * CRUD for the contacts table.
 * Each contact = { device_id, nickname, public_key, created_at }
 *
 * `nickname` is a purely local label — chosen by the person adding the
 * contact, for their own convenience. It has no relationship to anything
 * the contact themselves calls their own device, and is not enforced
 * unique in any way (two contacts could end up with the same nickname).
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';

export async function insertContact({ deviceId, nickname, publicKey }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${TABLES.CONTACTS} (device_id, nickname, public_key, created_at)
     VALUES (?, ?, ?, ?)`,
    [deviceId, nickname, publicKey, Date.now()],
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
 * Case-insensitive lookup for an existing contact with the given nickname.
 * Used to warn (not block) when adding a contact whose chosen nickname
 * collides with one already in use — nicknames are local-only and not
 * enforced unique, so this is purely a heads-up for the user.
 */
export async function findContactByNickname(nickname) {
  const db = getDatabase();
  const row = await db.getFirstAsync(
    `SELECT * FROM ${TABLES.CONTACTS} WHERE LOWER(nickname) = LOWER(?)`,
    [nickname],
  );
  return row ? mapContact(row) : null;
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
    nickname:  row.nickname,
    publicKey: row.public_key,
    createdAt: row.created_at,
  };
}
