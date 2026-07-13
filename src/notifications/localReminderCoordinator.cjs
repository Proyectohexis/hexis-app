'use strict';

const STATE_VERSION = 2;
const LEGACY_STATE_VERSION = 1;
const PERMISSION_GRANTED = 'granted';
const MAX_REMINDERS_PER_WEEKDAY = 2;
const REMINDER_HORIZON_DAYS = 21;
const DEFAULT_QUIET_HOURS = Object.freeze({ start: '22:00', end: '07:00' });
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function lineageIdOf(habit) {
  return habit?.lineage_id || habit?.id || null;
}

function parseReminderTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function normalizedWeekdays(values) {
  return [...new Set((values || []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
    .sort((left, right) => left - right);
}

function validDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateAt(date, hour = 0, minute = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

function normalizeNow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('El reloj debe devolver una fecha valida.');
  return date;
}

function hasValidDateBounds(habit) {
  if (habit?.starts_on != null && !validDateKey(habit.starts_on)) return false;
  if (habit?.ends_on != null && !validDateKey(habit.ends_on)) return false;
  return !(habit?.starts_on && habit?.ends_on && habit.starts_on > habit.ends_on);
}

function normalizedExcludedDates(values) {
  return [...new Set((values || []).filter(validDateKey))].sort();
}

function effectiveSchedulingStatus(habit, now = new Date()) {
  if (habit?.effective_status) return habit.effective_status;
  if (habit?.status === 'active') return 'active';

  // Lifecycle RPCs persist a D+1 pause/archive immediately and bound the still-effective
  // version with ends_on=D. Keep the remaining D occurrence without reviving old history.
  const today = localDateKey(normalizeNow(now));
  if (
    (habit?.status === 'paused' || habit?.status === 'archived')
      && validDateKey(habit?.ends_on)
      && (!habit?.starts_on || (validDateKey(habit.starts_on) && habit.starts_on <= today))
      && today <= habit.ends_on
  ) {
    return 'active';
  }
  return habit?.status || null;
}

function isSchedulable(habit, { now = new Date() } = {}) {
  return Boolean(
    habit
      && effectiveSchedulingStatus(habit, now) === 'active'
      && lineageIdOf(habit)
      && parseReminderTime(habit.reminder_time)
      && hasValidDateBounds(habit)
      && normalizedWeekdays(habit.scheduled_weekdays).length,
  );
}

function boundedHorizonDays(value) {
  if (!Number.isInteger(value) || value < 1) return REMINDER_HORIZON_DAYS;
  return Math.min(value, REMINDER_HORIZON_DAYS);
}

function buildReminderOccurrences(habit, {
  now = new Date(),
  horizonDays = REMINDER_HORIZON_DAYS,
} = {}) {
  const current = normalizeNow(now);
  if (!isSchedulable(habit, { now: current })) return [];
  const { hour, minute } = parseReminderTime(habit.reminder_time);
  const weekdays = new Set(normalizedWeekdays(habit.scheduled_weekdays));
  const excludedDates = new Set(normalizedExcludedDates(habit.excluded_dates));
  const today = localDateAt(current);
  const occurrences = [];

  for (let offset = 0; offset < boundedHorizonDays(horizonDays); offset += 1) {
    const day = addLocalDays(today, offset);
    const dateKey = localDateKey(day);
    if (habit.starts_on && dateKey < habit.starts_on) continue;
    if (habit.ends_on && dateKey > habit.ends_on) break;
    if (excludedDates.has(dateKey)) continue;
    if (!weekdays.has(day.getDay())) continue;
    const date = localDateAt(day, hour, minute);
    if (date.getTime() <= current.getTime()) continue;
    occurrences.push({ date, dateKey, weekday: day.getDay() });
  }
  return occurrences;
}

function reminderFingerprint(habit, options = {}) {
  if (!isSchedulable(habit, options)) return null;
  const occurrences = buildReminderOccurrences(habit, options);
  return JSON.stringify({
    schedule: 'bounded-date-v1',
    habitId: habit.id,
    lineageId: lineageIdOf(habit),
    reminderTime: habit.reminder_time,
    weekdays: normalizedWeekdays(habit.scheduled_weekdays),
    startsOn: habit.starts_on || null,
    endsOn: habit.ends_on || null,
    excludedDates: normalizedExcludedDates(habit.excluded_dates),
    occurrences: occurrences.map(({ date }) => date.getTime()),
  });
}

function buildReminderRequests(habit, options = {}) {
  return buildReminderOccurrences(habit, options).map(({ date }) => ({
    content: {
      title: 'Momento de tu protocolo',
      body: 'Abre HEXIS cuando est\u00e9s listo para actuar.',
      data: { screen: 'Today' },
      sound: false,
    },
    trigger: {
      date: date.getTime(),
    },
  }));
}

function defaultSettings() {
  return {
    globalEnabled: true,
    quietHours: { ...DEFAULT_QUIET_HOURS },
    acknowledgedTimezone: null,
  };
}

function normalizeTimezone(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSettings(value) {
  const defaults = defaultSettings();
  const quietHours = value?.quietHours;
  return {
    globalEnabled: value?.globalEnabled !== false,
    quietHours: {
      start: parseReminderTime(quietHours?.start) ? quietHours.start : defaults.quietHours.start,
      end: parseReminderTime(quietHours?.end) ? quietHours.end : defaults.quietHours.end,
    },
    acknowledgedTimezone: normalizeTimezone(value?.acknowledgedTimezone),
  };
}

function emptyState() {
  return { version: STATE_VERSION, users: {} };
}

function normalizeState(value) {
  if (!value || typeof value.users !== 'object' || value.users === null) return emptyState();

  if (value.version === LEGACY_STATE_VERSION) {
    const users = {};
    for (const [userId, records] of Object.entries(value.users)) {
      users[userId] = {
        settings: defaultSettings(),
        records: records && typeof records === 'object' ? records : {},
      };
    }
    return { version: STATE_VERSION, users };
  }

  if (value.version !== STATE_VERSION) return emptyState();
  const users = {};
  for (const [userId, user] of Object.entries(value.users)) {
    users[userId] = {
      settings: normalizeSettings(user?.settings),
      records: user?.records && typeof user.records === 'object' ? user.records : {},
    };
  }
  return { version: STATE_VERSION, users };
}

function userState(state, userId) {
  if (!state.users[userId]) {
    state.users[userId] = { settings: defaultSettings(), records: {} };
  }
  return state.users[userId];
}

function minutesOf(time) {
  const parsed = parseReminderTime(time);
  return parsed ? parsed.hour * 60 + parsed.minute : null;
}

function isWithinQuietHours(time, start, end) {
  const value = minutesOf(time);
  const startValue = minutesOf(start);
  const endValue = minutesOf(end);
  if (value === null || startValue === null || endValue === null || startValue === endValue) return false;
  if (startValue < endValue) return value >= startValue && value < endValue;
  return value >= startValue || value < endValue;
}

function timezoneChangeRequired(settings, deviceTimezone) {
  const current = normalizeTimezone(deviceTimezone);
  return Boolean(
    current
      && settings.acknowledgedTimezone
      && current !== settings.acknowledgedTimezone,
  );
}

function initializeTimezone(settings, deviceTimezone) {
  const current = normalizeTimezone(deviceTimezone);
  if (!settings.acknowledgedTimezone && current) {
    settings.acknowledgedTimezone = current;
    return true;
  }
  return false;
}

function weekdaysOfRecord(record) {
  if (Array.isArray(record?.weekdays)) return normalizedWeekdays(record.weekdays);
  if (!record?.fingerprint) return [];
  try {
    return normalizedWeekdays(JSON.parse(record.fingerprint)?.weekdays);
  } catch {
    return [];
  }
}

function occurrenceKeysOfRecord(record) {
  return [...new Set((record?.occurrenceKeys || []).filter(validDateKey))];
}

function findWeekdayLimitConflicts(
  records,
  habit,
  excludingLineage = lineageIdOf(habit),
  { now = new Date() } = {},
) {
  const occurrences = buildReminderOccurrences(habit, { now });
  const conflicts = [];

  for (const occurrence of occurrences) {
    let count = 0;
    const weekday = occurrence.weekday;
    const dateKey = occurrence.dateKey;

    for (const [lineageId, record] of Object.entries(records || {})) {
      if (lineageId === excludingLineage || record?.enabled !== true || !record.notificationIds?.length) continue;
      const occurrenceKeys = occurrenceKeysOfRecord(record);
      if (occurrenceKeys.length ? occurrenceKeys.includes(dateKey) : weekdaysOfRecord(record).includes(weekday)) {
        count += 1;
      }
    }
    if (count >= MAX_REMINDERS_PER_WEEKDAY) conflicts.push(dateKey);
  }

  return [...new Set(conflicts)];
}

async function cancelIdentifiers(notifications, identifiers) {
  const failures = [];
  for (const identifier of identifiers || []) {
    try {
      await notifications.cancel(identifier);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

function permissionIsGranted(permission) {
  return permission?.granted === true || permission?.status === PERMISSION_GRANTED;
}

function routeFromNotificationResponse(response) {
  const screen = response?.notification?.request?.content?.data?.screen;
  return screen === 'Today' ? 'Today' : null;
}

function preferencesOf(settings, deviceTimezone) {
  const current = normalizeTimezone(deviceTimezone);
  return {
    globalEnabled: settings.globalEnabled,
    quietHours: { ...settings.quietHours },
    acknowledgedTimezone: settings.acknowledgedTimezone,
    deviceTimezone: current,
    timezoneChangeRequired: timezoneChangeRequired(settings, current),
  };
}

function guardrailCode({ settings, habit, deviceTimezone, records, lineageId, now = new Date() }) {
  if (!settings.globalEnabled) return 'globally_disabled';
  if (timezoneChangeRequired(settings, deviceTimezone)) return 'timezone_change_required';
  if (effectiveSchedulingStatus(habit, now) === 'paused') return 'paused';
  if (!isSchedulable(habit, { now })) return 'not_configured';
  if (isWithinQuietHours(habit.reminder_time, settings.quietHours.start, settings.quietHours.end)) {
    return 'quiet_hours';
  }
  if (findWeekdayLimitConflicts(records, habit, lineageId, { now }).length) return 'weekday_limit';
  return null;
}

function publicStatus({
  enabled,
  habit,
  permission,
  scheduledCount = 0,
  blockedCode = null,
  now = new Date(),
}) {
  if (!enabled) return { code: 'inactive', enabled: false, scheduledCount: 0 };
  if (blockedCode) return { code: blockedCode, enabled: true, scheduledCount: 0 };
  if (effectiveSchedulingStatus(habit, now) === 'paused') {
    return { code: 'paused', enabled: true, scheduledCount: 0 };
  }
  if (!isSchedulable(habit, { now })) {
    return { code: 'not_configured', enabled: true, scheduledCount: 0 };
  }
  if (!permissionIsGranted(permission)) {
    return {
      code: permission?.canAskAgain === false ? 'permission_denied' : 'permission_required',
      enabled: true,
      scheduledCount: 0,
    };
  }
  return { code: scheduledCount ? 'active' : 'pending', enabled: true, scheduledCount };
}

function createReminderCoordinator({ store, notifications, clock = () => new Date() }) {
  if (!store || !notifications) throw new TypeError('Se requieren store y notifications.');
  const readClock = typeof clock === 'function' ? clock : clock?.now?.bind(clock);
  if (!readClock) throw new TypeError('El reloj debe ser una funcion o exponer now().');
  const currentTime = () => normalizeNow(readClock());

  async function getPreferences({ userId, deviceTimezone = null }) {
    const state = normalizeState(await store.load());
    return preferencesOf(userState(state, userId).settings, deviceTimezone);
  }

  async function getStatus({ userId, habit, deviceTimezone = null }) {
    const now = currentTime();
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    const lineageId = lineageIdOf(habit);
    const record = user.records[lineageId];
    const blockedCode = record?.enabled
      ? guardrailCode({ settings: user.settings, habit, deviceTimezone, records: user.records, lineageId, now })
      : null;
    const permission = blockedCode ? null : await notifications.getPermission();
    return publicStatus({
      enabled: record?.enabled === true,
      habit,
      permission,
      blockedCode: blockedCode || record?.blockedCode || null,
      scheduledCount: record?.notificationIds?.length || 0,
      now,
    });
  }

  async function saveBlockedRecord({ state, user, lineageId, record, habit, code, now }) {
    const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
    if (cancellationFailures.length) throw cancellationFailures[0];
    user.records[lineageId] = {
      ...record,
      enabled: true,
      habitId: habit?.id || record.habitId,
      fingerprint: null,
      notificationIds: [],
      weekdays: [],
      occurrenceKeys: [],
      blockedCode: code,
    };
    await store.save(state);
    return publicStatus({ enabled: true, habit, blockedCode: code, now });
  }

  async function reconcileHabit({
    userId,
    previousHabit = null,
    nextHabit = null,
    deviceTimezone = null,
  }) {
    const now = currentTime();
    const lineageId = lineageIdOf(nextHabit) || lineageIdOf(previousHabit);
    if (!lineageId) return { code: 'inactive', enabled: false, scheduledCount: 0 };

    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    const record = user.records[lineageId];
    if (!record?.enabled) return { code: 'inactive', enabled: false, scheduledCount: 0 };
    const initializedTimezone = initializeTimezone(user.settings, deviceTimezone);

    const archivedStillEffectiveToday = nextHabit?.status === 'archived'
      && effectiveSchedulingStatus(nextHabit, now) === 'active';
    if (!nextHabit || (nextHabit.status === 'archived' && !archivedStillEffectiveToday) || !nextHabit.reminder_time) {
      const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
      if (cancellationFailures.length) throw cancellationFailures[0];
      delete user.records[lineageId];
      await store.save(state);
      return { code: 'inactive', enabled: false, scheduledCount: 0 };
    }

    const blockedCode = guardrailCode({
      settings: user.settings,
      habit: nextHabit,
      deviceTimezone,
      records: user.records,
      lineageId,
      now,
    });
    if (blockedCode) {
      return saveBlockedRecord({ state, user, lineageId, record, habit: nextHabit, code: blockedCode, now });
    }

    const permission = await notifications.getPermission();
    if (!permissionIsGranted(permission)) {
      return saveBlockedRecord({
        state,
        user,
        lineageId,
        record,
        habit: nextHabit,
        code: permission?.canAskAgain === false ? 'permission_denied' : 'permission_required',
        now,
      });
    }

    const occurrences = buildReminderOccurrences(nextHabit, { now });
    const fingerprint = reminderFingerprint(nextHabit, { now });
    const requests = buildReminderRequests(nextHabit, { now });
    if (record.fingerprint === fingerprint && record.notificationIds?.length === requests.length) {
      if (
        initializedTimezone
        || record.blockedCode
        || !Array.isArray(record.weekdays)
        || !Array.isArray(record.occurrenceKeys)
      ) {
        user.records[lineageId] = {
          ...record,
          weekdays: normalizedWeekdays(nextHabit.scheduled_weekdays),
          occurrenceKeys: occurrences.map(({ dateKey }) => dateKey),
          blockedCode: null,
        };
        await store.save(state);
      }
      return publicStatus({
        enabled: true,
        habit: nextHabit,
        permission,
        scheduledCount: record.notificationIds.length,
        now,
      });
    }

    await notifications.ensureChannel();
    const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
    if (cancellationFailures.length) throw cancellationFailures[0];

    const newIdentifiers = [];
    try {
      for (const request of requests) {
        newIdentifiers.push(await notifications.schedule(request));
      }
    } catch (error) {
      await cancelIdentifiers(notifications, newIdentifiers);
      throw error;
    }

    user.records[lineageId] = {
      enabled: true,
      habitId: nextHabit.id,
      fingerprint,
      notificationIds: newIdentifiers,
      weekdays: normalizedWeekdays(nextHabit.scheduled_weekdays),
      occurrenceKeys: occurrences.map(({ dateKey }) => dateKey),
      blockedCode: null,
    };
    try {
      await store.save(state);
    } catch (error) {
      await cancelIdentifiers(notifications, newIdentifiers);
      throw error;
    }
    return publicStatus({
      enabled: true,
      habit: nextHabit,
      permission,
      scheduledCount: newIdentifiers.length,
      now,
    });
  }

  async function setEnabled({ userId, habit, enabled, deviceTimezone = null }) {
    const now = currentTime();
    const lineageId = lineageIdOf(habit);
    if (!lineageId) throw new TypeError('El compromiso no tiene identificador.');
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    const current = user.records[lineageId];

    if (!enabled) {
      const cancellationFailures = await cancelIdentifiers(notifications, current?.notificationIds);
      if (cancellationFailures.length) throw cancellationFailures[0];
      delete user.records[lineageId];
      await store.save(state);
      return { code: 'inactive', enabled: false, scheduledCount: 0 };
    }

    initializeTimezone(user.settings, deviceTimezone);
    const blockedCode = guardrailCode({
      settings: user.settings,
      habit,
      deviceTimezone,
      records: user.records,
      lineageId,
      now,
    });

    if (!blockedCode) {
      let permission = await notifications.getPermission();
      if (!permissionIsGranted(permission) && permission?.canAskAgain !== false) {
        permission = await notifications.requestPermission();
      }
      if (!permissionIsGranted(permission) && !current?.enabled) {
        return {
          code: permission?.canAskAgain === false ? 'permission_denied' : 'permission_required',
          enabled: false,
          scheduledCount: 0,
        };
      }
    }

    user.records[lineageId] = {
      enabled: true,
      habitId: habit.id,
      fingerprint: current?.fingerprint || null,
      notificationIds: current?.notificationIds || [],
      weekdays: weekdaysOfRecord(current),
      occurrenceKeys: occurrenceKeysOfRecord(current),
      blockedCode: current?.blockedCode || null,
    };
    await store.save(state);
    return reconcileHabit({ userId, previousHabit: habit, nextHabit: habit, deviceTimezone });
  }

  async function reconcileUser({ userId, habits, deviceTimezone = null }) {
    const latestByLineage = new Map(
      (habits || []).map((habit) => [lineageIdOf(habit), habit]).filter(([lineageId]) => lineageId),
    );
    const initialState = normalizeState(await store.load());
    const knownLineages = Object.keys(userState(initialState, userId).records);
    const statuses = {};

    for (const lineageId of knownLineages) {
      const nextHabit = latestByLineage.get(lineageId) || null;
      statuses[lineageId] = await reconcileHabit({ userId, nextHabit, deviceTimezone });
    }
    for (const [lineageId, habit] of latestByLineage) {
      if (!statuses[lineageId]) {
        statuses[lineageId] = await getStatus({ userId, habit, deviceTimezone });
      }
    }
    return statuses;
  }

  async function setGlobalEnabled({ userId, habits, enabled, deviceTimezone = null }) {
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    initializeTimezone(user.settings, deviceTimezone);
    user.settings.globalEnabled = Boolean(enabled);

    if (!enabled) {
      const statuses = {};
      for (const [lineageId, record] of Object.entries(user.records)) {
        const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
        if (cancellationFailures.length) throw cancellationFailures[0];
        user.records[lineageId] = {
          ...record,
          fingerprint: null,
          notificationIds: [],
          weekdays: [],
          occurrenceKeys: [],
          blockedCode: 'globally_disabled',
        };
        statuses[lineageId] = { code: 'globally_disabled', enabled: true, scheduledCount: 0 };
      }
      await store.save(state);
      return { preferences: preferencesOf(user.settings, deviceTimezone), statuses };
    }

    await store.save(state);
    const statuses = await reconcileUser({ userId, habits, deviceTimezone });
    return { preferences: await getPreferences({ userId, deviceTimezone }), statuses };
  }

  async function setQuietHours({ userId, habits, start, end, deviceTimezone = null }) {
    if (!parseReminderTime(start) || !parseReminderTime(end)) {
      throw new TypeError('Las horas de silencio deben usar el formato HH:mm.');
    }
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    initializeTimezone(user.settings, deviceTimezone);
    user.settings.quietHours = { start, end };
    await store.save(state);
    const statuses = await reconcileUser({ userId, habits, deviceTimezone });
    return { preferences: await getPreferences({ userId, deviceTimezone }), statuses };
  }

  async function acknowledgeTimezone({ userId, habits, deviceTimezone }) {
    const current = normalizeTimezone(deviceTimezone);
    if (!current) throw new TypeError('Se requiere la zona horaria actual del dispositivo.');
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    user.settings.acknowledgedTimezone = current;
    await store.save(state);
    const statuses = await reconcileUser({ userId, habits, deviceTimezone: current });
    return { preferences: await getPreferences({ userId, deviceTimezone: current }), statuses };
  }

  async function suspendForTimezoneChange({ userId, deviceTimezone }) {
    const state = normalizeState(await store.load());
    const user = userState(state, userId);
    if (!timezoneChangeRequired(user.settings, deviceTimezone)) {
      return { preferences: preferencesOf(user.settings, deviceTimezone), statuses: {} };
    }

    const statuses = {};
    for (const [lineageId, record] of Object.entries(user.records)) {
      if (record?.enabled !== true) continue;
      const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
      if (cancellationFailures.length) throw cancellationFailures[0];
      user.records[lineageId] = {
        ...record,
        fingerprint: null,
        notificationIds: [],
        weekdays: [],
        occurrenceKeys: [],
        blockedCode: 'timezone_change_required',
      };
      statuses[lineageId] = {
        code: 'timezone_change_required',
        enabled: true,
        scheduledCount: 0,
      };
    }
    await store.save(state);
    return { preferences: preferencesOf(user.settings, deviceTimezone), statuses };
  }

  async function disableUser({ userId }) {
    const state = normalizeState(await store.load());
    const records = userState(state, userId).records;
    for (const record of Object.values(records)) {
      const cancellationFailures = await cancelIdentifiers(notifications, record.notificationIds);
      if (cancellationFailures.length) throw cancellationFailures[0];
    }
    delete state.users[userId];
    await store.save(state);
  }

  return {
    acknowledgeTimezone,
    disableUser,
    getPreferences,
    getStatus,
    reconcileHabit,
    reconcileUser,
    setEnabled,
    setGlobalEnabled,
    setQuietHours,
    suspendForTimezoneChange,
  };
}

module.exports = {
  DEFAULT_QUIET_HOURS,
  MAX_REMINDERS_PER_WEEKDAY,
  REMINDER_HORIZON_DAYS,
  STATE_VERSION,
  buildReminderRequests,
  createReminderCoordinator,
  findWeekdayLimitConflicts,
  isSchedulable,
  isWithinQuietHours,
  lineageIdOf,
  normalizeState,
  parseReminderTime,
  permissionIsGranted,
  reminderFingerprint,
  routeFromNotificationResponse,
};
