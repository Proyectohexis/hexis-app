'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateLineageBreakdown } = require('../src/screens/review/reviewBreakdown.cjs');

test('agrupa versiones de un mismo compromiso y omite historia 0/0', () => {
  const habits = [
    { id: 'h1', lineage_id: 'h1', version_number: 1, name: 'Caminar' },
    { id: 'h2', lineage_id: 'h1', version_number: 2, name: 'Caminar 20 minutos' },
    { id: 'old', lineage_id: 'old', version_number: 1, name: 'Historia antigua' },
  ];
  const result = aggregateLineageBreakdown([
    { habit_id: 'h1', completed_opportunities: 1, scheduled_opportunities: 2, recovery: { status: 'recovered' } },
    { habit_id: 'h2', completed_opportunities: 2, scheduled_opportunities: 3, recovery: { status: 'steady' } },
    { habit_id: 'old', completed_opportunities: 0, scheduled_opportunities: 0, recovery: { status: 'steady' } },
  ], habits);

  assert.equal(result.length, 1);
  assert.equal(result[0].lineage_id, 'h1');
  assert.equal(result[0].habit.name, 'Caminar 20 minutos');
  assert.equal(result[0].completed_opportunities, 3);
  assert.equal(result[0].scheduled_opportunities, 5);
  assert.equal(result[0].consistency_rate, 0.6);
  assert.equal(result[0].recovery_status, 'recovered');
});

test('una reentrada pendiente prevalece al combinar versiones', () => {
  const result = aggregateLineageBreakdown([
    { habit_id: 'a', completed_opportunities: 1, scheduled_opportunities: 1, recovery: { status: 'recovered' } },
    { habit_id: 'b', completed_opportunities: 0, scheduled_opportunities: 1, recovery: { status: 'reentry_due' } },
  ], [
    { id: 'a', lineage_id: 'lineage', version_number: 1, name: 'A' },
    { id: 'b', lineage_id: 'lineage', version_number: 2, name: 'B' },
  ]);
  assert.equal(result[0].recovery_status, 'reentry_due');
});
