/**
 * backup.js
 * Export/import of identity + optional contacts + optional chat
 * history to a single local, password-encrypted file.
 *
 * ⚠️ FIX: decryptAndImportBackup() now explicitly refreshes
 * useContactsStore after inserting contacts. Previously, contacts
 * were correctly written to SQLite via insertContactsBulk(), but the
 * in-memory contacts array in useContactsStore was never told to
 * reload — App.js only calls loadContacts() once, at startup, before
 * any restore has happened. Without this fix, a freshly restored
 * backup's contacts wouldn't appear until the app was fully closed
 * and reopened (which triggers a fresh loadContacts() call that,
 * only at that point, sees the already-imported data).
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';

import useIdentityStore from '../store/useIdentityStore';
import useContactsStore from '../store/useContactsStore';
import { getAllContacts } from '../db/contacts';
import { getAllMessagesForBackup, insertContactsBulk, insertMessagesBulk } from '../db/backupHelpers';
import { CURRENT_BACKUP_VERSION, migrateBackup } from './backupMigrations';
import { encryptWithPassword, decryptWithPassword } from './backupCrypto';

export async function exportBackup({ includeContacts, includeMessages, password }) {
  if (!password || password.length === 0) {
    throw new Error('A password is required to export a backup.');
  }

  const identity = useIdentityStore.getState();
  if (!identity.deviceId || !identity.privateKey || !identity.signingPrivateKey) {
    throw new Error('No identity available to export yet.');
  }

  const sensitivePayload = {
    identity: {
      deviceId:          identity.deviceId,
      publicKey:         identity.publicKey,
      privateKey:        identity.privateKey,
      signingPublicKey:  identity.signingPublicKey,
      signingPrivateKey: identity.signingPrivateKey,
    },
    contacts: includeContacts ? await getAllContacts() : null,
    messages: includeMessages ? await getAllMessagesForBackup() : null,
  };

  const encrypted = await encryptWithPassword(sensitivePayload, password);

  const fileContents = {
    dchatBackup: true,
    backupVersion: CURRENT_BACKUP_VERSION,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    exportedAt: Date.now(),
    ...encrypted,
  };

  const fileName = `dchat-backup-${Date.now()}.json`;
  const file = new File(Paths.document, fileName);
  file.create({ overwrite: true });
  file.write(JSON.stringify(fileContents, null, 2));

  return file.uri;
}

export async function shareBackup(uri) {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save your D-Chat backup',
  });
}

export function deleteBackupFile(uri) {
  try {
    new File(uri).delete();
  } catch {
    // already gone, or never existed — fine
  }
}

export async function pickBackupFile() {
  const result = await File.pickFileAsync({ mimeTypes: ['application/json'] });
  if (result.canceled) return null;

  const raw = result.result.textSync();

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON — not a D-Chat backup.');
  }

  if (!envelope.dchatBackup || !envelope.ciphertext || !envelope.salt || !envelope.nonce) {
    throw new Error('This does not look like a D-Chat backup file.');
  }

  return envelope;
}

export async function decryptAndImportBackup(envelope, password) {
  const sensitivePayload = await decryptWithPassword(envelope, password);

  let backup = {
    backupVersion: envelope.backupVersion,
    appVersion: envelope.appVersion,
    exportedAt: envelope.exportedAt,
    identity: sensitivePayload.identity,
    contacts: sensitivePayload.contacts,
    messages: sensitivePayload.messages,
  };

  backup = migrateBackup(backup);

  await useIdentityStore.getState().importIdentity(backup.identity);

  if (backup.contacts) {
    await insertContactsBulk(backup.contacts);
  }
  if (backup.messages) {
    await insertMessagesBulk(backup.messages);
  }

  // THE FIX: refresh the in-memory contacts store immediately, rather
  // than leaving it stale until the next full app restart. Safe to
  // call even if backup.contacts was null/empty — it'll just reload
  // whatever's actually in SQLite (possibly nothing, which is correct).
  await useContactsStore.getState().loadContacts();

  return {
    deviceId: backup.identity.deviceId,
    restoredContacts: Array.isArray(backup.contacts) ? backup.contacts.length : 0,
    restoredMessages: Array.isArray(backup.messages) ? backup.messages.length : 0,
  };
}
