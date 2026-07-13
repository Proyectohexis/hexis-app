'use strict';

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`${label} debe ser una función.`);
  }
  return value;
}

function requireQueue(queue) {
  if (!queue || typeof queue !== 'object') {
    throw new TypeError('queue debe ser un objeto.');
  }
  requireFunction(queue.claim, 'queue.claim');
  requireFunction(queue.ack, 'queue.ack');
  requireFunction(queue.fail, 'queue.fail');
  return queue;
}

function createFlushPendingCheckIns({
  queue,
  recordCompletion,
  retractCompletion,
} = {}) {
  const checkInQueue = requireQueue(queue);
  const record = requireFunction(recordCompletion, 'recordCompletion');
  const retract = requireFunction(retractCompletion, 'retractCompletion');

  return async function flushPendingCheckIns({ userId, limit = 20 } = {}) {
    const claimed = await checkInQueue.claim({ limit, userId });
    const acknowledged = [];
    const failed = [];
    const deferred = [];
    const blockedHabits = new Set();

    for (const item of claimed.items) {
      if (item.user_id !== userId) {
        deferred.push(item.operation_id);
        continue;
      }
      if (blockedHabits.has(item.habit_id)) {
        failed.push(item.operation_id);
        continue;
      }

      try {
        const result = item.intent === 'record'
          ? await record({
              habitId: item.habit_id,
              localDate: item.local_date,
              timeZone: item.timezone,
              completionLevel: item.completion_level,
              source: 'offline_sync',
              occurredAt: item.occurred_at,
              clientOperationId: item.operation_id,
            })
          : await retract({
              habitId: item.habit_id,
              localDate: item.local_date,
              timeZone: item.timezone,
              source: 'offline_sync',
              occurredAt: item.occurred_at,
              clientOperationId: item.operation_id,
            });

        if (result.error || !result.data?.event) {
          throw result.error || new Error('Respuesta de sincronización incompleta.');
        }
        acknowledged.push(item.operation_id);
      } catch {
        blockedHabits.add(item.habit_id);
        failed.push(item.operation_id);
      }
    }

    if (acknowledged.length) await checkInQueue.ack(acknowledged);
    if (failed.length || deferred.length) await checkInQueue.fail([...failed, ...deferred]);

    return {
      acknowledged: acknowledged.length,
      deferred: deferred.length,
      failed: failed.length,
      claimed: claimed.items.length,
    };
  };
}

let defaultFlusher;

function flushPendingCheckIns(options) {
  if (!defaultFlusher) {
    const { asyncStorageCheckInQueue } = require('./asyncStorageCheckInQueue');
    const {
      recordHabitCompletion,
      retractHabitCompletion,
    } = require('../repositories/practiceRepository');

    defaultFlusher = createFlushPendingCheckIns({
      queue: asyncStorageCheckInQueue,
      recordCompletion: recordHabitCompletion,
      retractCompletion: retractHabitCompletion,
    });
  }
  return defaultFlusher(options);
}

module.exports = {
  createFlushPendingCheckIns,
  flushPendingCheckIns,
};
