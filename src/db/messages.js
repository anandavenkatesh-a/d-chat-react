/**
 * messages.js
 * CRUD for the messages table.
 * All messages are stored encrypted. Plaintext is also stored after decryption
 * so we don't re-decrypt on every render.
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';
import { MSG_STATUS } from '../constants/config';

export async function insertMessage({ id, deviceId, direction, plaintext, ciphertext, status, timestamp }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO ${TABLES.MESSAGES}
     (id, device_id, direction, plaintext, ciphertext, status, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, deviceId, direction, plaintext ?? null, ciphertext, status, timestamp ?? Date.now()],
  );
}

export async function getMessagesForContact(deviceId) {
  const db = getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLES.MESSAGES}
     WHERE device_id = ?
     ORDER BY timestamp ASC`,
    [deviceId],
  );
  return rows.map(mapMessage);
}

export async function updateMessageStatus(msgId, status) {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE ${TABLES.MESSAGES} SET status = ? WHERE id = ?`,
    [status, msgId],
  );
}

/**
 * Updates plaintext for messages that were stored while contact was erased
 * and have now been re-added (decrypted retroactively).
 */
export async function updateMessagePlaintext(msgId, plaintext) {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE ${TABLES.MESSAGES} SET plaintext = ? WHERE id = ?`,
    [plaintext, msgId],
  );
}

/**
 * Returns all outgoing messages with status 'sent' (not yet ACK'd as stored).
 * Used to re-check status after reconnect if needed.
 */
export async function getUnacknowledgedMessages() {
  const db = getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLES.MESSAGES}
     WHERE direction = 'out' AND status = ?`,
    [MSG_STATUS.SENT],
  );
  return rows.map(mapMessage);
}

function mapMessage(row) {
  return {
    id:         row.id,
    deviceId:   row.device_id,
    direction:  row.direction,
    plaintext:  row.plaintext,
    ciphertext: row.ciphertext,
    status:     row.status,
    timestamp:  row.timestamp,
  };
}
