'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ITEM_KEYS,
  OperationConflictError,
  QueueCapacityError,
  UnsupportedQueueVersionError,
  ack,
  backoffDelayMs,
  claim,
  deserializeQueue,
  enqueue,
  fail,
  retryFailed,
  serializeQueue,
} = require('../src/data/sync/checkInQueue.cjs');
const {
  createPersistedCheckInQueue,
} = require('../src/data/sync/persistedCheckInQueue.cjs');

const T0 = '2026-07-12T12:00:00.000Z';

function operation(operationId, overrides = {}) {
  return {
    operation_id: operationId,
    user_id: 'user-1',
    habit_id: 'habit-1',
    local_date: '2026-07-12',
    timezone: 'America/Panama',
    intent: 'record',
    completion_level: 'minimum',
    occurred_at: T0,
    ...overrides,
  };
}

function add(queue, operationId, overrides, options = {}) {
  return enqueue(queue, operation(operationId, overrides), {
    maxItems: options.maxItems ?? 200,
    now: options.now ?? T0,
  }).queue;
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    value(key) {
      return values.get(key);
    },
  };
}

test('enqueue persiste solo el allowlist y deduplica por operation_id', () => {
  const input = operation('op-1', {
    email: 'persona@example.com',
    note: 'texto que nunca debe persistirse',
  });
  const first = enqueue([], input, { now: T0 });

  assert.equal(first.added, true);
  assert.deepEqual(Object.keys(first.item), ITEM_KEYS);
  assert.equal('email' in first.item, false);
  assert.equal('note' in first.item, false);

  const duplicate = enqueue(first.queue, input, {
    now: '2026-07-12T12:10:00.000Z',
  });
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.queue.length, 1);
  assert.equal(duplicate.item.next_attempt_at, T0);

  assert.throws(
    () =>
      enqueue(first.queue, operation('op-1', { habit_id: 'habit-2' }), {
        now: T0,
      }),
    OperationConflictError,
  );
});

test('el limite rechaza nuevas operaciones sin descartar evidencia', () => {
  let queue = add([], 'op-1', {}, { maxItems: 2 });
  queue = add(queue, 'op-2', {}, { maxItems: 2 });

  const duplicate = enqueue(queue, operation('op-2'), {
    maxItems: 2,
    now: T0,
  });
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.queue.length, 2);

  assert.throws(
    () =>
      enqueue(queue, operation('op-3'), {
        maxItems: 2,
        now: T0,
      }),
    QueueCapacityError,
  );
  assert.equal(queue.length, 2);
});

test('retract exige completion_level nulo y nunca conserva texto adicional', () => {
  const result = enqueue(
    [],
    operation('op-retract', {
      intent: 'retract',
      completion_level: null,
      reason: 'este texto no debe persistirse',
    }),
    { now: T0 },
  );
  assert.equal(result.item.intent, 'retract');
  assert.equal(result.item.completion_level, null);
  assert.equal('reason' in result.item, false);

  assert.throws(
    () =>
      enqueue(
        [],
        operation('op-invalid-retract', { intent: 'retract' }),
        { now: T0 },
      ),
    /completion_level debe ser null/,
  );
});

test('serializa con version y recupera JSON corrupto de forma cerrada', () => {
  const queue = add([], 'op-1');
  const raw = serializeQueue(queue);
  assert.equal(JSON.parse(raw).version, 1);
  assert.deepEqual(deserializeQueue(raw).queue, queue);

  const corrupt = deserializeQueue('{esto no es JSON');
  assert.deepEqual(corrupt, {
    queue: [],
    reason: 'invalid_json',
    recovered: true,
  });

  const invalidItem = JSON.parse(raw);
  invalidItem.items[0].free_text = 'no permitido';
  assert.deepEqual(deserializeQueue(JSON.stringify(invalidItem)), {
    queue: [],
    reason: 'invalid_items',
    recovered: true,
  });

  assert.throws(
    () => deserializeQueue(JSON.stringify({ version: 2, items: [] })),
    UnsupportedQueueVersionError,
  );
});

test('claim crea un lease y recupera operaciones in_flight vencidas', () => {
  const queue = add([], 'op-1');
  const first = claim(queue, { now: T0, leaseMs: 1_000, limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].attempts, 1);
  assert.equal(first.items[0].status, 'in_flight');
  assert.equal(first.items[0].next_attempt_at, '2026-07-12T12:00:01.000Z');
  assert.equal(queue[0].status, 'pending');

  const beforeExpiry = claim(first.queue, {
    now: '2026-07-12T12:00:00.999Z',
    leaseMs: 1_000,
  });
  assert.equal(beforeExpiry.items.length, 0);

  const afterExpiry = claim(beforeExpiry.queue, {
    now: '2026-07-12T12:00:01.000Z',
    leaseMs: 1_000,
  });
  assert.equal(afterExpiry.items.length, 1);
  assert.equal(afterExpiry.items[0].attempts, 2);
});

test('claim puede aislar operaciones por usuario sin tocar las de otra sesión', () => {
  let queue = add([], 'own-operation');
  queue = add(queue, 'foreign-operation', { user_id: 'user-2' });
  const result = claim(queue, { now: T0, userId: 'user-1' });
  assert.deepEqual(result.items.map((item) => item.operation_id), ['own-operation']);
  const foreign = result.queue.find((item) => item.operation_id === 'foreign-operation');
  assert.equal(foreign.status, 'pending');
  assert.equal(foreign.attempts, 0);
});

test('fail aplica backoff exponencial acotado y estado terminal', () => {
  assert.equal(
    backoffDelayMs(10, { baseDelayMs: 1_000, maxDelayMs: 3_000 }),
    3_000,
  );
  let queue = add([], 'op-1');
  queue = claim(queue, { now: T0, leaseMs: 100, maxAttempts: 3 }).queue;
  let failed = fail(queue, 'op-1', {
    now: T0,
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    maxAttempts: 3,
  });
  assert.equal(failed.rescheduled, 1);
  assert.equal(failed.queue[0].status, 'pending');
  assert.equal(failed.queue[0].next_attempt_at, '2026-07-12T12:00:01.000Z');

  queue = claim(failed.queue, {
    now: '2026-07-12T12:00:01.000Z',
    leaseMs: 100,
    maxAttempts: 3,
  }).queue;
  failed = fail(queue, 'op-1', {
    now: '2026-07-12T12:00:01.000Z',
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    maxAttempts: 3,
  });
  assert.equal(failed.queue[0].next_attempt_at, '2026-07-12T12:00:03.000Z');

  queue = claim(failed.queue, {
    now: '2026-07-12T12:00:03.000Z',
    leaseMs: 100,
    maxAttempts: 3,
  }).queue;
  failed = fail(queue, 'op-1', {
    now: '2026-07-12T12:00:03.000Z',
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    maxAttempts: 3,
  });
  assert.equal(failed.terminal, 1);
  assert.equal(failed.queue[0].status, 'failed');
  assert.equal(failed.queue[0].next_attempt_at, null);
});

test('ack elimina por operation_id de forma idempotente', () => {
  const queue = add(add([], 'op-1'), 'op-2');
  const first = ack(queue, ['op-1', 'op-missing']);
  assert.equal(first.removed, 1);
  assert.deepEqual(first.queue.map((item) => item.operation_id), ['op-2']);

  const second = ack(first.queue, 'op-1');
  assert.equal(second.removed, 0);
  assert.equal(second.queue.length, 1);
});

test('un reintento manual reactiva solo operaciones terminales conservando su identidad', async () => {
  let queue = add([], 'op-failed');
  queue = claim(queue, { now: T0, leaseMs: 100, maxAttempts: 1 }).queue;
  queue = fail(queue, 'op-failed', { now: T0, maxAttempts: 1 }).queue;
  assert.equal(queue[0].status, 'failed');

  const retried = retryFailed(queue, ['op-failed', 'op-missing'], {
    now: '2026-07-12T13:00:00.000Z',
  });
  assert.equal(retried.retried, 1);
  assert.equal(retried.queue[0].operation_id, 'op-failed');
  assert.equal(retried.queue[0].occurred_at, T0);
  assert.equal(retried.queue[0].attempts, 0);
  assert.equal(retried.queue[0].status, 'pending');
  assert.equal(retried.queue[0].next_attempt_at, '2026-07-12T13:00:00.000Z');

  const storage = memoryStorage();
  const persisted = createPersistedCheckInQueue({
    storage,
    clock: () => '2026-07-12T13:00:00.000Z',
    maxAttempts: 1,
  });
  await persisted.enqueue(operation('persisted-failed'));
  await persisted.claim({ limit: 1 });
  await persisted.fail('persisted-failed');
  assert.equal((await persisted.retryFailed('persisted-failed')).retried, 1);
  const recovered = await persisted.list();
  assert.equal(recovered.items[0].operation_id, 'persisted-failed');
  assert.equal(recovered.items[0].status, 'pending');
});

test('adapter repara persistencia corrupta y conserva operaciones concurrentes', async () => {
  const key = '@test/hexis-queue';
  const storage = memoryStorage({ [key]: '{corrupto' });
  const queueA = createPersistedCheckInQueue({
    storage,
    storageKey: key,
    clock: () => T0,
  });
  const recovered = await queueA.list();
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.reason, 'invalid_json');
  assert.deepEqual(JSON.parse(storage.value(key)), { version: 1, items: [] });

  const queueB = createPersistedCheckInQueue({
    storage,
    storageKey: key,
    clock: () => T0,
  });
  await Promise.all([
    queueA.enqueue(operation('op-1')),
    queueB.enqueue(operation('op-2')),
  ]);

  const persisted = await queueA.list();
  assert.equal(persisted.items.length, 2);
  assert.deepEqual(
    persisted.items.map((item) => item.operation_id).sort(),
    ['op-1', 'op-2'],
  );
});

test('clearForUser elimina atomicamente solo la cola de la cuenta indicada', async () => {
  const key = '@test/hexis-multi-account-queue';
  const storage = memoryStorage();
  const queueA = createPersistedCheckInQueue({
    storage,
    storageKey: key,
    clock: () => T0,
  });
  const queueB = createPersistedCheckInQueue({
    storage,
    storageKey: key,
    clock: () => T0,
  });

  await queueA.enqueue(operation('user-1-operation'));
  await queueA.enqueue(operation('user-2-operation', { user_id: 'user-2' }));

  const [cleared] = await Promise.all([
    queueA.clearForUser('user-1'),
    queueB.enqueue(operation('user-2-concurrent', { user_id: 'user-2' })),
  ]);

  assert.equal(cleared.removed, 1);
  const persisted = await queueA.list();
  assert.deepEqual(
    persisted.items.map((item) => [item.operation_id, item.user_id]).sort(),
    [
      ['user-2-concurrent', 'user-2'],
      ['user-2-operation', 'user-2'],
    ],
  );
});

test('clearForUser rechaza identificadores vacios sin modificar la cola', async () => {
  const storage = memoryStorage();
  const queue = createPersistedCheckInQueue({ storage, clock: () => T0 });
  await queue.enqueue(operation('preserved-operation'));

  await assert.rejects(() => queue.clearForUser('  '), /userId es obligatorio/);
  assert.deepEqual(
    (await queue.list()).items.map((item) => item.operation_id),
    ['preserved-operation'],
  );
});
