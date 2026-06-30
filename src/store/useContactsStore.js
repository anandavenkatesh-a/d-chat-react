/**
 * useContactsStore.js
 * Global state for the contacts list.
 * Synced with the SQLite contacts table.
 */

import { create } from 'zustand';
import {
  getAllContacts,
  insertContact,
  eraseContact,
  getContact,
  contactExists,
} from '../db/contacts';
import {
  getPendingMessagesFrom,
  deletePendingMessagesFrom,
} from '../db/pendingMessages';
import { insertMessage } from '../db/messages';
import { decryptMessage } from '../crypto/decrypt';
import { MSG_STATUS } from '../constants/config';

const useContactsStore = create((set, get) => ({
  contacts: [],

  /** Load all contacts from SQLite into state */
  loadContacts: async () => {
    const contacts = await getAllContacts();
    set({ contacts });
  },

  /**
   * Add a contact from a scanned QR payload.
   * Also drains any pending messages from that device.
   */
  addContact: async ({ deviceId, username, publicKey }, myPrivateKey) => {
    await insertContact({ deviceId, username, publicKey });

    // Drain pending messages — decrypt and move to messages table
    await get().drainPending(deviceId, publicKey, myPrivateKey);

    // Refresh contacts list
    const contacts = await getAllContacts();
    set({ contacts });
  },

  /**
   * Erase contact — deletes public key.
   * Messages table is untouched (ciphertext stays, becomes unreadable).
   * Future messages from this device go to pending_messages automatically.
   */
  eraseContact: async (deviceId) => {
    await eraseContact(deviceId);
    const contacts = await getAllContacts();
    set({ contacts });
  },

  /**
   * After re-adding a contact, decrypt all their pending messages
   * and move them into the messages table.
   */
  drainPending: async (deviceId, senderPublicKey, myPrivateKey) => {
    const pending = await getPendingMessagesFrom(deviceId);
    if (pending.length === 0) return;

    for (const p of pending) {
      const plaintext = decryptMessage(p.ciphertext, senderPublicKey, myPrivateKey);
      await insertMessage({
        id:         p.id,
        deviceId,
        direction:  'in',
        plaintext,           // may be null if decryption fails
        ciphertext: p.ciphertext,
        status:     MSG_STATUS.STORED,
        timestamp:  p.arrivedAt,
      });
    }

    await deletePendingMessagesFrom(deviceId);
  },

  getContact: (deviceId) => {
    const contact = get().contacts.find((c) => c.deviceId === deviceId);
    // Return null if erased (public key nulled out) — chat treats them as unknown
    if (!contact || !contact.publicKey) return null;
    return contact;
  },
}));

export default useContactsStore;
