'use strict';

const {
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_ITEMS,
  ack,
  claim,
  deserializeQueue,
  enqueue,
  fail,
  retryFailed,
  serializeQueue,
} = require('./checkInQueue.cjs');

const DEFAULT_STORAGE_KEY = '@hexis/check-in-queue/v1';
const storageLocks = new WeakMap();

function validateStorage(storage) {
  if (
    !storage ||
    (typeof storage !== 'object' && typeof storage !== 'function') ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new TypeError('storage debe implementar getItem y setItem.');
  }
}

function runExclusive(storage, storageKey, task) {
  let locks = storageLocks.get(storage);
  if (!locks) {
    locks = new Map();
    storageLocks.set(storage, locks);
  }

  const previous = locks.get(storageKey) ?? Promise.resolve();
  const result = previous.then(task, task);
  const settled = result.catch(() => undefined);
  locks.set(storageKey, settled);
  settled.finally(() => {
    if (locks.get(storageKey) === settled) locks.delete(storageKey);
  });
  return result;
}

function createPersistedCheckInQueue({
  storage,
  storageKey = DEFAULT_STORAGE_KEY,
  clock = () => new Date().toISOString(),
  maxItems = DEFAULT_MAX_ITEMS,
  leaseMs = DEFAULT_LEASE_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BACKOFF_BASE_MS,
  maxDelayMs = DEFAULT_BACKOFF_MAX_MS,
} = {}) {
  validateStorage(storage);
  if (typeof storageKey !== 'string' || storageKey.length === 0) {
    throw new TypeError('storageKey es obligatorio.');
  }
  if (typeof clock !== 'function') throw new TypeError('clock debe ser una funcion.');

  async function load() {
    const raw = await storage.getItem(storageKey);
    const decoded = deserializeQueue(raw, { maxItems });
    if (decoded.recovered) {
      await storage.setItem(
        storageKey,
        serializeQueue(decoded.queue, { maxItems }),
      );
    }
    return decoded;
  }

  async function save(queue) {
    await storage.setItem(storageKey, serializeQueue(queue, { maxItems }));
  }

  function execute(task) {
    return runExclusive(storage, storageKey, async () => {
      const loaded = await load();
      return task(loaded);
    });
  }

  return Object.freeze({
    async list() {
      return execute(async ({ queue, recovered, reason }) => ({
        items: queue.map((item) => ({ ...item })),
        reason,
        recovered,
      }));
    },

    async enqueue(operation) {
      return execute(async ({ queue, recovered, reason }) => {
        const result = enqueue(queue, operation, {
          maxItems,
          now: clock(),
        });
        await save(result.queue);
        return {
          added: result.added,
          item: { ...result.item },
          reason,
          recovered,
          size: result.queue.length,
        };
      });
    },

    async claim({ limit = 20, userId = null } = {}) {
      return execute(async ({ queue, recovered, reason }) => {
        const result = claim(queue, {
          leaseMs,
          limit,
          maxAttempts,
          maxItems,
          now: clock(),
          userId,
        });
        await save(result.queue);
        return {
          items: result.items.map((item) => ({ ...item })),
          reason,
          recovered,
          size: result.queue.length,
        };
      });
    },

    async ack(operationIds) {
      return execute(async ({ queue, recovered, reason }) => {
        const result = ack(queue, operationIds, { maxItems });
        await save(result.queue);
        return {
          reason,
          recovered,
          removed: result.removed,
          size: result.queue.length,
        };
      });
    },

    async fail(operationIds) {
      return execute(async ({ queue, recovered, reason }) => {
        const result = fail(queue, operationIds, {
          baseDelayMs,
          maxAttempts,
          maxDelayMs,
          maxItems,
          now: clock(),
        });
        await save(result.queue);
        return {
          reason,
          recovered,
          rescheduled: result.rescheduled,
          size: result.queue.length,
          terminal: result.terminal,
        };
      });
    },

    async retryFailed(operationIds) {
      return execute(async ({ queue, recovered, reason }) => {
        const result = retryFailed(queue, operationIds, {
          maxItems,
          now: clock(),
        });
        await save(result.queue);
        return {
          reason,
          recovered,
          retried: result.retried,
          size: result.queue.length,
        };
      });
    },

    async clear() {
      return runExclusive(storage, storageKey, async () => {
        await save([]);
        return { size: 0 };
      });
    },

    async clearForUser(userId) {
      if (typeof userId !== 'string' || userId.trim().length === 0) {
        throw new TypeError('userId es obligatorio.');
      }

      return execute(async ({ queue, recovered, reason }) => {
        const remaining = queue.filter((item) => item.user_id !== userId);
        await save(remaining);
        return {
          reason,
          recovered,
          removed: queue.length - remaining.length,
          size: remaining.length,
        };
      });
    },
  });
}

module.exports = {
  DEFAULT_STORAGE_KEY,
  createPersistedCheckInQueue,
};
