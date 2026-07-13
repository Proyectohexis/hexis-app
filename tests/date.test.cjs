'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addDaysToDateKey,
  getDateKeyInTimeZone,
} = require('../src/lib/date.cjs');

test('Panamá conserva el 11 de julio cuando UTC ya cambió al día 12', () => {
  const instant = new Date('2026-07-12T00:30:00.000Z');
  assert.equal(getDateKeyInTimeZone(instant, 'America/Panama'), '2026-07-11');
});

test('la misma acción pertenece al día siguiente en una zona adelantada', () => {
  const instant = new Date('2026-07-12T00:30:00.000Z');
  assert.equal(getDateKeyInTimeZone(instant, 'Europe/Madrid'), '2026-07-12');
});

test('suma días sin depender de DST o zona del proceso', () => {
  assert.equal(addDaysToDateKey('2026-03-08', 1), '2026-03-09');
  assert.equal(addDaysToDateKey('2024-02-28', 1), '2024-02-29');
  assert.equal(addDaysToDateKey('2026-01-01', -1), '2025-12-31');
});

test('rechaza fechas y desplazamientos inválidos', () => {
  assert.throws(() => addDaysToDateKey('11/07/2026', 1), /YYYY-MM-DD/);
  assert.throws(() => addDaysToDateKey('2026-07-11', 1.5), /entero/);
});
