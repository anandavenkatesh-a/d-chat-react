/**
 * notifications.js
 * Local-only notifications (no FCM, no Google Play Services, no
 * remote push) — consistent with the app's zero-telemetry design.
 *
 * PRIVACY: the notification body NEVER includes the sender's identity
 * or the message content — only a generic "New message" — even though
 * we obviously know which contact it's from internally, that
 * information deliberately never reaches the notification itself
 * (visible on the lock screen, to anyone glancing at the phone, or to
 * any other app with notification-reading permission).
 *
 * If the relevant chat is already the one currently open on-screen, no
 * notification is fired at all — see sound.js / activeChatTracker.js
 * for the "play a short chime instead" behavior in that case, which is
 * decided by the caller (onMessage.js), not here.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let isSetup = false;

export function setupNotifications() {
  if (isSetup) return;
  isSetup = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.DEFAULT,
        // Private on the lock screen — shows only "1 new notification",
        // not even the generic title, consistent with the privacy goal.
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
  } catch (err) {
    console.log('[Notifications] Skipped — running in Expo Go (no native push support).', err.message);
  }
}

/**
 * Fires a generic "new message" notification. Deliberately omits
 * sender identity and message content. Uses contactDeviceId as the
 * notification's own identifier so multiple messages from the same
 * contact collapse into a single notification rather than stacking.
 */
export async function fireMessageNotification(contactDeviceId) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `msg_${contactDeviceId}`,
      content: {
        title: 'D-Chat',
        body: 'New message',
        sound: true,
      },
      trigger: null, // immediate
    });
  } catch (err) {
    console.warn('[Notifications] Failed to fire notification:', err.message);
  }
}

export async function clearAllNotifications() {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // no-op — Expo Go or platform without native notification support
  }
}

export async function clearNotificationsForContact(contactDeviceId) {
  try {
    await Notifications.dismissNotificationAsync(`msg_${contactDeviceId}`);
  } catch {
    // no-op
  }
}
