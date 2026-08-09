import { getDatabase } from './database';
import { TABLES } from '../constants/db';

export async function getAllMessagesForBackup() {
  const db = getDatabase();
  const rows = await db.getAllAsync(`SELECT * FROM ${TABLES.MESSAGES}`);
  return rows.map((row) => ({
    id:         row.id,
    deviceId:   row.device_id,
    direction:  row.direction,
    plaintext:  row.plaintext,
    ciphertext: row.ciphertext,
    status:     row.status,
    timestamp:  row.timestamp,
  }));
}

export async function insertMessagesBulk(messages) {
  if (!messages || messages.length === 0) return;
  const db = getDatabase();
  for (const m of messages) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ${TABLES.MESSAGES}
       (id, device_id, direction, plaintext, ciphertext, status, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.deviceId, m.direction, m.plaintext, m.ciphertext, m.status, m.timestamp],
    );
  }
}

export async function insertContactsBulk(contacts) {
  if (!contacts || contacts.length === 0) return;
  const db = getDatabase();
  for (const c of contacts) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ${TABLES.CONTACTS} (device_id, nickname, public_key, created_at)
       VALUES (?, ?, ?, ?)`,
      [c.deviceId, c.nickname, c.publicKey, c.createdAt],
    );
  }
}
