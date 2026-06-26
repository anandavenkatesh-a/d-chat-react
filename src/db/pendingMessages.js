/**
 * pendingMessages.js
 * CRUD for pending_messages — encrypted blobs from unknown senders
 * (contacts that have been erased or never added).
 *
 * When a contact is re-added, call drainPendingMessages() to decrypt
 * and move them into the messages table.
 */

import { getDatabase } from './database';
import { TABLES } from '../constants/db';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export async function insertPendingMessage({ fromDeviceId, ciphertext }) {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO ${TABLES.PENDING_MESSAGES} (id, from_device_id, ciphertext, arrived_at)
     VALUES (?, ?, ?, ?)`,
    [uuidv4(), fromDeviceId, ciphertext, Date.now()],
  );
}

export async function getPendingMessagesFrom(fromDeviceId) {
  const db = getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLES.PENDING_MESSAGES}
     WHERE from_device_id = ?
     ORDER BY arrived_at ASC`,
    [fromDeviceId],
  );
  return rows.map(mapPending);
}

export async function deletePendingMessagesFrom(fromDeviceId) {
  const db = getDatabase();
  await db.runAsync(
    `DELETE FROM ${TABLES.PENDING_MESSAGES} WHERE from_device_id = ?`,
    [fromDeviceId],
  );
}

function mapPending(row) {
  return {
    id:           row.id,
    fromDeviceId: row.from_device_id,
    ciphertext:   row.ciphertext,
    arrivedAt:    row.arrived_at,
  };
}
