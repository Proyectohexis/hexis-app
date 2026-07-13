'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '202607120001_target_domain_model.sql',
), 'utf8');

test('evidencia y descansos validan conflicto dentro del mismo advisory lock', () => {
  const functionBody = /create function hexis_private\.validate_completion_event\(\)([\s\S]*?)create function hexis_private\.validate_habit_version/i.exec(migration)?.[1];
  assert.ok(functionBody, 'no se encontró validate_completion_event');
  const lockIndex = functionBody.indexOf("'hexis:event:'");
  const exceptionIndex = functionBody.indexOf('from public.habit_schedule_exceptions');
  assert.ok(lockIndex >= 0, 'falta el lock compartido de evidencia');
  assert.ok(exceptionIndex > lockIndex, 'la excepción debe comprobarse después de adquirir el lock');
});
