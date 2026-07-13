'use strict';

const { parseDateKey } = require('./dateKeys.cjs');

const EVENT_TYPES = new Set(['recorded', 'retracted']);
const COMPLETION_LEVELS = new Set(['minimum', 'full']);
const EVENT_SOURCES = new Set(['manual', 'offline_sync', 'integration']);

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} es obligatorio.`);
  }
}

function timestampValue(value, label) {
  requireText(value, label);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${label} debe ser un timestamp ISO valido.`);
  }
  return timestamp;
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('Cada evento debe ser un objeto.');
  }
  requireText(event.id, 'event.id');
  requireText(event.habit_id, 'event.habit_id');
  parseDateKey(event.local_date, 'event.local_date');
  timestampValue(event.created_at, 'event.created_at');

  if (!EVENT_TYPES.has(event.event_type)) {
    throw new TypeError('event.event_type debe ser recorded o retracted.');
  }
  if (event.event_type === 'recorded' && !COMPLETION_LEVELS.has(event.completion_level)) {
    throw new TypeError('event.completion_level debe ser minimum o full.');
  }
  if (event.source != null && !EVENT_SOURCES.has(event.source)) {
    throw new TypeError('event.source no pertenece al catalogo permitido.');
  }
  if (event.supersedes_event_id != null) {
    requireText(event.supersedes_event_id, 'event.supersedes_event_id');
  }
  return event;
}

function compareEvents(left, right) {
  const timeDifference =
    timestampValue(left.created_at, 'event.created_at') -
    timestampValue(right.created_at, 'event.created_at');
  if (timeDifference !== 0) return timeDifference;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function validateEventCollection(events) {
  if (!Array.isArray(events)) {
    throw new TypeError('events debe ser una lista.');
  }

  const ids = new Set();
  const operations = new Set();
  for (const event of events) {
    validateEvent(event);
    if (ids.has(event.id)) {
      throw new TypeError(`El evento ${event.id} esta duplicado.`);
    }
    ids.add(event.id);

    if (event.client_operation_id) {
      requireText(event.client_operation_id, 'event.client_operation_id');
      if (operations.has(event.client_operation_id)) {
        throw new TypeError(
          `La operacion ${event.client_operation_id} aparece mas de una vez.`,
        );
      }
      operations.add(event.client_operation_id);
    }
  }
}

function groupKey(habitId, localDate) {
  return `${habitId}\u0000${localDate}`;
}

function splitGroupKey(key) {
  const separator = key.indexOf('\u0000');
  return {
    habit_id: key.slice(0, separator),
    local_date: key.slice(separator + 1),
  };
}

function latestEvent(events) {
  return events.length === 0 ? null : events[events.length - 1];
}

function reduceGroup(events, allEventsById) {
  const ordered = [...events].sort(compareEvents);
  const anomalies = [];
  const targetedRecordIds = new Set();
  let lastBlanketRetraction = null;

  for (const event of ordered) {
    if (event.event_type !== 'retracted') continue;

    if (!event.supersedes_event_id) {
      lastBlanketRetraction = event;
      continue;
    }

    const target = allEventsById.get(event.supersedes_event_id);
    if (!target) {
      anomalies.push({
        code: 'target_not_found',
        event_id: event.id,
        target_event_id: event.supersedes_event_id,
      });
      continue;
    }
    if (target.event_type !== 'recorded') {
      anomalies.push({
        code: 'target_not_recorded',
        event_id: event.id,
        target_event_id: target.id,
      });
      continue;
    }
    if (
      target.habit_id !== event.habit_id ||
      target.local_date !== event.local_date
    ) {
      anomalies.push({
        code: 'target_group_mismatch',
        event_id: event.id,
        target_event_id: target.id,
      });
      continue;
    }
    targetedRecordIds.add(target.id);
  }

  const activeRecords = ordered.filter((event) => {
    if (event.event_type !== 'recorded' || targetedRecordIds.has(event.id)) {
      return false;
    }
    return !lastBlanketRetraction || compareEvents(event, lastBlanketRetraction) > 0;
  });
  const source = latestEvent(activeRecords);
  const last = latestEvent(ordered);

  return {
    active_record_ids: activeRecords.map((event) => event.id),
    anomalies,
    completed: activeRecords.length > 0,
    completion_level: source ? source.completion_level ?? 'full' : null,
    event_count: ordered.length,
    last_event_id: last ? last.id : null,
    source_event_id: source ? source.id : null,
  };
}

function deriveCompletionStates(events) {
  validateEventCollection(events);
  const allEventsById = new Map(events.map((event) => [event.id, event]));
  const groups = new Map();

  for (const event of events) {
    const key = groupKey(event.habit_id, event.local_date);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, groupEvents]) => ({
      ...splitGroupKey(key),
      ...reduceGroup(groupEvents, allEventsById),
    }))
    .sort((left, right) =>
      left.habit_id === right.habit_id
        ? left.local_date < right.local_date
          ? -1
          : left.local_date > right.local_date
            ? 1
            : 0
        : left.habit_id < right.habit_id
          ? -1
          : 1,
    );
}

function deriveCompletionState(events, habitId, localDate) {
  requireText(habitId, 'habitId');
  parseDateKey(localDate, 'localDate');
  const state = deriveCompletionStates(events).find(
    (candidate) =>
      candidate.habit_id === habitId && candidate.local_date === localDate,
  );

  return (
    state ?? {
      active_record_ids: [],
      anomalies: [],
      completed: false,
      completion_level: null,
      event_count: 0,
      habit_id: habitId,
      last_event_id: null,
      local_date: localDate,
      source_event_id: null,
    }
  );
}

module.exports = {
  COMPLETION_LEVELS,
  EVENT_SOURCES,
  EVENT_TYPES,
  compareEvents,
  deriveCompletionState,
  deriveCompletionStates,
  validateEvent,
};
