/**
 * activeChatTracker.js
 * Tracks which contact's chat screen is currently open on-screen.
 * Stored on globalThis so it survives Fast Refresh during development.
 *
 * Used by onMessage.js to decide: if a message arrives from the
 * contact whose chat is currently open, play a short sound instead of
 * firing a system notification (the user already sees it appear).
 */

const _state = (globalThis.__dchatActiveChatState ??= { activeChatDeviceId: null });

export function setActiveChatDeviceId(deviceId) {
  _state.activeChatDeviceId = deviceId;
}

export function clearActiveChatDeviceId() {
  _state.activeChatDeviceId = null;
}

export function getActiveChatDeviceId() {
  return _state.activeChatDeviceId;
}
