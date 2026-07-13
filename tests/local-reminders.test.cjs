'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildReminderRequests,
  createReminderCoordinator,
  isWithinQuietHours,
  normalizeState,
  parseReminderTime,
  reminderFingerprint,
  routeFromNotificationResponse,
} = require('../src/notifications/localReminderCoordinator.cjs');

const FIXED_NOW = new Date(2026, 6, 12, 6, 0, 0, 0);

function habit(overrides = {}) {
  return {
    id: 'habit-v1',
    lineage_id: 'habit-root',
    status: 'active',
    reminder_time: '07:30',
    scheduled_weekdays: [1, 3, 5],
    starts_on: '2026-07-12',
    ends_on: '2026-07-18',
    ...overrides,
  };
}

function reminderCoordinator(store, notifications, now = FIXED_NOW) {
  return createReminderCoordinator({
    store,
    notifications,
    clock: () => new Date(now.getTime()),
  });
}

function memoryStore(initialValue = null) {
  let value = initialValue;
  return {
    async load() {
      return value == null ? null : structuredClone(value);
    },
    async save(next) {
      value = structuredClone(next);
    },
    snapshot() {
      return structuredClone(value);
    },
  };
}

function notificationDriver({
  permission = { granted: true, status: 'granted', canAskAgain: true },
  requestedPermission = permission,
} = {}) {
  let nextId = 1;
  const scheduled = [];
  const cancelled = [];
  let permissionRequests = 0;
  return {
    scheduled,
    cancelled,
    get permissionRequests() { return permissionRequests; },
    async getPermission() { return permission; },
    async requestPermission() {
      permissionRequests += 1;
      permission = requestedPermission;
      return requestedPermission;
    },
    async ensureChannel() {},
    async schedule(request) {
      const id = `notification-${nextId++}`;
      scheduled.push({ id, request });
      return id;
    },
    async cancel(id) { cancelled.push(id); },
  };
}

test('convierte weekdays a fechas locales one-shot acotadas y no incluye datos sensibles', () => {
  assert.deepEqual(parseReminderTime('07:30'), { hour: 7, minute: 30 });
  assert.equal(parseReminderTime('24:00'), null);

  const requests = buildReminderRequests(habit({ scheduled_weekdays: [6, 0, 6] }), { now: FIXED_NOW });
  assert.deepEqual(requests.map((request) => new Date(request.trigger.date).getDay()), [0, 6]);
  assert.ok(requests.every((request) => request.trigger.date > FIXED_NOW.getTime()));
  assert.ok(requests.every((request) => Object.keys(request.trigger).join(',') === 'date'));
  assert.ok(requests.every((request) => request.content.title === 'Momento de tu protocolo'));
  assert.ok(requests.every((request) => !JSON.stringify(request.content).includes('habit-v1')));
});

test('migra estado v1 a v2 sin perder ningún registro y aplica preferencias seguras', () => {
  const legacyRecord = {
    enabled: true,
    habitId: 'habit-v1',
    fingerprint: reminderFingerprint(habit()),
    notificationIds: ['legacy-1', 'legacy-2', 'legacy-3'],
  };
  const migrated = normalizeState({
    version: 1,
    users: { 'user-a': { 'habit-root': legacyRecord } },
  });

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.users['user-a'].records['habit-root'], legacyRecord);
  assert.deepEqual(migrated.users['user-a'].settings, {
    globalEnabled: true,
    quietHours: { start: '22:00', end: '07:00' },
    acknowledgedTimezone: null,
  });
});

test('las horas de silencio cruzan medianoche con inicio inclusivo y fin exclusivo', () => {
  assert.equal(isWithinQuietHours('22:00', '22:00', '07:00'), true);
  assert.equal(isWithinQuietHours('03:15', '22:00', '07:00'), true);
  assert.equal(isWithinQuietHours('07:00', '22:00', '07:00'), false);
  assert.equal(isWithinQuietHours('21:59', '22:00', '07:00'), false);
  assert.equal(isWithinQuietHours('12:00', '00:00', '00:00'), false);
});

test('solo acepta la ruta interna Today desde una respuesta local', () => {
  const response = (screen) => ({ notification: { request: { content: { data: { screen } } } } });
  assert.equal(routeFromNotificationResponse(response('Today')), 'Today');
  assert.equal(routeFromNotificationResponse(response('Account')), null);
  assert.equal(routeFromNotificationResponse(null), null);
});

test('consultar y reconciliar no solicita permisos sin una acción explícita', async () => {
  const store = memoryStore();
  const notifications = notificationDriver({
    permission: { granted: false, status: 'undetermined', canAskAgain: true },
  });
  const coordinator = reminderCoordinator(store, notifications);

  assert.equal((await coordinator.getStatus({ userId: 'user-a', habit: habit() })).code, 'inactive');
  await coordinator.reconcileUser({ userId: 'user-a', habits: [habit()] });
  assert.equal(notifications.permissionRequests, 0);
  assert.equal(notifications.scheduled.length, 0);
});

test('activar solicita permiso una vez, programa por día y reconcilia de forma idempotente', async () => {
  const store = memoryStore();
  const notifications = notificationDriver({
    permission: { granted: false, status: 'undetermined', canAskAgain: true },
    requestedPermission: { granted: true, status: 'granted', canAskAgain: true },
  });
  const coordinator = reminderCoordinator(store, notifications);

  const enabled = await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true });
  assert.equal(enabled.code, 'active');
  assert.equal(enabled.scheduledCount, 3);
  assert.equal(notifications.permissionRequests, 1);
  assert.equal(notifications.scheduled.length, 3);

  const reconciled = await coordinator.reconcileHabit({ userId: 'user-a', nextHabit: habit() });
  assert.equal(reconciled.scheduledCount, 3);
  assert.equal(notifications.scheduled.length, 3);
  assert.equal(notifications.cancelled.length, 0);
  assert.equal(typeof reminderFingerprint(habit()), 'string');
});

test('expone preferencias y fija la primera zona horaria sin exigir confirmación', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);

  assert.deepEqual(await coordinator.getPreferences({
    userId: 'user-a',
    deviceTimezone: 'America/Panama',
  }), {
    globalEnabled: true,
    quietHours: { start: '22:00', end: '07:00' },
    acknowledgedTimezone: null,
    deviceTimezone: 'America/Panama',
    timezoneChangeRequired: false,
  });

  await coordinator.setEnabled({
    userId: 'user-a',
    habit: habit(),
    enabled: true,
    deviceTimezone: 'America/Panama',
  });
  const preferences = await coordinator.getPreferences({
    userId: 'user-a',
    deviceTimezone: 'America/Panama',
  });
  assert.equal(preferences.acknowledgedTimezone, 'America/Panama');
  assert.equal(preferences.timezoneChangeRequired, false);
});

test('un permiso no concedido no persiste ni programa un recordatorio', async () => {
  const store = memoryStore();
  const notifications = notificationDriver({
    permission: { granted: false, status: 'denied', canAskAgain: false },
  });
  const coordinator = reminderCoordinator(store, notifications);

  const result = await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true });
  assert.equal(result.code, 'permission_denied');
  assert.equal(result.enabled, false);
  assert.equal(notifications.scheduled.length, 0);
  assert.equal(store.snapshot(), null);
});

test('pausar cancela, conserva la preferencia y reactivar programa la nueva versión', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true });

  const paused = await coordinator.reconcileHabit({
    userId: 'user-a',
    previousHabit: habit(),
    nextHabit: habit({ id: 'habit-v2', status: 'paused', effective_status: 'paused' }),
  });
  assert.equal(paused.code, 'paused');
  assert.equal(paused.enabled, true);
  assert.equal(notifications.cancelled.length, 3);

  const active = await coordinator.reconcileHabit({
    userId: 'user-a',
    nextHabit: habit({ id: 'habit-v3' }),
  });
  assert.equal(active.code, 'active');
  assert.equal(notifications.scheduled.length, 6);
});

test('bloquea horas de silencio, cancela avisos activos y reconcilia al cambiar la ventana', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const eveningHabit = habit({ reminder_time: '21:30', scheduled_weekdays: [1] });
  await coordinator.setEnabled({ userId: 'user-a', habit: eveningHabit, enabled: true });

  const blocked = await coordinator.setQuietHours({
    userId: 'user-a',
    habits: [eveningHabit],
    start: '21:00',
    end: '07:00',
  });
  assert.equal(blocked.statuses['habit-root'].code, 'quiet_hours');
  assert.equal(notifications.cancelled.length, 1);
  assert.equal(blocked.preferences.quietHours.start, '21:00');

  const restored = await coordinator.setQuietHours({
    userId: 'user-a',
    habits: [eveningHabit],
    start: '00:00',
    end: '00:00',
  });
  assert.equal(restored.statuses['habit-root'].code, 'active');
  assert.equal(notifications.scheduled.length, 2);
  await assert.rejects(
    coordinator.setQuietHours({ userId: 'user-a', habits: [], start: '9:00', end: '07:00' }),
    /HH:mm/,
  );
});

test('apagado global conserva preferencias individuales, cancela y bloquea nuevos schedules', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const first = habit({ scheduled_weekdays: [1] });
  const second = habit({ id: 'habit-2', lineage_id: 'root-2', scheduled_weekdays: [2] });
  await coordinator.setEnabled({ userId: 'user-a', habit: first, enabled: true });

  const disabled = await coordinator.setGlobalEnabled({
    userId: 'user-a',
    habits: [first],
    enabled: false,
  });
  assert.equal(disabled.preferences.globalEnabled, false);
  assert.equal(disabled.statuses['habit-root'].code, 'globally_disabled');
  assert.equal(notifications.cancelled.length, 1);

  const blocked = await coordinator.setEnabled({ userId: 'user-a', habit: second, enabled: true });
  assert.equal(blocked.code, 'globally_disabled');
  assert.equal(blocked.enabled, true);
  assert.equal(notifications.scheduled.length, 1);

  const enabled = await coordinator.setGlobalEnabled({
    userId: 'user-a',
    habits: [first, second],
    enabled: true,
  });
  assert.equal(enabled.preferences.globalEnabled, true);
  assert.equal(enabled.statuses['habit-root'].code, 'active');
  assert.equal(enabled.statuses['root-2'].code, 'active');
  assert.equal(notifications.scheduled.length, 3);
});

test('un cambio de zona horaria cancela y exige acknowledge antes de reprogramar', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const currentHabit = habit({ scheduled_weekdays: [1] });
  await coordinator.setEnabled({
    userId: 'user-a',
    habit: currentHabit,
    enabled: true,
    deviceTimezone: 'America/Panama',
  });

  const blocked = await coordinator.reconcileHabit({
    userId: 'user-a',
    nextHabit: currentHabit,
    deviceTimezone: 'America/Bogota',
  });
  assert.equal(blocked.code, 'timezone_change_required');
  assert.equal(notifications.cancelled.length, 1);
  assert.equal((await coordinator.getPreferences({
    userId: 'user-a',
    deviceTimezone: 'America/Bogota',
  })).timezoneChangeRequired, true);

  const acknowledged = await coordinator.acknowledgeTimezone({
    userId: 'user-a',
    habits: [currentHabit],
    deviceTimezone: 'America/Bogota',
  });
  assert.equal(acknowledged.preferences.acknowledgedTimezone, 'America/Bogota');
  assert.equal(acknowledged.preferences.timezoneChangeRequired, false);
  assert.equal(acknowledged.statuses['habit-root'].code, 'active');
  assert.equal(notifications.scheduled.length, 2);
});

test('bootstrap suspende avisos al detectar otra zona sin cargar hábitos del servidor', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const currentHabit = habit({ scheduled_weekdays: [1] });
  await coordinator.setEnabled({
    userId: 'user-a',
    habit: currentHabit,
    enabled: true,
    deviceTimezone: 'America/Panama',
  });

  const suspended = await coordinator.suspendForTimezoneChange({
    userId: 'user-a',
    deviceTimezone: 'Europe/Madrid',
  });

  assert.equal(suspended.preferences.timezoneChangeRequired, true);
  assert.equal(suspended.statuses['habit-root'].code, 'timezone_change_required');
  assert.deepEqual(notifications.cancelled, ['notification-1']);
  assert.deepEqual(
    store.snapshot().users['user-a'].records['habit-root'].notificationIds,
    [],
  );
});

test('impone un máximo global de dos recordatorios por weekday y recupera capacidad', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const first = habit({ id: 'habit-1', lineage_id: 'root-1', scheduled_weekdays: [1] });
  const second = habit({ id: 'habit-2', lineage_id: 'root-2', scheduled_weekdays: [1] });
  const third = habit({ id: 'habit-3', lineage_id: 'root-3', scheduled_weekdays: [1] });

  assert.equal((await coordinator.setEnabled({ userId: 'user-a', habit: first, enabled: true })).code, 'active');
  assert.equal((await coordinator.setEnabled({ userId: 'user-a', habit: second, enabled: true })).code, 'active');
  const limited = await coordinator.setEnabled({ userId: 'user-a', habit: third, enabled: true });
  assert.equal(limited.code, 'weekday_limit');
  assert.equal(limited.enabled, true);
  assert.equal(notifications.scheduled.length, 2);

  await coordinator.setEnabled({ userId: 'user-a', habit: first, enabled: false });
  const statuses = await coordinator.reconcileUser({ userId: 'user-a', habits: [second, third] });
  assert.equal(statuses['root-3'].code, 'active');
  assert.equal(notifications.scheduled.length, 3);
});

test('una transición D+1 raw paused o archived conserva como máximo el aviso restante de D', async () => {
  for (const status of ['paused', 'archived']) {
    const store = memoryStore();
    const notifications = notificationDriver();
    const coordinator = reminderCoordinator(store, notifications);
    const current = habit({
      scheduled_weekdays: [0, 1],
      ends_on: '2026-08-15',
    });
    await coordinator.setEnabled({ userId: 'user-a', habit: current, enabled: true });

    const bounded = habit({
      id: `habit-${status}`,
      status,
      scheduled_weekdays: [0, 1],
      ends_on: '2026-07-12',
    });
    const result = await coordinator.reconcileHabit({
      userId: 'user-a',
      previousHabit: current,
      nextHabit: bounded,
    });

    assert.equal(result.code, 'active');
    assert.equal(result.scheduledCount, 1);
    const remaining = notifications.scheduled.slice(-result.scheduledCount);
    assert.deepEqual(
      remaining.map(({ request }) => {
        const date = new Date(request.trigger.date);
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
      }),
      [[2026, 7, 12]],
    );
    assert.ok(remaining.every(({ request }) => request.trigger.date > FIXED_NOW.getTime()));
  }
});

test('excluded_dates elimina el one-shot de descanso D+1 y quitar la exclusión lo restaura', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const current = habit({
    scheduled_weekdays: [0, 1],
    ends_on: '2026-07-13',
  });

  assert.equal(
    (await coordinator.setEnabled({ userId: 'user-a', habit: current, enabled: true })).scheduledCount,
    2,
  );
  const initialFingerprint = store.snapshot().users['user-a'].records['habit-root'].fingerprint;

  const resting = { ...current, excluded_dates: ['2026-07-13', 'fecha-invalida'] };
  const excluded = await coordinator.reconcileHabit({
    userId: 'user-a',
    previousHabit: current,
    nextHabit: resting,
  });
  assert.equal(excluded.scheduledCount, 1);
  assert.deepEqual(
    notifications.scheduled.slice(-1).map(({ request }) => new Date(request.trigger.date).getDate()),
    [12],
  );
  const excludedFingerprint = store.snapshot().users['user-a'].records['habit-root'].fingerprint;
  assert.notEqual(excludedFingerprint, initialFingerprint);

  const restored = await coordinator.reconcileHabit({
    userId: 'user-a',
    previousHabit: resting,
    nextHabit: { ...current, excluded_dates: [] },
  });
  assert.equal(restored.scheduledCount, 2);
  assert.deepEqual(
    notifications.scheduled.slice(-2).map(({ request }) => new Date(request.trigger.date).getDate()),
    [12, 13],
  );
  assert.equal(store.snapshot().users['user-a'].records['habit-root'].fingerprint, initialFingerprint);
});

test('un hábito normal nunca crea más de 21 one-shots en el horizonte rodante', () => {
  const requests = buildReminderRequests(habit({
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    starts_on: '2026-01-01',
    ends_on: null,
  }), { now: FIXED_NOW, horizonDays: 999 });

  assert.equal(requests.length, 21);
  assert.equal(new Date(requests[0].trigger.date).getDate(), 12);
  assert.equal(new Date(requests.at(-1).trigger.date).getDate(), 1);
  assert.ok(requests.every(({ trigger }) => Object.keys(trigger).join(',') === 'date'));
});

test('el límite global de dos avisos por día deja como máximo 42 one-shots en 21 días', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const first = habit({ id: 'habit-1', lineage_id: 'root-1', scheduled_weekdays: everyDay, ends_on: null });
  const second = habit({ id: 'habit-2', lineage_id: 'root-2', scheduled_weekdays: everyDay, ends_on: null });
  const third = habit({ id: 'habit-3', lineage_id: 'root-3', scheduled_weekdays: everyDay, ends_on: null });

  assert.equal((await coordinator.setEnabled({ userId: 'user-a', habit: first, enabled: true })).scheduledCount, 21);
  assert.equal((await coordinator.setEnabled({ userId: 'user-a', habit: second, enabled: true })).scheduledCount, 21);
  assert.equal((await coordinator.setEnabled({ userId: 'user-a', habit: third, enabled: true })).code, 'weekday_limit');
  assert.equal(notifications.scheduled.length, 42);
});

test('el wrapper Expo usa DATE y no restaura recurrencias WEEKLY', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'notifications', 'localReminders.js'),
    'utf8',
  );
  assert.match(source, /SchedulableTriggerInputTypes\.DATE/);
  assert.doesNotMatch(source, /SchedulableTriggerInputTypes\.WEEKLY/);
});

test('archivar elimina la preferencia y desactivar es idempotente', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true });

  const archived = await coordinator.reconcileHabit({
    userId: 'user-a',
    previousHabit: habit(),
    nextHabit: habit({ status: 'archived', effective_status: 'archived' }),
  });
  assert.deepEqual(archived, { code: 'inactive', enabled: false, scheduledCount: 0 });
  assert.deepEqual(store.snapshot().users['user-a'].records, {});

  const disabled = await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: false });
  assert.deepEqual(disabled, { code: 'inactive', enabled: false, scheduledCount: 0 });
});

test('cancela avisos recién creados si falla la persistencia del registro', async () => {
  const baseStore = memoryStore();
  let saves = 0;
  const store = {
    load: () => baseStore.load(),
    async save(value) {
      saves += 1;
      if (saves === 2) throw new Error('storage unavailable');
      return baseStore.save(value);
    },
  };
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);

  await assert.rejects(
    coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true }),
    /storage unavailable/,
  );
  assert.equal(notifications.scheduled.length, 3);
  assert.deepEqual(notifications.cancelled, notifications.scheduled.map(({ id }) => id));
});

test('desactivar un usuario cancela sus avisos y elimina su estado local', async () => {
  const store = memoryStore();
  const notifications = notificationDriver();
  const coordinator = reminderCoordinator(store, notifications);
  await coordinator.setEnabled({ userId: 'user-a', habit: habit(), enabled: true });

  await coordinator.disableUser({ userId: 'user-a' });

  assert.equal(notifications.cancelled.length, 3);
  assert.equal(store.snapshot().users['user-a'], undefined);
});
