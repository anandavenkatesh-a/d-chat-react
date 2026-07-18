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
  findContactByNickname,
} from '../db/contacts';
import {
  getPendingMessagesFrom,
  deletePendingMessagesFrom,
} from '../db/pendingMessages';
import { insertMessage } from '../db/messages';
import { decryptMessage } from '../crypto/decrypt';
import { MSG_STATUS } from '../constants/config';
import { send } from '../services/socket';

const useContactsStore = create((set, get) => ({
  contacts: [],

  /** Load all contacts from SQLite into state */
  loadContacts: async () => {
    const contacts = await getAllContacts();
    set({ contacts });
  },

  /**
   * Checks whether adding {deviceId, nickname} would collide with
   * anything already in the contact list, WITHOUT writing anything yet.
   * Called by the UI before showing a confirmation step, so the user
   * can be warned and decide how to proceed.
   *
   * Returns:
   *   { deviceIdCollision: Contact | null, nicknameCollision: Contact | null }
   *
   * deviceIdCollision — this exact device_id is already a contact
   *                     (re-scanning someone you've already added, or
   *                     re-adding after erasing them).
   * nicknameCollision — a DIFFERENT device_id already uses this nickname
   *                     (purely a local naming clash — not a security
   *                     concern, just a "you might confuse them" heads-up).
   */
  checkForCollisions: async (deviceId, nickname) => {
    const [deviceIdCollision, nicknameMatch] = await Promise.all([
      getContact(deviceId),
      findContactByNickname(nickname),
    ]);

    const nicknameCollision =
      nicknameMatch && nicknameMatch.deviceId !== deviceId ? nicknameMatch : null;

    return { deviceIdCollision, nicknameCollision };
  },

  /**
   * Add (or update) a contact from a scanned QR payload, with a
   * user-chosen nickname. Also drains any pending messages from that
   * device. Callers should use checkForCollisions() first and confirm
   * with the user if either collision type is found — this function
   * itself always proceeds (INSERT OR REPLACE), since by the time it's
   * called the user has already been warned and chosen to continue.
   */
  addContact: async ({ deviceId, nickname, publicKey }, myPrivateKey) => {
    await insertContact({ deviceId, nickname, publicKey });

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
   *
   * IMPORTANT: also sends ack_stored back to the relay for each message,
   * mirroring what the live-delivery path in onMessage.js already does.
   * Without this, a message that arrived while the sender wasn't yet a
   * saved contact would sit in pending_messages with NO acknowledgment
   * ever sent — leaving the original sender's copy of that message
   * permanently stuck at "sent" (✓), even after it's fully received,
   * decrypted, and later read by the recipient. This is what actually
   * moves it to "stored" (✓✓); markAsSeen() (called when the chat is
   * opened) is what later moves it to "seen" (✓✓✓).
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

      // Tell the relay (and, via it, the original sender) that this
      // message has now genuinely been stored on the recipient's device.
      // If the sender is currently offline, the relay queues this ACK
      // (existing ackQueue, 24h TTL) and delivers it the next time the
      // sender reconnects — same mechanism as live-delivered messages.
      send({ type: 'ack_stored', msg_id: p.id, to: deviceId });
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
