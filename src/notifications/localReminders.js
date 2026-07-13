import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
const { createReminderCoordinator, lineageIdOf, routeFromNotificationResponse } = require('./localReminderCoordinator.cjs');

const STORAGE_KEY = '@hexis/local-reminders/v1';
const CHANNEL_ID = 'hexis-reminders';
let reminderLock = Promise.resolve();

const store = {
  async load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  save(value) {
    return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
};

const notifications = {
  getPermission: () => Notifications.getPermissionsAsync(),
  requestPermission: () => Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  }),
  async ensureChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recordatorios de HEXIS',
      description: 'Avisos locales configurados por ti para volver a tu protocolo.',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      showBadge: false,
      sound: null,
      vibrationPattern: [0, 250],
    });
  },
  schedule(request) {
    return Notifications.scheduleNotificationAsync({
      ...request,
      trigger: {
        ...request.trigger,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
  },
  cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
};

const coordinator = createReminderCoordinator({ store, notifications });

function serialized(_userId, operation) {
  const current = reminderLock.catch(() => {}).then(operation);
  reminderLock = current.catch(() => {});
  return current;
}

function currentDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function configureLocalNotificationPresentation() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function getHabitReminderStatus({ userId, habit }) {
  return serialized(userId, () => coordinator.getStatus({
    userId,
    habit,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function setHabitReminderEnabled({ userId, habit, enabled }) {
  return serialized(userId, () => coordinator.setEnabled({
    userId,
    habit,
    enabled,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function reconcileHabitReminder({ userId, previousHabit, nextHabit }) {
  return serialized(userId, () => coordinator.reconcileHabit({
    userId,
    previousHabit,
    nextHabit,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function reconcileUserHabitReminders({ userId, habits }) {
  return serialized(userId, () => coordinator.reconcileUser({
    userId,
    habits,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function getUserReminderPreferences(userId) {
  return serialized(userId, () => coordinator.getPreferences({
    userId,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function setUserRemindersGlobalEnabled({ userId, habits, enabled }) {
  return serialized(userId, () => coordinator.setGlobalEnabled({
    userId,
    habits,
    enabled,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function setUserReminderQuietHours({ userId, habits, start, end }) {
  return serialized(userId, () => coordinator.setQuietHours({
    userId,
    habits,
    start,
    end,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function acknowledgeUserReminderTimezone({ userId, habits }) {
  return serialized(userId, () => coordinator.acknowledgeTimezone({
    userId,
    habits,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function suspendUserRemindersForTimezoneChange(userId) {
  return serialized(userId, () => coordinator.suspendForTimezoneChange({
    userId,
    deviceTimezone: currentDeviceTimezone(),
  }));
}

export function disableUserHabitReminders(userId) {
  return serialized(userId, () => coordinator.disableUser({ userId }));
}

export function subscribeToLocalNotificationNavigation(listener) {
  const dispatch = (response) => {
    const route = routeFromNotificationResponse(response);
    if (route) listener(route);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // Some preview runtimes do not expose this native method.
    }
  };

  try {
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) setTimeout(() => dispatch(lastResponse), 0);
  } catch {
    // The live listener still handles responses supported by this runtime.
  }

  const subscription = Notifications.addNotificationResponseReceivedListener(dispatch);
  return () => subscription.remove();
}

export { lineageIdOf };
