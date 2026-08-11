/**
 * useMessagesStore.js
 * Global state for messages per contact + sending logic.
 *
 * ⚠️ FIX (part 1, previous round): markAsSeen() updates in-memory
 * state FIRST, synchronously, before any awaited I/O — see that
 * function's own comment below.
 *
 * ⚠️ FIX (part 2, this round — the actual remaining bug): that first
 * fix created a NEW, subtler race against ContactListScreen's
 * useFocusEffect, which re-fetches messages fresh from SQLite every
 * time the screen regains focus (e.g. navigating back from
 * ChatScreen). If that fresh SQLite read executes BEFORE
 * markAsSeen()'s background persistence has actually landed on disk
 * — a completely real possibility, since navigating back is
 * essentially instant while the SQLite write still takes real time —
 * the fresh read would overwrite the already-correct in-memory
 * "seen" state with stale data still showing the old status. Two
 * individually-correct fixes, colliding at the boundary between them.
 *
 * The fix: loadMessages() now MERGES freshly-loaded data with
 * whatever's already in memory, rather than blindly replacing it.
 * Message status only ever moves forward — sent → stored → seen,
 * never backward — so it's always safe to keep whichever status is
 * further along, regardless of which source (existing in-memory data
 * vs. a fresh-but-possibly-behind SQLite read) happens to be more
 * up to date at any given moment. This closes the race by
 * construction, without needing to block navigation or guess at
 * timing.
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

// Message status only ever advances in this order — never backward.
const STATUS_RANK = { [MSG_STATUS.SENT]: 0, [MSG_STATUS.STORED]: 1, [MSG_STATUS.SEEN]: 2 };

function isMoreAdvanced(statusA, statusB) {
  return (STATUS_RANK[statusA] ?? 0) > (STATUS_RANK[statusB] ?? 0);
}

const useMessagesStore = create((set, get) => ({
  messagesByContact: {},

  /**
   * Loads messages for a contact from SQLite. Merges with whatever's
   * already in memory rather than blindly overwriting it — see file
   * header for why this matters. Safe and correct even when there's
   * nothing in memory yet (a genuinely fresh load just passes
   * straight through, since there's nothing to compare against).
   */
  loadMessages: async (deviceId) => {
    const freshMessages = await getMessagesForContact(deviceId);

    set((s) => {
      const existing = s.messagesByContact[deviceId] || [];
      const existingById = new Map(existing.map((m) => [m.id, m]));

      const merged = freshMessages.map((fresh) => {
        const existingMsg = existingById.get(fresh.id);
        if (existingMsg && isMoreAdvanced(existingMsg.status, fresh.status)) {
          return { ...fresh, status: existingMsg.status };
        }
        return fresh;
      });

      return {
        messagesByContact: { ...s.messagesByContact, [deviceId]: merged },
      };
    });
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
