/**
 * activeChatTracker.js
 * Tiny module-level tracker for "which chat screen is currently open".
 *
 * Used to suppress push notifications for a contact whose chat the user
 * is already actively viewing — no point buzzing them about a message
 * they can already see on screen.
 *
 * Kept on globalThis (like socket.js's state) so it survives Metro Fast
 * Refresh without losing track of the active screen mid-session.
 */

const _tracker = (globalThis.__dchatActiveChatTracker ??= { deviceId: null });

export function setActiveChatDeviceId(deviceId) {
  _tracker.deviceId = deviceId;
}

export function clearActiveChatDeviceId() {
  _tracker.deviceId = null;
}

export function getActiveChatDeviceId() {
  return _tracker.deviceId;
}
