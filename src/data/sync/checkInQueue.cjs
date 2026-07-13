'use strict';

const QUEUE_VERSION = 1;
const DEFAULT_MAX_ITEMS = 200;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_BACKOFF_BASE_MS = 5_000;
const DEFAULT_BACKOFF_MAX_MS = 15 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const MAX_SERIALIZED_LENGTH = 512_000;

const INTENTS = new Set(['record', 'retract']);
const COMPLETION_LEVELS = new Set(['minimum', 'full']);
const STATUSES = new Set(['pending', 'in_flight', 'failed']);
const ITEM_KEYS = Object.freeze([
  'operation_id',
  'user_id',
  'habit_id',
  'local_date',
  'timezone',
  'intent',
  'completion_level',
  'occurred_at',
  'attempts',
  'next_attempt_at',
  'status',
]);
const IMMUTABLE_KEYS = ITEM_KEYS.slice(0, 8);

class QueueCapacityError extends Error {
  constructor(maxItems) {
    super(`La cola offline alcanzo su limite de ${maxItems} operaciones.`);
    this.name = 'QueueCapacityError';
    this.code = 'queue_capacity_reached';
  }
}

class OperationConflictError extends Error {
  constructor(operationId) {
    super(`operation_id ${operationId} ya existe con otro contenido.`);
    this.name = 'OperationConflictError';
    this.code = 'operation_id_conflict';
  }
}

class UnsupportedQueueVersionError extends Error {
  constructor(version) {
    super(`La version ${version} de la cola no es compatible.`);
    this.name = 'UnsupportedQueueVersionError';
    this.code = 'unsupported_queue_version';
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} debe ser un objeto simple.`);
  }
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} debe ser un entero positivo.`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} debe ser un entero no negativo.`);
  }
  return value;
}

function requireOpaqueId(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new TypeError(`${label} debe ser un identificador opaco valido.`);
  }
  return value;
}

function requireLocalDate(value) {
  if (typeof value !== 'string') {
    throw new TypeError('local_date debe usar YYYY-MM-DD.');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new TypeError('local_date debe usar YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError('local_date no es una fecha civil valida.');
  }
  return value;
}

function requireTimezone(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError('timezone debe ser una zona IANA valida.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
  } catch {
    throw new TypeError('timezone debe ser una zona IANA valida.');
  }
  return value;
}

function normalizeTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    throw new TypeError(`${label} debe ser un timestamp ISO con zona.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`${label} debe ser un timestamp ISO valido.`);
  }
  return new Date(milliseconds).toISOString();
}

function timestampMilliseconds(value, label) {
  return Date.parse(normalizeTimestamp(value, label));
}

function exactKeys(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function normalizeOperation(operation, now) {
  requirePlainObject(operation, 'operation');
  const intent = operation.intent;
  if (!INTENTS.has(intent)) {
    throw new TypeError('intent debe ser record o retract.');
  }

  let completionLevel = null;
  if (intent === 'record') {
    if (!COMPLETION_LEVELS.has(operation.completion_level)) {
      throw new TypeError('completion_level debe ser minimum o full al registrar.');
    }
    completionLevel = operation.completion_level;
  } else if (operation.completion_level != null) {
    throw new TypeError('completion_level debe ser null al retractar.');
  }

  return {
    operation_id: requireOpaqueId(operation.operation_id, 'operation_id'),
    user_id: requireOpaqueId(operation.user_id, 'user_id'),
    habit_id: requireOpaqueId(operation.habit_id, 'habit_id'),
    local_date: requireLocalDate(operation.local_date),
    timezone: requireTimezone(operation.timezone),
    intent,
    completion_level: completionLevel,
    occurred_at: normalizeTimestamp(operation.occurred_at, 'occurred_at'),
    attempts: 0,
    next_attempt_at: normalizeTimestamp(now, 'now'),
    status: 'pending',
  };
}

function validateStoredItem(item) {
  requirePlainObject(item, 'item');
  if (!exactKeys(item, ITEM_KEYS)) {
    throw new TypeError('item contiene campos no permitidos o incompletos.');
  }

  const normalized = normalizeOperation(
    item,
    item.next_attempt_at ?? item.occurred_at,
  );
  const attempts = requireNonNegativeInteger(item.attempts, 'attempts');
  if (!STATUSES.has(item.status)) {
    throw new TypeError('status no pertenece al catalogo permitido.');
  }
  if (item.status === 'in_flight' && attempts === 0) {
    throw new TypeError('Una operacion in_flight debe tener al menos un intento.');
  }
  if (item.status === 'failed' && item.next_attempt_at !== null) {
    throw new TypeError('Una operacion failed no puede tener next_attempt_at.');
  }
  if (item.status !== 'failed' && item.next_attempt_at === null) {
    throw new TypeError('Una operacion activa requiere next_attempt_at.');
  }

  return {
    ...normalized,
    attempts,
    next_attempt_at:
      item.next_attempt_at === null
        ? null
        : normalizeTimestamp(item.next_attempt_at, 'next_attempt_at'),
    status: item.status,
  };
}

function validateQueue(queue, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  requirePositiveInteger(maxItems, 'maxItems');
  if (!Array.isArray(queue)) throw new TypeError('queue debe ser una lista.');
  if (queue.length > maxItems) throw new QueueCapacityError(maxItems);

  const operationIds = new Set();
  const normalized = queue.map((item) => {
    const candidate = validateStoredItem(item);
    if (operationIds.has(candidate.operation_id)) {
      throw new TypeError(`operation_id ${candidate.operation_id} esta duplicado.`);
    }
    operationIds.add(candidate.operation_id);
    return candidate;
  });
  return normalized;
}

function sameOperation(left, right) {
  return IMMUTABLE_KEYS.every((key) => left[key] === right[key]);
}

function enqueue(queue, operation, { maxItems = DEFAULT_MAX_ITEMS, now } = {}) {
  const current = validateQueue(queue, { maxItems });
  const candidate = normalizeOperation(operation, now);
  const existing = current.find(
    (item) => item.operation_id === candidate.operation_id,
  );

  if (existing) {
    if (!sameOperation(existing, candidate)) {
      throw new OperationConflictError(candidate.operation_id);
    }
    return { added: false, item: { ...existing }, queue: current };
  }
  if (current.length >= maxItems) throw new QueueCapacityError(maxItems);

  return {
    added: true,
    item: { ...candidate },
    queue: [...current, candidate],
  };
}

function eligibleForClaim(item, nowMilliseconds) {
  return (
    (item.status === 'pending' || item.status === 'in_flight') &&
    timestampMilliseconds(item.next_attempt_at, 'next_attempt_at') <= nowMilliseconds
  );
}

function compareClaimOrder(left, right) {
  const nextDifference =
    Date.parse(left.item.next_attempt_at) - Date.parse(right.item.next_attempt_at);
  if (nextDifference !== 0) return nextDifference;
  const occurredDifference =
    Date.parse(left.item.occurred_at) - Date.parse(right.item.occurred_at);
  if (occurredDifference !== 0) return occurredDifference;
  return left.item.operation_id.localeCompare(right.item.operation_id);
}

function claim(
  queue,
  {
    now,
    limit = 20,
    leaseMs = DEFAULT_LEASE_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    maxItems = DEFAULT_MAX_ITEMS,
    userId = null,
  } = {},
) {
  const current = validateQueue(queue, { maxItems });
  const nowIso = normalizeTimestamp(now, 'now');
  const nowMilliseconds = Date.parse(nowIso);
  requirePositiveInteger(limit, 'limit');
  requirePositiveInteger(leaseMs, 'leaseMs');
  requirePositiveInteger(maxAttempts, 'maxAttempts');
  const requestedUserId = userId == null ? null : requireOpaqueId(userId, 'user_id');

  const next = current.map((item) => ({ ...item }));
  const candidates = next
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => (
      eligibleForClaim(item, nowMilliseconds)
      && (requestedUserId == null || item.user_id === requestedUserId)
    ))
    .sort(compareClaimOrder);
  const claimed = [];

  for (const { index } of candidates) {
    const item = next[index];
    if (item.attempts >= maxAttempts) {
      next[index] = { ...item, next_attempt_at: null, status: 'failed' };
      continue;
    }
    if (claimed.length >= limit) continue;

    const updated = {
      ...item,
      attempts: item.attempts + 1,
      next_attempt_at: new Date(nowMilliseconds + leaseMs).toISOString(),
      status: 'in_flight',
    };
    next[index] = updated;
    claimed.push({ ...updated });
  }

  return { items: claimed, queue: next };
}

function normalizeOperationIds(operationIds) {
  const values = Array.isArray(operationIds) ? operationIds : [operationIds];
  const normalized = values.map((value) =>
    requireOpaqueId(value, 'operation_id'),
  );
  return new Set(normalized);
}

function ack(queue, operationIds, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const current = validateQueue(queue, { maxItems });
  const requested = normalizeOperationIds(operationIds);
  const next = current.filter((item) => !requested.has(item.operation_id));
  return { queue: next, removed: current.length - next.length };
}

function backoffDelayMs(
  attempts,
  {
    baseDelayMs = DEFAULT_BACKOFF_BASE_MS,
    maxDelayMs = DEFAULT_BACKOFF_MAX_MS,
  } = {},
) {
  requirePositiveInteger(attempts, 'attempts');
  requirePositiveInteger(baseDelayMs, 'baseDelayMs');
  requirePositiveInteger(maxDelayMs, 'maxDelayMs');
  if (maxDelayMs < baseDelayMs) {
    throw new TypeError('maxDelayMs no puede ser menor que baseDelayMs.');
  }
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempts - 1, 30));
}

function fail(
  queue,
  operationIds,
  {
    now,
    baseDelayMs = DEFAULT_BACKOFF_BASE_MS,
    maxDelayMs = DEFAULT_BACKOFF_MAX_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    maxItems = DEFAULT_MAX_ITEMS,
  } = {},
) {
  const current = validateQueue(queue, { maxItems });
  const requested = normalizeOperationIds(operationIds);
  const nowMilliseconds = timestampMilliseconds(now, 'now');
  requirePositiveInteger(maxAttempts, 'maxAttempts');
  let rescheduled = 0;
  let terminal = 0;

  const next = current.map((item) => {
    if (!requested.has(item.operation_id) || item.status !== 'in_flight') {
      return item;
    }
    if (item.attempts >= maxAttempts) {
      terminal += 1;
      return { ...item, next_attempt_at: null, status: 'failed' };
    }

    rescheduled += 1;
    const delay = backoffDelayMs(item.attempts, {
      baseDelayMs,
      maxDelayMs,
    });
    return {
      ...item,
      next_attempt_at: new Date(nowMilliseconds + delay).toISOString(),
      status: 'pending',
    };
  });

  return { queue: next, rescheduled, terminal };
}

function retryFailed(
  queue,
  operationIds,
  { now, maxItems = DEFAULT_MAX_ITEMS } = {},
) {
  const current = validateQueue(queue, { maxItems });
  const requested = normalizeOperationIds(operationIds);
  const nowIso = normalizeTimestamp(now, 'now');
  let retried = 0;

  const next = current.map((item) => {
    if (!requested.has(item.operation_id) || item.status !== 'failed') return item;
    retried += 1;
    return {
      ...item,
      attempts: 0,
      next_attempt_at: nowIso,
      status: 'pending',
    };
  });

  return { queue: next, retried };
}

function serializeQueue(queue, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const items = validateQueue(queue, { maxItems });
  return JSON.stringify({ version: QUEUE_VERSION, items });
}

function recoveredQueue(reason) {
  return { queue: [], reason, recovered: true };
}

function deserializeQueue(raw, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  requirePositiveInteger(maxItems, 'maxItems');
  if (raw == null) return { queue: [], reason: null, recovered: false };
  if (typeof raw !== 'string' || raw.length > MAX_SERIALIZED_LENGTH) {
    return recoveredQueue('invalid_payload');
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    return recoveredQueue('invalid_json');
  }

  if (!isPlainObject(document) || !exactKeys(document, ['version', 'items'])) {
    return recoveredQueue('invalid_document');
  }
  if (Number.isInteger(document.version) && document.version > QUEUE_VERSION) {
    throw new UnsupportedQueueVersionError(document.version);
  }
  if (document.version !== QUEUE_VERSION) {
    return recoveredQueue('invalid_version');
  }

  try {
    return {
      queue: validateQueue(document.items, { maxItems }),
      reason: null,
      recovered: false,
    };
  } catch (error) {
    if (error instanceof QueueCapacityError) throw error;
    return recoveredQueue('invalid_items');
  }
}

module.exports = {
  COMPLETION_LEVELS,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_ITEMS,
  INTENTS,
  ITEM_KEYS,
  OperationConflictError,
  QUEUE_VERSION,
  QueueCapacityError,
  STATUSES,
  UnsupportedQueueVersionError,
  ack,
  backoffDelayMs,
  claim,
  deserializeQueue,
  enqueue,
  fail,
  retryFailed,
  serializeQueue,
  validateQueue,
};
