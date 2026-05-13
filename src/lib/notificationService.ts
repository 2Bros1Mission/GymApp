import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage keys ──────────────────────────────────────────────
const STORAGE_KEYS = {
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  REMINDER_HOUR: 'reminder_hour',
  REMINDER_MINUTE: 'reminder_minute',
} as const;

// ── Default reminder time: 09:00 ──────────────────────────────
const DEFAULT_REMINDER_HOUR = 9;
const DEFAULT_REMINDER_MINUTE = 0;

// ── Notification channel (Android) ────────────────────────────
const WORKOUT_CHANNEL_ID = 'workout-reminders';

// ── Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Types ─────────────────────────────────────────────────────
export interface NotificationPreferences {
  enabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

// ── Permission ────────────────────────────────────────────────

/** Request notification permissions. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  // Notifications don't work on simulators/emulators in some cases
  if (!Device.isDevice && Platform.OS !== 'web') {
    console.warn('Push notifications require a physical device');
    return false;
  }

  if (Platform.OS === 'web') {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(WORKOUT_CHANNEL_ID, {
      name: 'Workout Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  }

  return true;
}

// ── Preferences ───────────────────────────────────────────────

/** Load notification preferences from AsyncStorage. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const [enabled, hour, minute] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED),
      AsyncStorage.getItem(STORAGE_KEYS.REMINDER_HOUR),
      AsyncStorage.getItem(STORAGE_KEYS.REMINDER_MINUTE),
    ]);

    return {
      enabled: enabled === 'true',
      reminderHour: hour ? parseInt(hour, 10) : DEFAULT_REMINDER_HOUR,
      reminderMinute: minute ? parseInt(minute, 10) : DEFAULT_REMINDER_MINUTE,
    };
  } catch {
    return {
      enabled: false,
      reminderHour: DEFAULT_REMINDER_HOUR,
      reminderMinute: DEFAULT_REMINDER_MINUTE,
    };
  }
}

/** Save notification preferences to AsyncStorage. */
export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, String(prefs.enabled)),
    AsyncStorage.setItem(STORAGE_KEYS.REMINDER_HOUR, String(prefs.reminderHour)),
    AsyncStorage.setItem(STORAGE_KEYS.REMINDER_MINUTE, String(prefs.reminderMinute)),
  ]);
}

// ── Daily Workout Reminder ────────────────────────────────────

const DAILY_REMINDER_ID = 'daily-workout-reminder';

/**
 * Schedule a daily workout reminder at the given hour:minute.
 * Cancels any existing reminder first.
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  title: string,
  body: string
): Promise<void> {
  // Cancel existing reminder first
  await cancelDailyReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title,
      body,
      sound: 'default',
      data: { type: 'workout-reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/** Cancel the daily workout reminder. */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

/**
 * Toggle notifications on/off.
 * When enabling: requests permission, schedules daily reminder.
 * When disabling: cancels reminder.
 * Returns the new enabled state (may differ if permission denied).
 */
export async function toggleNotifications(
  enable: boolean,
  reminderTitle: string,
  reminderBody: string
): Promise<{ enabled: boolean; permissionDenied?: boolean }> {
  if (enable) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      // Save as disabled since permission was denied
      await saveNotificationPreferences({
        enabled: false,
        reminderHour: DEFAULT_REMINDER_HOUR,
        reminderMinute: DEFAULT_REMINDER_MINUTE,
      });
      return { enabled: false, permissionDenied: true };
    }

    const prefs = await getNotificationPreferences();
    const hour = prefs.reminderHour;
    const minute = prefs.reminderMinute;

    await scheduleDailyReminder(hour, minute, reminderTitle, reminderBody);
    await saveNotificationPreferences({ enabled: true, reminderHour: hour, reminderMinute: minute });

    return { enabled: true };
  } else {
    await cancelDailyReminder();
    const prefs = await getNotificationPreferences();
    await saveNotificationPreferences({ ...prefs, enabled: false });

    return { enabled: false };
  }
}

/**
 * Update the reminder time. If notifications are enabled, reschedule.
 */
export async function updateReminderTime(
  hour: number,
  minute: number,
  reminderTitle: string,
  reminderBody: string
): Promise<void> {
  const prefs = await getNotificationPreferences();
  await saveNotificationPreferences({ ...prefs, reminderHour: hour, reminderMinute: minute });

  if (prefs.enabled) {
    await scheduleDailyReminder(hour, minute, reminderTitle, reminderBody);
  }
}

// ── Notification tap handler ──────────────────────────────────

/**
 * Add a listener for when the user taps a notification.
 * Returns a cleanup function.
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(handler);
  return () => subscription.remove();
}
