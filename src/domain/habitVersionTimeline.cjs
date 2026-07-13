'use strict';

const { addDays, parseDateKey } = require('./dateKeys.cjs');

function assertHabitVersions(versions, label = 'versions') {
  if (!Array.isArray(versions)) {
    throw new TypeError(`${label} debe ser una lista.`);
  }

  for (const habit of versions) {
    if (!habit || typeof habit !== 'object' || Array.isArray(habit)) {
      throw new TypeError(`${label} solo puede contener habitos.`);
    }
    if (typeof habit.id !== 'string' || habit.id.length === 0) {
      throw new TypeError('Cada version de habito necesita id.');
    }
  }
}

function versionNumberOf(habit) {
  return Number.isInteger(habit.version_number) ? habit.version_number : 1;
}

function compareVersions(left, right) {
  const byVersion = versionNumberOf(left) - versionNumberOf(right);
  if (byVersion !== 0) return byVersion;

  const byStart = (left.starts_on || '').localeCompare(right.starts_on || '');
  if (byStart !== 0) return byStart;

  const byCreated = (left.created_at || '').localeCompare(right.created_at || '');
  if (byCreated !== 0) return byCreated;

  return left.id.localeCompare(right.id);
}

function resolveHabitLineageId(habit, habitsById) {
  if (habit.lineage_id) return habit.lineage_id;

  let current = habit;
  const visited = new Set();
  while (current?.replaces_habit_id) {
    if (visited.has(current.id)) return habit.id;
    visited.add(current.id);

    const parent = habitsById.get(current.replaces_habit_id);
    if (!parent) return current.replaces_habit_id;
    if (parent.lineage_id) return parent.lineage_id;
    current = parent;
  }

  return current?.id || habit.id;
}

function groupHabitVersions(habits) {
  assertHabitVersions(habits, 'habits');
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]));
  const grouped = new Map();

  for (const habit of habits) {
    const lineageId = resolveHabitLineageId(habit, habitsById);
    const versions = grouped.get(lineageId) || [];
    versions.push(habit);
    grouped.set(lineageId, versions);
  }

  return [...grouped.entries()]
    .map(([lineageId, versions]) => ({
      lineage_id: lineageId,
      versions: [...versions].sort(compareVersions),
    }))
    .sort((left, right) => {
      const leftPosition = Math.min(...left.versions.map((habit) => habit.position ?? 99));
      const rightPosition = Math.min(...right.versions.map((habit) => habit.position ?? 99));
      return leftPosition - rightPosition || left.lineage_id.localeCompare(right.lineage_id);
    });
}

function isHabitVersionEffectiveOn(habit, dateKey) {
  parseDateKey(dateKey);
  if (!habit || typeof habit !== 'object' || Array.isArray(habit)) {
    throw new TypeError('habit debe ser un objeto.');
  }

  return (!habit.starts_on || habit.starts_on <= dateKey)
    && (!habit.ends_on || habit.ends_on >= dateKey);
}

function latestPastVersion(versions, dateKey) {
  return versions
    .filter((habit) => habit.ends_on && habit.ends_on < dateKey)
    .sort((left, right) => (
      left.ends_on.localeCompare(right.ends_on) || compareVersions(left, right)
    ))
    .at(-1) || null;
}

function earliestFutureVersion(versions, dateKey) {
  return versions
    .filter((habit) => habit.starts_on && habit.starts_on > dateKey)
    .sort((left, right) => (
      left.starts_on.localeCompare(right.starts_on) || compareVersions(left, right)
    ))[0] || null;
}

function effectiveStatusOf(habit, selection) {
  if (selection === 'effective') return 'active';
  if (selection === 'future') return 'scheduled';
  if (habit.status === 'paused' || habit.status === 'archived') return habit.status;
  return 'ended';
}

function pendingChangeFor(versions, selected, selection, dateKey) {
  const candidates = [];
  const future = earliestFutureVersion(versions, dateKey);

  if (future) {
    candidates.push({
      effective_on: future.starts_on,
      habit_id: future.id,
      status: future.status || 'active',
      type: future.id === selected.id ? 'start' : 'replacement',
    });
  }

  if (
    selection === 'effective'
    && (selected.status === 'paused' || selected.status === 'archived')
    && selected.ends_on
    && selected.ends_on >= dateKey
  ) {
    candidates.push({
      effective_on: addDays(selected.ends_on, 1),
      habit_id: selected.id,
      status: selected.status,
      type: selected.status === 'paused' ? 'pause' : 'archive',
    });
  }

  return candidates.sort((left, right) => (
    left.effective_on.localeCompare(right.effective_on)
      || Number(left.type !== 'replacement') - Number(right.type !== 'replacement')
  ))[0] || null;
}

function selectHabitVersionForDate(versions, dateKey) {
  parseDateKey(dateKey);
  assertHabitVersions(versions);
  if (versions.length === 0) return null;

  const sorted = [...versions].sort(compareVersions);
  const effective = sorted.filter((habit) => isHabitVersionEffectiveOn(habit, dateKey));
  let habit = effective.at(-1) || null;
  let selection = 'effective';

  if (!habit) {
    habit = latestPastVersion(sorted, dateKey);
    selection = habit ? 'past' : 'future';
  }
  if (!habit) habit = earliestFutureVersion(sorted, dateKey);
  if (!habit) return null;

  const pendingChange = pendingChangeFor(sorted, habit, selection, dateKey);
  return {
    ...habit,
    effective_status: effectiveStatusOf(habit, selection),
    is_effective: selection === 'effective',
    pending_change: pendingChange,
    pending_change_effective_on: pendingChange?.effective_on || null,
    timeline_selection: selection,
  };
}

function selectHabitTimelineForDate(habits, dateKey) {
  parseDateKey(dateKey);
  return groupHabitVersions(habits)
    .map((group) => {
      const selected = selectHabitVersionForDate(group.versions, dateKey);
      return selected ? { ...selected, lineage_id: group.lineage_id } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      (left.position ?? 99) - (right.position ?? 99)
        || left.lineage_id.localeCompare(right.lineage_id)
    ));
}

module.exports = {
  groupHabitVersions,
  isHabitVersionEffectiveOn,
  selectHabitTimelineForDate,
  selectHabitVersionForDate,
};
