/**
 * database.js
 * Opens the SQLite database and runs all CREATE TABLE migrations, plus
 * column-level migrations for schema changes on devices that already
 * had the app installed before those changes shipped.
 *
 * Call initDatabase() once on app start before any DB operations.
 */

import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '../constants/config';
import {
  SQL_CREATE_IDENTITY,
  SQL_CREATE_CONTACTS,
  SQL_CREATE_MESSAGES,
  SQL_CREATE_PENDING,
} from '../constants/db';

let db = null;

export async function initDatabase() {
  if (db) return db;

  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // "CREATE TABLE IF NOT EXISTS" only applies to devices that have
  // NEVER had this table before — on a device with an earlier version
  // already installed, these are silently skipped, and any schema
  // changes since need an explicit column migration below.
  await db.execAsync(SQL_CREATE_IDENTITY);
  await db.execAsync(SQL_CREATE_CONTACTS);
  await db.execAsync(SQL_CREATE_MESSAGES);
  await db.execAsync(SQL_CREATE_PENDING);

  await runColumnMigrations();

  console.log('[DB] Database initialized');
  return db;
}

async function runColumnMigrations() {
  await migrateContactsUsernameToNickname();
  await migrateIdentityDropUsername();
  await migrateIdentityAddSigningColumns();
}

async function migrateContactsUsernameToNickname() {
  const columns = await db.getAllAsync(`PRAGMA table_info(contacts);`);
  const hasUsername = columns.some((c) => c.name === 'username');
  const hasNickname  = columns.some((c) => c.name === 'nickname');
  if (hasUsername && !hasNickname) {
    console.log('[DB] Migrating contacts.username -> contacts.nickname');
    await db.execAsync(`ALTER TABLE contacts RENAME COLUMN username TO nickname;`);
  }
}

async function migrateIdentityDropUsername() {
  const columns = await db.getAllAsync(`PRAGMA table_info(identity);`);
  const hasUsername = columns.some((c) => c.name === 'username');
  if (!hasUsername) return;

  console.log('[DB] Migrating identity table — removing legacy username column');
  try {
    await db.execAsync(`ALTER TABLE identity DROP COLUMN username;`);
  } catch (err) {
    console.log('[DB] DROP COLUMN unsupported, falling back to table rebuild:', err.message);
    await db.execAsync(`
      CREATE TABLE identity_new (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        device_id   TEXT    NOT NULL,
        public_key  TEXT    NOT NULL
      );
    `);
    await db.execAsync(`
      INSERT INTO identity_new (id, device_id, public_key)
      SELECT id, device_id, public_key FROM identity;
    `);
    await db.execAsync(`DROP TABLE identity;`);
    await db.execAsync(`ALTER TABLE identity_new RENAME TO identity;`);
  }
}

/**
 * Adds signing_public_key and is_registered to any identity table that
 * predates the registration feature. Existing installs that already
 * have an identity (encryption keypair only, no signing keypair) will
 * need to generate a signing keypair and go through registration once
 * this migration runs — useIdentityStore.loadIdentity() handles that
 * by checking for a null signing_public_key.
 */
async function migrateIdentityAddSigningColumns() {
  const columns = await db.getAllAsync(`PRAGMA table_info(identity);`);
  const hasSigningKey    = columns.some((c) => c.name === 'signing_public_key');
  const hasIsRegistered  = columns.some((c) => c.name === 'is_registered');

  if (!hasSigningKey) {
    console.log('[DB] Migrating identity table — adding signing_public_key column');
    await db.execAsync(`ALTER TABLE identity ADD COLUMN signing_public_key TEXT;`);
  }
  if (!hasIsRegistered) {
    console.log('[DB] Migrating identity table — adding is_registered column');
    await db.execAsync(`ALTER TABLE identity ADD COLUMN is_registered INTEGER NOT NULL DEFAULT 0;`);
  }
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}
