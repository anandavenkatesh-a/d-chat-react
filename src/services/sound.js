/**
 * sound.js
 * Plays a short "pop" chime for a message that arrives while the user
 * is already looking at that exact chat — no system notification is
 * shown in that case, matching the same pattern other chat apps use.
 *
 * Uses expo-audio's imperative createAudioPlayer() API (for use
 * OUTSIDE a React component, which this module is) — NOT expo-av,
 * which was fully removed in Expo SDK 55 and crashes with a
 * NoClassDefFoundError / LazyKType error on this project's SDK 56.
 *
 * Deliberately does NOT override silent/DND mode — if the user has
 * their phone silenced, the chime should respect that, same as any
 * other in-app sound would.
 */

import { createAudioPlayer } from 'expo-audio';

let player = null;

function ensureLoaded() {
  if (player) return player;
  try {
    player = createAudioPlayer(require('../../assets/sounds/message_pop.wav'));
    player.volume = 0.6;
  } catch (err) {
    console.warn('[Sound] Failed to create audio player:', err.message);
    player = null;
  }
  return player;
}

/**
 * Plays the message-arrival chime. Safe to call rapidly in succession
 * (e.g. several messages arriving close together) — explicitly seeks
 * back to the start before each play, since unlike expo-av, expo-audio
 * does NOT automatically reset playback position after the sound
 * finishes (it just stays paused at the end) — without this, only the
 * very first call would actually produce audible sound.
 */
export function playMessageChime() {
  try {
    const p = ensureLoaded();
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch (err) {
    // Never let a sound-playback failure affect message handling —
    // this is a nice-to-have, not a critical path.
    console.warn('[Sound] Failed to play message chime:', err.message);
  }
}
