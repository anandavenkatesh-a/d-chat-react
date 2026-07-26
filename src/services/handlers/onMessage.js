/**
 * onMessage.js
 * Handles an incoming { type: "message", from, msg_id, payload,
 * sent_at } event.
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
import { getActiveChatDeviceId } from '../activeChatTracker';
import { playMessageChime } from '../sound';
import { fireMessageNotification } from '../notifications';
// Static import — this used to be a dynamic `await import('../socket')`
// specifically to avoid a circular dependency (socket.js -> messageRouter
// -> onMessage -> socket) that existed in an earlier version of the
// codebase. socket.js no longer imports messageRouter/onMessage at all
// (it receives routeEvent as a runtime callback parameter from
// useSocketSetup.js instead), so that cycle doesn't exist anymore, and
// the dynamic import was both unnecessary and the likely source of a
// "Cannot read property 'reload' of undefined" crash — a known failure
// mode of Metro's dynamic-import HMR interop wrapper.
import { send } from '../socket';

export async function handleMessage(event, notifyNewMessage) {
  const { from: fromDeviceId, msg_id, payload, sent_at } = event;

  if (!fromDeviceId || !msg_id || !payload) {
    console.warn('[MSG] Malformed message event:', event);
    return;
  }

  // The relay stamps every message with ITS OWN receive time and
  // passes it through as sent_at — this is a far better proxy for
  // "when was this actually sent" than Date.now() here, which would
  // just be "whenever THIS device happened to download and process
  // it." For a message that sat in the relay's offline queue for a
  // while before this device reconnected, that gap could be minutes
  // to the full 24h TTL — using sent_at fixes messages appearing with
  // a misleadingly late timestamp. Falls back to Date.now() only if
  // an older relay build didn't send sent_at (defensive, shouldn't
  // normally happen against a relay running this update).
  const timestamp = typeof sent_at === 'number' ? sent_at : Date.now();

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
        timestamp,
      });

      send({ type: 'ack_stored', msg_id, to: fromDeviceId });

      // If the user is already looking at this exact chat, a full
      // system notification would be redundant — they're about to see
      // the message appear on screen regardless. Play a short chime
      // instead, same pattern other chat apps use. Otherwise, fire the
      // normal (content-free, privacy-preserving) notification.
      if (getActiveChatDeviceId() === fromDeviceId) {
        playMessageChime();
      } else {
        fireMessageNotification(fromDeviceId);
      }

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
