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
const RECOVERY_NOTICE_VERSION = 3;
const RECOVERY_NOTICE_SUFFIX = '/recovery-notice/v1';
const MAX_RECOVERY_ACKNOWLEDGEMENTS = 32;
const RECOVERY_DIAGNOSTIC_CODES = Object.freeze({
  invalid_document: 'SYNC-Q03',
  invalid_items: 'SYNC-Q05',
  invalid_json: 'SYNC-Q02',
  invalid_payload: 'SYNC-Q01',
  invalid_version: 'SYNC-Q04',
  recovery_notice_unreadable: 'SYNC-Q06',
});
const storageLocks = new WeakMap();
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

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

function recoveryStorageKeyFor(storageKey) {
  return `${storageKey}${RECOVERY_NOTICE_SUFFIX}`;
}

function normalizedDetectedAt(value) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError('clock debe devolver un timestamp ISO valido.');
  }
  return new Date(milliseconds).toISOString();
}

function normalizeRecoveryUserId(value) {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new TypeError('userId debe ser un identificador opaco valido.');
  }
  return value;
}

function emptyRecoveryState(generation = 0) {
  return {
    version: RECOVERY_NOTICE_VERSION,
    generation,
    reason: null,
    detected_at: null,
    acknowledgements: [],
  };
}

function persistedRecoveryNotice(reason, detectedAt, generation) {
  if (!hasOwn(RECOVERY_DIAGNOSTIC_CODES, reason)) {
    throw new TypeError('reason de recuperacion no soportado.');
  }
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new TypeError('generation de recuperacion no soportada.');
  }
  return {
    version: RECOVERY_NOTICE_VERSION,
    generation,
    reason,
    detected_at: normalizedDetectedAt(detectedAt),
    acknowledgements: [],
  };
}

function publicRecoveryNoticeForUser(state, userId) {
  if (!state?.reason) return null;
  const requestedUserId = normalizeRecoveryUserId(userId);
  if (state.acknowledgements.some((entry) => (
    entry.user_id === requestedUserId
    && entry.generation === state.generation
  ))) {
    return null;
  }
  return {
    generation: state.generation,
    reason: state.reason,
    detected_at: state.detected_at,
    diagnostic_code: RECOVERY_DIAGNOSTIC_CODES[state.reason],
  };
}

function serializeRecoveryState(state) {
  if (!state?.reason) {
    throw new TypeError('No se puede persistir un estado de recuperacion vacio.');
  }
  return JSON.stringify({
    version: RECOVERY_NOTICE_VERSION,
    generation: state.generation,
    reason: state.reason,
    detected_at: state.detected_at,
    acknowledgements: state.acknowledgements.map((entry) => ({
      user_id: entry.user_id,
      generation: entry.generation,
    })),
  });
}

function normalizeAcknowledgements(value, generation) {
  if (!Array.isArray(value) || value.length > MAX_RECOVERY_ACKNOWLEDGEMENTS) {
    return null;
  }
  const seen = new Set();
  const normalized = [];
  try {
    for (const entry of value) {
      if (
        !entry
        || typeof entry !== 'object'
        || Array.isArray(entry)
        || Object.keys(entry).sort().join(',') !== 'generation,user_id'
        || entry.generation !== generation
      ) {
        return null;
      }
      const userId = normalizeRecoveryUserId(entry.user_id);
      if (seen.has(userId)) return null;
      seen.add(userId);
      normalized.push({ user_id: userId, generation });
    }
  } catch {
    return null;
  }
  return normalized;
}

function activeRecoveryState({ generation, reason, detectedAt, acknowledgements = [] }) {
  if (!Number.isSafeInteger(generation) || generation <= 0) return null;
  if (!hasOwn(RECOVERY_DIAGNOSTIC_CODES, reason)) return null;
  const normalizedAcknowledgements = normalizeAcknowledgements(
    acknowledgements,
    generation,
  );
  if (!normalizedAcknowledgements) return null;
  try {
    return {
      version: RECOVERY_NOTICE_VERSION,
      generation,
      reason,
      detected_at: normalizedDetectedAt(detectedAt),
      acknowledgements: normalizedAcknowledgements,
    };
  } catch {
    return null;
  }
}

function nextRecoveryGeneration(generation) {
  if (!Number.isSafeInteger(generation) || generation < 0) return 1;
  return generation >= Number.MAX_SAFE_INTEGER ? 1 : generation + 1;
}

function recoveryGenerationHint(value) {
  return Number.isSafeInteger(value?.generation) && value.generation >= 0
    ? value.generation
    : 0;
}

function parseRecoveryState(raw) {
  if (raw == null) {
    return { action: 'none', state: emptyRecoveryState() };
  }
  if (raw === 'null' || typeof raw !== 'string' || raw.length > 8_192) {
    return { action: 'synthetic', state: emptyRecoveryState() };
  }

  let notice;
  try {
    notice = JSON.parse(raw);
  } catch {
    return { action: 'synthetic', state: emptyRecoveryState() };
  }

  const generationHint = recoveryGenerationHint(notice);
  const keys = notice && typeof notice === 'object' && !Array.isArray(notice)
    ? Object.keys(notice).sort().join(',')
    : '';

  // Version 1: a global active notice without a generation.
  if (
    keys === 'detected_at,reason,version'
    && notice.version === 1
  ) {
    const migrated = activeRecoveryState({
      generation: 1,
      reason: notice.reason,
      detectedAt: notice.detected_at,
    });
    return migrated
      ? { action: 'migrate', state: migrated }
      : { action: 'synthetic', state: emptyRecoveryState() };
  }

  // Version 2: an active/inactive global acknowledgement. An inactive marker
  // cannot prove which account saw it, so it becomes a new fail-safe notice.
  if (
    keys === 'active,detected_at,generation,reason,version'
    && notice.version === 2
  ) {
    if (notice.active === false && notice.reason === null && notice.detected_at === null) {
      return {
        action: 'synthetic',
        state: emptyRecoveryState(generationHint),
      };
    }
    const migrated = notice.active === true
      ? activeRecoveryState({
          generation: generationHint,
          reason: notice.reason,
          detectedAt: notice.detected_at,
        })
      : null;
    return migrated
      ? { action: 'migrate', state: migrated }
      : { action: 'synthetic', state: emptyRecoveryState(generationHint) };
  }

  if (
    keys === 'acknowledgements,detected_at,generation,reason,version'
    && notice.version === RECOVERY_NOTICE_VERSION
  ) {
    const current = activeRecoveryState({
      generation: generationHint,
      reason: notice.reason,
      detectedAt: notice.detected_at,
      acknowledgements: notice.acknowledgements,
    });
    if (current) return { action: 'none', state: current };
  }

  return {
    action: 'synthetic',
    state: emptyRecoveryState(generationHint),
  };
}

function recoveryStateWithAcknowledgement(state, userId) {
  const requestedUserId = normalizeRecoveryUserId(userId);
  const withoutCurrentUser = state.acknowledgements.filter(
    (entry) => entry.user_id !== requestedUserId,
  );
  const acknowledgements = [
    ...withoutCurrentUser,
    { user_id: requestedUserId, generation: state.generation },
  ].slice(-MAX_RECOVERY_ACKNOWLEDGEMENTS);
  return {
    ...state,
    acknowledgements,
  };
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
  const recoveryStorageKey = recoveryStorageKeyFor(storageKey);

  async function load() {
    const raw = await storage.getItem(storageKey);
    const decoded = deserializeQueue(raw, { maxItems });
    const parsedRecovery = parseRecoveryState(
      await storage.getItem(recoveryStorageKey),
    );
    let recoveryState = parsedRecovery.state;
    if (decoded.recovered) {
      // Persist the minimal diagnostic before replacing the unreadable queue.
      // Raw queue content is intentionally never copied into the notice.
      recoveryState = persistedRecoveryNotice(
        decoded.reason,
        clock(),
        nextRecoveryGeneration(recoveryState.generation),
      );
      await storage.setItem(
        recoveryStorageKey,
        serializeRecoveryState(recoveryState),
      );
      await storage.setItem(
        storageKey,
        serializeQueue(decoded.queue, { maxItems }),
      );
    } else if (parsedRecovery.action === 'synthetic') {
      recoveryState = persistedRecoveryNotice(
        'recovery_notice_unreadable',
        clock(),
        nextRecoveryGeneration(recoveryState.generation),
      );
      await storage.setItem(
        recoveryStorageKey,
        serializeRecoveryState(recoveryState),
      );
    } else if (parsedRecovery.action === 'migrate') {
      await storage.setItem(
        recoveryStorageKey,
        serializeRecoveryState(recoveryState),
      );
    }
    return {
      ...decoded,
      recoveryState,
    };
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
    async list({ userId } = {}) {
      const requestedUserId = normalizeRecoveryUserId(userId);
      return execute(async ({ queue, recovered, reason, recoveryState }) => ({
        items: queue
          .filter((item) => item.user_id === requestedUserId)
          .map((item) => ({ ...item })),
        reason,
        recovered,
        recoveryNotice: publicRecoveryNoticeForUser(
          recoveryState,
          requestedUserId,
        ),
      }));
    },

    async enqueue(operation) {
      return execute(async ({ queue, recovered, reason, recoveryState }) => {
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
          recoveryNotice: publicRecoveryNoticeForUser(
            recoveryState,
            result.item.user_id,
          ),
          size: result.queue.filter(
            (item) => item.user_id === result.item.user_id,
          ).length,
        };
      });
    },

    async claim({ limit = 20, userId = null } = {}) {
      const requestedUserId = userId == null
        ? null
        : normalizeRecoveryUserId(userId);
      return execute(async ({ queue, recovered, reason, recoveryState }) => {
        const result = claim(queue, {
          leaseMs,
          limit,
          maxAttempts,
          maxItems,
          now: clock(),
          userId: requestedUserId,
        });
        await save(result.queue);
        return {
          items: result.items.map((item) => ({ ...item })),
          reason,
          recovered,
          recoveryNotice: requestedUserId == null
            ? null
            : publicRecoveryNoticeForUser(recoveryState, requestedUserId),
          size: requestedUserId == null
            ? result.queue.length
            : result.queue.filter(
                (item) => item.user_id === requestedUserId,
              ).length,
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

    async acknowledgeRecoveryNotice({ userId, generation, detectedAt } = {}) {
      const requestedUserId = normalizeRecoveryUserId(userId);
      if (!Number.isSafeInteger(generation) || generation <= 0) {
        throw new TypeError('generation debe ser un entero positivo.');
      }
      const expectedDetectedAt = normalizedDetectedAt(detectedAt);
      return runExclusive(storage, storageKey, async () => {
        const { recoveryState: state } = await load();
        const currentNotice = publicRecoveryNoticeForUser(
          state,
          requestedUserId,
        );
        if (!currentNotice) {
          return {
            acknowledged: false,
            reason: 'no_active_notice',
            recoveryNotice: null,
          };
        }
        if (
          state.generation !== generation
          || state.detected_at !== expectedDetectedAt
        ) {
          return {
            acknowledged: false,
            reason: 'notice_changed',
            recoveryNotice: currentNotice,
          };
        }
        const acknowledgedState = recoveryStateWithAcknowledgement(
          state,
          requestedUserId,
        );
        await storage.setItem(
          recoveryStorageKey,
          serializeRecoveryState(acknowledgedState),
        );
        return {
          acknowledged: true,
          reason: null,
          recoveryNotice: null,
        };
      });
    },

    async clearForUser(userId) {
      if (typeof userId !== 'string' || userId.trim().length === 0) {
        throw new TypeError('userId es obligatorio.');
      }
      const requestedUserId = normalizeRecoveryUserId(userId);

      return execute(async ({ queue, recovered, reason, recoveryState }) => {
        const remaining = queue.filter(
          (item) => item.user_id !== requestedUserId,
        );
        await save(remaining);
        const acknowledgements = recoveryState.acknowledgements.filter(
          (entry) => entry.user_id !== requestedUserId,
        );
        if (acknowledgements.length !== recoveryState.acknowledgements.length) {
          await storage.setItem(
            recoveryStorageKey,
            serializeRecoveryState({ ...recoveryState, acknowledgements }),
          );
        }
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
  RECOVERY_DIAGNOSTIC_CODES,
  createPersistedCheckInQueue,
  recoveryStorageKeyFor,
};
