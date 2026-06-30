/**
 * onMessage.js
 * Handles an incoming { type: "message", from, msg_id, payload } event.
 *
 * Flow:
 *  1. Check if sender is a known contact
 *  2a. Known   → decrypt → insert into messages table → send ack_stored
 *  2b. Unknown → insert raw ciphertext into pending_messages (silent)
 */

import { getContact } from '../../db/contacts';
import { insertMessage } from '../../db/messages';
import { insertPendingMessage } from '../../db/pendingMessages';
import { decryptMessage } from '../../crypto/decrypt';
import { loadPrivateKey } from '../../crypto/keyPair';
import { MSG_STATUS } from '../../constants/config';

export async function handleMessage(event, notifyNewMessage) {
  const { from: fromDeviceId, msg_id, payload } = event;

  if (!fromDeviceId || !msg_id || !payload) {
    console.warn('[MSG] Malformed message event:', event);
    return;
  }

  try {
    const contact    = await getContact(fromDeviceId);
    const privateKey = await loadPrivateKey();

    if (contact && contact.publicKey) {
      // ── Known contact with key: decrypt and store ──────────────────────────
      const plaintext = decryptMessage(payload, contact.publicKey, privateKey);

      await insertMessage({
        id:         msg_id,
        deviceId:   fromDeviceId,
        direction:  'in',
        plaintext,
        ciphertext: payload,
        status:     MSG_STATUS.STORED,
        timestamp:  Date.now(),
      });

      // Lazy import send to avoid circular dependency (onMessage ↔ socket)
      const { send } = await import('../socket');
      send({ type: 'ack_stored', msg_id, to: fromDeviceId });

      notifyNewMessage?.({ fromDeviceId, msg_id, plaintext });

    } else {
      // ── Unknown / erased sender: store raw ciphertext silently ────────────
      await insertPendingMessage({ fromDeviceId, ciphertext: payload });
      console.log(`[MSG] Stored pending message from unknown device: ${fromDeviceId}`);
    }

  } catch (err) {
    console.error('[MSG] Error handling incoming message:', err.message);
  }
}
