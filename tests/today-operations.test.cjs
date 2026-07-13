'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectStableCheckInOperation } = require('../src/screens/today/todayOperations.cjs');

function select(existing, intendedCompleted, completionLevel, id = 'new-operation') {
  return selectStableCheckInOperation({
    existing,
    intendedCompleted,
    completionLevel,
    createId: () => id,
    occurredAt: '2026-07-12T12:00:00.000Z',
  });
}

test('un reintento del mismo payload conserva operation_id y occurred_at', () => {
  const existing = {
    id: 'original',
    intendedCompleted: true,
    completionLevel: 'full',
    occurredAt: '2026-07-12T11:59:00.000Z',
  };
  assert.equal(select(existing, true, 'full'), existing);
});

test('cambiar entre evidencia full y minimum crea una operación nueva', () => {
  const existing = {
    id: 'original',
    intendedCompleted: true,
    completionLevel: 'full',
    occurredAt: '2026-07-12T11:59:00.000Z',
  };
  const next = select(existing, true, 'minimum');
  assert.equal(next.id, 'new-operation');
  assert.equal(next.completionLevel, 'minimum');
});

test('retractar reutiliza la operación aunque el nivel no forme parte del payload', () => {
  const existing = {
    id: 'retract-operation',
    intendedCompleted: false,
    completionLevel: 'full',
    occurredAt: '2026-07-12T11:59:00.000Z',
  };
  assert.equal(select(existing, false, 'minimum'), existing);
});
