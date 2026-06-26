/**
 * database.js
 * Opens the SQLite database and runs all CREATE TABLE migrations.
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

/**
 * Opens the database and creates all tables if they don't exist.
 * Safe to call multiple times — idempotent.
 */
export async function initDatabase() {
  if (db) return db;

  db = await SQLite.openDatabaseAsync(DB_NAME);

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Run all migrations
  await db.execAsync(SQL_CREATE_IDENTITY);
  await db.execAsync(SQL_CREATE_CONTACTS);
  await db.execAsync(SQL_CREATE_MESSAGES);
  await db.execAsync(SQL_CREATE_PENDING);

  console.log('[DB] Database initialized');
  return db;
}

/**
 * Returns the open database instance.
 * Throws if initDatabase() hasn't been called yet.
 */
export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}
