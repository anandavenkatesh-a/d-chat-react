/**
 * useMessagesStore.js
 * Global state for messages per contact + sending logic.
 *
 * ⚠️ FIX: markAsSeen() previously updated the in-memory badge-relevant
 * state ONLY AFTER a sequential await-loop of individual SQLite
 * writes (one per unseen message) had fully completed. If a user read
 * multiple messages and navigated back to the contact list quickly —
 * a completely normal, fast interaction — there was a real window
 * where the in-memory state hadn't been updated yet, so the unread
 * badge stayed stale until that background work eventually finished
 * (which is why it only seemed to clear "the second time" — really,
 * enough time had just passed by then for the delayed update to
 * land). Fixed by updating the in-memory state FIRST, synchronously,
 * before any awaited I/O — the badge now clears the instant
 * markAsSeen() is called, with the SQLite writes and relay
 * notifications happening in the background afterward, in parallel
 * rather than one at a time.
 */

import { create } from 'zustand';
import * as Crypto from 'expo-crypto';

import { send } from '../services/socket';
import { encryptMessage } from '../crypto/encrypt';
import {
  insertMessage,
  getMessagesForContact,
  updateMessageStatus,
} from '../db/messages';
import { MSG_STATUS } from '../constants/config';

const DUPLICATE_SEND_WINDOW_MS = 2000;
let _lastSendKey = null;
let _lastSendAt = 0;

const useMessagesStore = create((set, get) => ({
  messagesByContact: {},

  loadMessages: async (deviceId) => {
    const messages = await getMessagesForContact(deviceId);
    set((s) => ({
      messagesByContact: { ...s.messagesByContact, [deviceId]: messages },
    }));
  },

  sendMessage: async ({ plaintext, recipientDeviceId, recipientPublicKey, senderPrivateKey }) => {
    const dedupeKey = `${recipientDeviceId}:${plaintext}`;
    const now = Date.now();
    if (_lastSendKey === dedupeKey && (now - _lastSendAt) < DUPLICATE_SEND_WINDOW_MS) {
      console.warn('[Messages] Ignored duplicate sendMessage() call within', DUPLICATE_SEND_WINDOW_MS, 'ms');
      return null;
    }
    _lastSendKey = dedupeKey;
    _lastSendAt = now;

    const msg_id    = Crypto.randomUUID();
    const timestamp = Date.now();

    const ciphertext = encryptMessage(plaintext, recipientPublicKey, senderPrivateKey);

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

    set((s) => {
      const existing = s.messagesByContact[recipientDeviceId] || [];
      return {
        messagesByContact: {
          ...s.messagesByContact,
          [recipientDeviceId]: [...existing, message],
        },
      };
    });

    send({ type: 'send', to: recipientDeviceId, msg_id, payload: ciphertext });

    return msg_id;
  },

  receiveMessage: async ({ fromDeviceId }) => {
    const messages = await getMessagesForContact(fromDeviceId);
    set((s) => ({
      messagesByContact: { ...s.messagesByContact, [fromDeviceId]: messages },
    }));
  },

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

  markAsSeen: async (deviceId) => {
    const messages = get().messagesByContact[deviceId] || [];
    const unseen   = messages.filter(
      (m) => m.direction === 'in' && m.status !== MSG_STATUS.SEEN
    );

    if (unseen.length === 0) return;

    set((s) => ({
      messagesByContact: {
        ...s.messagesByContact,
        [deviceId]: (s.messagesByContact[deviceId] || []).map((m) =>
          m.direction === 'in' ? { ...m, status: MSG_STATUS.SEEN } : m
        ),
      },
    }));

    await Promise.all(
      unseen.map(async (m) => {
        await updateMessageStatus(m.id, MSG_STATUS.SEEN);
        send({ type: 'ack_seen', msg_id: m.id, to: deviceId });
      })
    );
  },

  getMessages: (deviceId) => {
    return get().messagesByContact[deviceId] || [];
  },
}));

export default useMessagesStore;
