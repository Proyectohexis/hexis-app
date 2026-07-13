'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createFlushPendingCheckIns,
} = require('../src/data/sync/flushCheckInQueue.js');

function operation(overrides = {}) {
  return {
    operation_id: 'operation-1',
    user_id: 'user-1',
    habit_id: 'habit-1',
    local_date: '2026-07-12',
    timezone: 'America/Panama',
    intent: 'record',
    completion_level: 'minimum',
    occurred_at: '2026-07-12T13:45:00.000Z',
    ...overrides,
  };
}

function queueDouble(items = []) {
  const calls = { claim: [], ack: [], fail: [] };
  return {
    calls,
    queue: {
      async claim(options) {
        calls.claim.push(options);
        return { items };
      },
      async ack(operationIds) {
        calls.ack.push(operationIds);
        return { removed: operationIds.length };
      },
      async fail(operationIds) {
        calls.fail.push(operationIds);
        return { rescheduled: operationIds.length };
      },
    },
  };
}

function successfulResult(operationId = 'operation-1') {
  return {
    data: { event: { id: 'event-1', client_operation_id: operationId } },
    error: null,
  };
}

test('registra una evidencia offline con el operation_id original y confirma la cola', async () => {
  const item = operation();
  const { queue, calls } = queueDouble([item]);
  const recordCalls = [];
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async (input) => {
      recordCalls.push(input);
      return successfulResult(input.clientOperationId);
    },
    retractCompletion: async () => assert.fail('no debe retractar'),
  });

  const result = await flush({ userId: 'user-1', limit: 7 });

  assert.deepEqual(recordCalls, [{
    habitId: 'habit-1',
    localDate: '2026-07-12',
    timeZone: 'America/Panama',
    completionLevel: 'minimum',
    source: 'offline_sync',
    occurredAt: '2026-07-12T13:45:00.000Z',
    clientOperationId: 'operation-1',
  }]);
  assert.deepEqual(calls.claim, [{ limit: 7, userId: 'user-1' }]);
  assert.deepEqual(calls.ack, [['operation-1']]);
  assert.deepEqual(calls.fail, []);
  assert.deepEqual(result, {
    acknowledged: 1,
    deferred: 0,
    failed: 0,
    claimed: 1,
  });
});

test('retracta con la misma identidad idempotente y sin nivel de completitud', async () => {
  const item = operation({
    operation_id: 'operation-retract-1',
    intent: 'retract',
    completion_level: null,
  });
  const { queue, calls } = queueDouble([item]);
  const retractCalls = [];
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async () => assert.fail('no debe registrar'),
    retractCompletion: async (input) => {
      retractCalls.push(input);
      return successfulResult(input.clientOperationId);
    },
  });

  const result = await flush({ userId: 'user-1' });

  assert.deepEqual(retractCalls, [{
    habitId: 'habit-1',
    localDate: '2026-07-12',
    timeZone: 'America/Panama',
    source: 'offline_sync',
    occurredAt: '2026-07-12T13:45:00.000Z',
    clientOperationId: 'operation-retract-1',
  }]);
  assert.deepEqual(calls.ack, [['operation-retract-1']]);
  assert.deepEqual(calls.fail, []);
  assert.equal(result.acknowledged, 1);
});

test('un error esperado del repositorio programa reintento y nunca hace ack', async () => {
  const { queue, calls } = queueDouble([operation()]);
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async () => ({
      data: null,
      error: Object.assign(new Error('sin red'), { code: 'network_error' }),
    }),
    retractCompletion: async () => successfulResult(),
  });

  const result = await flush({ userId: 'user-1' });

  assert.deepEqual(calls.ack, []);
  assert.deepEqual(calls.fail, [['operation-1']]);
  assert.deepEqual(result, {
    acknowledged: 0,
    deferred: 0,
    failed: 1,
    claimed: 1,
  });
});

test('una excepción inesperada bloquea solo ese hábito y permite sincronizar otros', async () => {
  const items = [
    operation({ operation_id: 'operation-a1', habit_id: 'habit-a' }),
    operation({ operation_id: 'operation-a2', habit_id: 'habit-a' }),
    operation({ operation_id: 'operation-b1', habit_id: 'habit-b' }),
  ];
  const { queue, calls } = queueDouble(items);
  const attempted = [];
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async (input) => {
      attempted.push(input.clientOperationId);
      if (input.habitId === 'habit-a') throw new TypeError('respuesta inesperada');
      return successfulResult(input.clientOperationId);
    },
    retractCompletion: async () => successfulResult(),
  });

  const result = await flush({ userId: 'user-1' });

  assert.deepEqual(attempted, ['operation-a1', 'operation-b1']);
  assert.deepEqual(calls.ack, [['operation-b1']]);
  assert.deepEqual(calls.fail, [['operation-a1', 'operation-a2']]);
  assert.deepEqual(result, {
    acknowledged: 1,
    deferred: 0,
    failed: 2,
    claimed: 3,
  });
});

test('una respuesta incompleta se conserva para reintento', async () => {
  const { queue, calls } = queueDouble([operation()]);
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async () => ({ data: {}, error: null }),
    retractCompletion: async () => successfulResult(),
  });

  await flush({ userId: 'user-1' });

  assert.deepEqual(calls.ack, []);
  assert.deepEqual(calls.fail, [['operation-1']]);
});

test('difiere operaciones de otro usuario sin enviarlas ni borrarlas', async () => {
  const items = [
    operation({ operation_id: 'foreign-operation', user_id: 'user-2' }),
    operation({ operation_id: 'own-operation' }),
  ];
  const { queue, calls } = queueDouble(items);
  const sent = [];
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async (input) => {
      sent.push(input.clientOperationId);
      return successfulResult(input.clientOperationId);
    },
    retractCompletion: async () => successfulResult(),
  });

  const result = await flush({ userId: 'user-1' });

  assert.deepEqual(sent, ['own-operation']);
  assert.deepEqual(calls.ack, [['own-operation']]);
  assert.deepEqual(calls.fail, [['foreign-operation']]);
  assert.deepEqual(result, {
    acknowledged: 1,
    deferred: 1,
    failed: 0,
    claimed: 2,
  });
});

test('un reintento reutiliza exactamente el operation_id en vez de generar otro', async () => {
  const item = operation({ operation_id: 'stable-operation-id' });
  const { queue, calls } = queueDouble([item]);
  const operationIds = [];
  let attempt = 0;
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async (input) => {
      operationIds.push(input.clientOperationId);
      attempt += 1;
      return attempt === 1
        ? { data: null, error: new Error('temporal') }
        : successfulResult(input.clientOperationId);
    },
    retractCompletion: async () => successfulResult(),
  });

  const first = await flush({ userId: 'user-1' });
  const second = await flush({ userId: 'user-1' });

  assert.deepEqual(operationIds, ['stable-operation-id', 'stable-operation-id']);
  assert.deepEqual(calls.fail, [['stable-operation-id']]);
  assert.deepEqual(calls.ack, [['stable-operation-id']]);
  assert.equal(first.failed, 1);
  assert.equal(second.acknowledged, 1);
});

test('no escribe en la cola cuando claim no devuelve trabajo', async () => {
  const { queue, calls } = queueDouble([]);
  const flush = createFlushPendingCheckIns({
    queue,
    recordCompletion: async () => successfulResult(),
    retractCompletion: async () => successfulResult(),
  });

  const result = await flush({ userId: 'user-1' });

  assert.deepEqual(calls.ack, []);
  assert.deepEqual(calls.fail, []);
  assert.deepEqual(result, {
    acknowledged: 0,
    deferred: 0,
    failed: 0,
    claimed: 0,
  });
});

test('rechaza dependencias incompletas al construir el flusher', () => {
  assert.throws(
    () => createFlushPendingCheckIns({}),
    /queue debe ser un objeto/,
  );
  assert.throws(
    () => createFlushPendingCheckIns({
      queue: { claim() {}, ack() {}, fail() {} },
      recordCompletion: null,
      retractCompletion() {},
    }),
    /recordCompletion debe ser una función/,
  );
});
