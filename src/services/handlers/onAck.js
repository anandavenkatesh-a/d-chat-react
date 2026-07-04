/**
 * onAck.js
 * Handles ACK events from the relay — updates message status in SQLite.
 *
 * Events handled:
 *   ack_sent   → status: 'sent'   (relay received it)              ✓
 *   ack_queued → stays 'sent'     (recipient offline, relay is
 *                                  holding the ciphertext up to 24h
 *                                  and will deliver on reconnect)   ✓
 *   ack_stored → status: 'stored' (recipient saved it)              ✓✓
 *   ack_seen   → status: 'seen'   (recipient opened it)             ✓✓✓
 */

import { updateMessageStatus } from '../../db/messages';
import { MSG_STATUS } from '../../constants/config';

export async function handleAckSent(event, notifyStatusUpdate) {
  const { msg_id } = event;
  if (!msg_id) return;
  await updateMessageStatus(msg_id, MSG_STATUS.SENT);
  notifyStatusUpdate?.({ msg_id, status: MSG_STATUS.SENT });
}

export async function handleAckStored(event, notifyStatusUpdate) {
  const { msg_id } = event;
  if (!msg_id) return;
  await updateMessageStatus(msg_id, MSG_STATUS.STORED);
  notifyStatusUpdate?.({ msg_id, status: MSG_STATUS.STORED });
}

export async function handleAckSeen(event, notifyStatusUpdate) {
  const { msg_id } = event;
  if (!msg_id) return;
  await updateMessageStatus(msg_id, MSG_STATUS.SEEN);
  notifyStatusUpdate?.({ msg_id, status: MSG_STATUS.SEEN });
}

/**
 * Recipient was offline when the message was sent. The relay is now
 * holding the encrypted blob (up to 24h) and will deliver it the moment
 * the recipient reconnects — this is no longer a dead end like the old
 * "dropped" behavior. Status remains 'sent' (single ✓) since 'stored'
 * only becomes true once the recipient's device actually saves it.
 */
export async function handleAckQueued(event) {
  const { msg_id } = event;
  console.log(`[ACK] Message queued on relay, recipient offline: ${msg_id}`);
}

/**
 * handlePendingAcks
 * Called after reconnect when relay flushes queued ACKs.
 * Processes each ACK in order.
 */
export async function handlePendingAcks(event, notifyStatusUpdate) {
  const { acks } = event;
  if (!Array.isArray(acks) || acks.length === 0) return;

  console.log(`[ACK] Processing ${acks.length} queued ACK(s)`);

  for (const ack of acks) {
    const { msgId, status } = ack;
    if (!msgId || !status) continue;

    await updateMessageStatus(msgId, status);
    notifyStatusUpdate?.({ msg_id: msgId, status });
  }
}
