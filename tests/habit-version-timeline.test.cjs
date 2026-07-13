'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupHabitVersions,
  isHabitVersionEffectiveOn,
  selectHabitTimelineForDate,
  selectHabitVersionForDate,
} = require('../src/domain/habitVersionTimeline.cjs');

function habit(overrides = {}) {
  return {
    created_at: '2026-07-01T12:00:00.000Z',
    ends_on: null,
    id: 'habit-v1',
    lineage_id: 'habit-v1',
    position: 0,
    replaces_habit_id: null,
    starts_on: '2026-07-01',
    status: 'active',
    version_number: 1,
    ...overrides,
  };
}

test('agrupa y ordena versiones por lineage_id sin mutar la entrada', () => {
  const input = [
    habit({ id: 'b-v2', lineage_id: 'b-v1', position: 1, replaces_habit_id: 'b-v1', version_number: 2 }),
    habit({ id: 'a-v1', lineage_id: 'a-v1', position: 0 }),
    habit({ id: 'b-v1', lineage_id: 'b-v1', position: 1 }),
  ];
  const originalOrder = input.map((item) => item.id);

  const groups = groupHabitVersions(input);

  assert.deepEqual(groups.map((group) => group.lineage_id), ['a-v1', 'b-v1']);
  assert.deepEqual(groups[1].versions.map((item) => item.id), ['b-v1', 'b-v2']);
  assert.deepEqual(input.map((item) => item.id), originalOrder);
});

test('deriva la raiz recorriendo replaces_habit_id si lineage_id no esta disponible', () => {
  const groups = groupHabitVersions([
    habit({ id: 'root', lineage_id: null }),
    habit({ id: 'v2', lineage_id: null, replaces_habit_id: 'root', version_number: 2 }),
    habit({ id: 'v3', lineage_id: null, replaces_habit_id: 'v2', version_number: 3 }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].lineage_id, 'root');
  assert.deepEqual(groups[0].versions.map((item) => item.id), ['root', 'v2', 'v3']);
});

test('en D conserva vigente la version archivada por un reemplazo D+1', () => {
  const versions = [
    habit({ id: 'v1', lineage_id: 'root', status: 'archived', ends_on: '2026-07-12' }),
    habit({
      created_at: '2026-07-12T13:00:00.000Z',
      id: 'v2',
      lineage_id: 'root',
      replaces_habit_id: 'v1',
      starts_on: '2026-07-13',
      version_number: 2,
    }),
  ];

  const selected = selectHabitVersionForDate(versions, '2026-07-12');

  assert.equal(selected.id, 'v1');
  assert.equal(selected.is_effective, true);
  assert.equal(selected.effective_status, 'active');
  assert.deepEqual(selected.pending_change, {
    effective_on: '2026-07-13',
    habit_id: 'v2',
    status: 'active',
    type: 'replacement',
  });
  assert.equal(selected.pending_change_effective_on, '2026-07-13');
});

test('en D+1 activa la nueva version y elimina el cambio pendiente', () => {
  const selected = selectHabitVersionForDate([
    habit({ id: 'v1', lineage_id: 'root', status: 'archived', ends_on: '2026-07-12' }),
    habit({
      id: 'v2',
      lineage_id: 'root',
      replaces_habit_id: 'v1',
      starts_on: '2026-07-13',
      version_number: 2,
    }),
  ], '2026-07-13');

  assert.equal(selected.id, 'v2');
  assert.equal(selected.effective_status, 'active');
  assert.equal(selected.pending_change, null);
});

test('una pausa D+1 sigue activa en D y queda pausada despues de su cierre', () => {
  const paused = habit({ status: 'paused', ends_on: '2026-07-12' });

  const onD = selectHabitVersionForDate([paused], '2026-07-12');
  assert.equal(onD.effective_status, 'active');
  assert.deepEqual(onD.pending_change, {
    effective_on: '2026-07-13',
    habit_id: 'habit-v1',
    status: 'paused',
    type: 'pause',
  });

  const onDPlusOne = selectHabitVersionForDate([paused], '2026-07-13');
  assert.equal(onDPlusOne.id, 'habit-v1');
  assert.equal(onDPlusOne.timeline_selection, 'past');
  assert.equal(onDPlusOne.effective_status, 'paused');
  assert.equal(onDPlusOne.pending_change, null);
});

test('mantiene una version futura administrable como programada hasta su inicio', () => {
  const future = habit({ starts_on: '2026-07-13' });

  const selected = selectHabitVersionForDate([future], '2026-07-12');

  assert.equal(selected.id, 'habit-v1');
  assert.equal(selected.is_effective, false);
  assert.equal(selected.effective_status, 'scheduled');
  assert.deepEqual(selected.pending_change, {
    effective_on: '2026-07-13',
    habit_id: 'habit-v1',
    status: 'active',
    type: 'start',
  });
});

test('selecciona una fila por lineage y respeta el orden de posiciones', () => {
  const selected = selectHabitTimelineForDate([
    habit({ id: 'second', lineage_id: 'second', position: 1 }),
    habit({ id: 'first-old', lineage_id: 'first', position: 0, ends_on: '2026-07-12', status: 'archived' }),
    habit({ id: 'first-new', lineage_id: 'first', position: 0, replaces_habit_id: 'first-old', starts_on: '2026-07-13', version_number: 2 }),
  ], '2026-07-12');

  assert.deepEqual(selected.map((item) => item.id), ['first-old', 'second']);
  assert.deepEqual(selected.map((item) => item.effective_status), ['active', 'active']);
});

test('valida fechas civiles y limites inclusivos', () => {
  const bounded = habit({ starts_on: '2026-07-01', ends_on: '2026-07-12' });
  assert.equal(isHabitVersionEffectiveOn(bounded, '2026-07-01'), true);
  assert.equal(isHabitVersionEffectiveOn(bounded, '2026-07-12'), true);
  assert.equal(isHabitVersionEffectiveOn(bounded, '2026-07-13'), false);
  assert.throws(
    () => selectHabitVersionForDate([bounded], '2026-02-30'),
    /fecha civil valida/,
  );
});
