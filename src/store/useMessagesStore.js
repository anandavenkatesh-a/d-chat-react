/**
 * useMessagesStore.js
 * Global state for messages per contact + sending logic.
 *
 * Handles:
 *   - Loading messages for a chat from SQLite
 *   - Sending a message (encrypt → insert locally → emit via WebSocket)
 *   - Receiving new messages (triggered by messageRouter callback)
 *   - Status updates (sent / stored / seen)
 *   - Sending ack_seen when a chat is opened
 */

import { create } from 'zustand';
import { generateUUID } from '../utils/uuid';

import { send } from '../services/socket';
import { encryptMessage } from '../crypto/encrypt';
import {
  insertMessage,
  getMessagesForContact,
  updateMessageStatus,
} from '../db/messages';
import { MSG_STATUS } from '../constants/config';

const useMessagesStore = create((set, get) => ({
  // messages per deviceId: { [deviceId]: Message[] }
  messagesByContact: {},

  /**
   * Load all messages for a contact from SQLite into state.
   * Called when opening a chat screen.
   */
  loadMessages: async (deviceId) => {
    const messages = await getMessagesForContact(deviceId);
    set((s) => ({
      messagesByContact: { ...s.messagesByContact, [deviceId]: messages },
    }));
  },

  /**
   * Send a message to a contact.
   *  1. Encrypt with recipient's public key
   *  2. Insert into local SQLite immediately (optimistic)
   *  3. Emit 'send' event to relay
   */
  sendMessage: async ({ plaintext, recipientDeviceId, recipientPublicKey, senderPrivateKey }) => {
    const msg_id    = generateUUID();
    const timestamp = Date.now();

    // Encrypt
    const ciphertext = encryptMessage(plaintext, recipientPublicKey, senderPrivateKey);

    // Optimistic local insert — status starts as 'sent' (waiting for relay ACK)
    const message = {
      id:         msg_id,
      deviceId:   recipientDeviceId,
      direction:  'out',
      plaintext,
      ciphertext,
      status:     MSG_STATUS.SENT,
      timestamp,
    };

    await insertMessage(message);

    // Add to state immediately so UI updates without DB round-trip
    set((s) => {
      const existing = s.messagesByContact[recipientDeviceId] || [];
      return {
        messagesByContact: {
          ...s.messagesByContact,
          [recipientDeviceId]: [...existing, message],
        },
      };
    });

    // Emit to relay
    send({ type: 'send', to: recipientDeviceId, msg_id, payload: ciphertext });

    return msg_id;
  },

  /**
   * Called by messageRouter when a new inbound message arrives.
   * Appends to the relevant contact's message list in state.
   */
  receiveMessage: async ({ fromDeviceId, msg_id, plaintext }) => {
    const messages = await getMessagesForContact(fromDeviceId);
    set((s) => ({
      messagesByContact: { ...s.messagesByContact, [fromDeviceId]: messages },
    }));
  },

  /**
   * Called by messageRouter when an ACK event updates a message's status.
   * Updates the message in state without reloading from DB.
   */
  updateStatus: ({ msg_id, status }) => {
    set((s) => {
      const updated = {};
      for (const [deviceId, messages] of Object.entries(s.messagesByContact)) {
        updated[deviceId] = messages.map((m) =>
          m.id === msg_id ? { ...m, status } : m
        );
      }
      return { messagesByContact: updated };
    });
  },

  /**
   * Mark all inbound messages in a chat as seen.
   * Called when the user opens a chat screen.
   * Sends ack_seen for each unseen message so the sender gets ✓✓✓.
   */
  markAsSeen: async (deviceId) => {
    const messages = get().messagesByContact[deviceId] || [];
    const unseen   = messages.filter(
      (m) => m.direction === 'in' && m.status !== MSG_STATUS.SEEN
    );

    for (const m of unseen) {
      await updateMessageStatus(m.id, MSG_STATUS.SEEN);
      // Notify sender via relay
      send({ type: 'ack_seen', msg_id: m.id, to: deviceId });
    }

    // Update state
    if (unseen.length > 0) {
      set((s) => ({
        messagesByContact: {
          ...s.messagesByContact,
          [deviceId]: (s.messagesByContact[deviceId] || []).map((m) =>
            m.direction === 'in' ? { ...m, status: MSG_STATUS.SEEN } : m
          ),
        },
      }));
    }
  },

  getMessages: (deviceId) => {
    return get().messagesByContact[deviceId] || [];
  },
}));

export default useMessagesStore;
