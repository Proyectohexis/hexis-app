'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMetricValue, validateMetricEntry } = require('../src/domain/metricValues.cjs');

test('parseMetricValue acepta coma, signo y hasta cuatro decimales', () => {
  assert.equal(parseMetricValue('75,25'), 75.25);
  assert.equal(parseMetricValue('-2.125'), -2.125);
  assert.ok(Number.isNaN(parseMetricValue('NaN')));
  assert.ok(Number.isNaN(parseMetricValue('1.12345')));
});

test('validateMetricEntry aplica fecha, límites y longitud sin interpretar el valor', () => {
  assert.equal(validateMetricEntry({
    valueText: '75.5',
    localDate: '2026-07-12',
    note: 'Medición de prueba',
    minValue: 0,
    maxValue: 500,
    maxDate: '2026-07-12',
  }).valid, true);

  const result = validateMetricEntry({
    valueText: '501',
    localDate: '2026-02-30',
    note: 'x'.repeat(501),
    minValue: 0,
    maxValue: 500,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(new Set(result.errors.map((error) => error.code)), new Set([
    'out_of_range',
    'invalid_date',
    'invalid_note',
  ]));

  const future = validateMetricEntry({
    valueText: '80',
    localDate: '2026-07-13',
    maxDate: '2026-07-12',
    minValue: 0,
    maxValue: 500,
  });
  assert.equal(future.valid, false);
  assert.ok(future.errors.some((error) => error.code === 'future_date'));
});
