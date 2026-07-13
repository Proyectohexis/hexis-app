'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInitialHabitPayload } = require('../src/data/repositories/planPayload.cjs');

test('serializa cue_value como objeto vacío cuando no existe recordatorio', () => {
  const [habit] = buildInitialHabitPayload([{
    name: '  Caminar  ',
    minimum_action: '  Cinco minutos  ',
    scheduled_weekdays: [5, 1, 3],
    reminder_time: '',
    localId: 'solo-cliente',
  }]);
  assert.deepEqual(habit, {
    name: 'Caminar',
    minimum_action: 'Cinco minutos',
    scheduled_weekdays: [1, 3, 5],
    cue_type: 'none',
    cue_value: {},
    reminder_time: null,
    position: 0,
  });
});

test('serializa una señal horaria compatible con el constraint SQL', () => {
  const [habit] = buildInitialHabitPayload([{
    name: 'Caminar',
    minimum_action: 'Cinco minutos',
    scheduled_weekdays: [1],
    reminder_time: '07:30',
  }]);
  assert.equal(habit.cue_type, 'time');
  assert.deepEqual(habit.cue_value, { time: '07:30' });
});
