/**
 * notifications.js
 * Local push notifications for incoming messages.
 *
 * PRIVACY: the notification body NEVER includes the sender's username or
 * the message content — only a generic "New message" line. This matches
 * the app's "stored only on device, nothing leaks" philosophy: even the
 * OS notification tray / lock screen shouldn't reveal who messaged you
 * or what they said.
 *
 * These are LOCAL notifications (scheduled from the device itself when a
 * WebSocket message arrives), not remote push — fitting the "no backend
 * server, relay only routes ciphertext" architecture. This means
 * notifications only fire while the relay connection is alive (foreground
 * or backgrounded-but-not-killed), which is consistent with how the rest
 * of the app already behaves (Phase 5 — relay drops messages if offline).
 */

import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// expo-notifications throws a native-level error (not catchable in JS)
// when loaded inside Expo Go on SDK 53+. Skip the import entirely when
// running in Expo Go so no red error appears in the console.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications = null;
let permissionGranted = false;

/**
 * Lazily loads expo-notifications and requests permission.
 * Call once on app start (after identity is ready).
 * No-ops silently when running inside Expo Go.
 */
export async function setupNotifications() {
  if (isExpoGo) {
    console.log('[Notifications] Skipped — running in Expo Go (no native push support).');
    return;
  }

  try {
    Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 100, 150],
        // Lock screen visibility: PRIVATE hides the notification content
        // on the lock screen entirely (shows only "1 new notification"),
        // which doubles down on the privacy requirement at the OS level.
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    permissionGranted = finalStatus === 'granted';

    if (!permissionGranted) {
      console.log('[Notifications] Permission not granted');
    }
  } catch (err) {
    console.log('[Notifications] Unavailable:', err.message);
    Notifications = null;
  }
}

/**
 * Fires a privacy-preserving local notification for an incoming message.
 * Deliberately omits sender username and message content.
 *
 * @param {object} opts
 * @param {string} opts.contactDeviceId - used as a stable per-contact
 *   identifier so multiple messages from the same person can collapse/replace
 *   instead of stacking (still without revealing who it is).
 */
export async function notifyNewMessage({ contactDeviceId } = {}) {
  if (!Notifications || !permissionGranted) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'D-Chat',
        body: 'New message',
        // No sender name, no preview text, no contact reference in data
        // that could be read from a notification-listener service.
        sound: true,
        priority: Notifications.AndroidNotificationPriority?.HIGH,
      },
      trigger: null, // fire immediately
      identifier: contactDeviceId
        ? `dchat-msg-${contactDeviceId}`
        : undefined, // reusing the identifier collapses repeat notifications from the same contact
    });
  } catch (err) {
    console.log('[Notifications] Failed to schedule:', err.message);
  }
}

/**
 * Clears all delivered notifications — call when the app comes to
 * foreground / when the user opens a chat, since unread state is now
 * visible directly in the app.
 */
export async function clearAllNotifications() {
  if (!Notifications) return;
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // no-op
  }
}

/**
 * Clears the notification(s) tied to one specific contact —
 * call when the user opens that contact's chat.
 */
export async function clearNotificationsForContact(contactDeviceId) {
  if (!Notifications || !contactDeviceId) return;
  try {
    await Notifications.dismissNotificationAsync(`dchat-msg-${contactDeviceId}`);
  } catch {
    // no-op — notification may not exist
  }
}
