/**
 * messageRouter.js
 * Routes incoming WebSocket events from the relay to the correct handler.
 *
 * All handlers are async — errors are caught individually so one bad
 * event doesn't break the whole message loop.
 *
 * Callbacks:
 *   onNewMessage({ fromDeviceId, msg_id, plaintext })  — new inbound message
 *   onStatusUpdate({ msg_id, status })                 — outbound message status changed
 */

import { handleMessage }                                         from './handlers/onMessage';
import { handleAckSent, handleAckStored, handleAckSeen,
         handleAckQueued, handlePendingAcks }                     from './handlers/onAck';

let _onNewMessage    = null;
let _onStatusUpdate  = null;

/**
 * Register UI callbacks before connecting.
 */
export function registerCallbacks({ onNewMessage, onStatusUpdate }) {
  _onNewMessage   = onNewMessage;
  _onStatusUpdate = onStatusUpdate;
}

/**
 * Main entry point — called by socket.js for every incoming event.
 */
export async function routeEvent(event) {
  if (!event?.type) return;

  try {
    switch (event.type) {
      case 'message':
        await handleMessage(event, _onNewMessage);
        break;

      case 'ack_sent':
        await handleAckSent(event, _onStatusUpdate);
        break;

      case 'ack_stored':
        await handleAckStored(event, _onStatusUpdate);
        break;

      case 'ack_seen':
        await handleAckSeen(event, _onStatusUpdate);
        break;

      case 'ack_queued':
        await handleAckQueued(event);
        break;

      case 'pending_acks':
        await handlePendingAcks(event, _onStatusUpdate);
        break;

      case 'connected':
        console.log('[WS] Relay confirmed connection');
        break;

      case 'error':
        console.warn('[WS] Relay error:', event.message);
        break;

      default:
        console.warn('[WS] Unknown event type:', event.type);
    }
  } catch (err) {
    console.error(`[Router] Error handling event "${event.type}":`, err.message);
  }
}
