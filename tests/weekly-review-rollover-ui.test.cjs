'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const source = readFileSync(
  'src/screens/review/WeeklyReviewScreen.js',
  'utf8',
);

test('un cambio de cuenta, plan o semana invalida el borrador y la operación anterior', () => {
  assert.match(source, /reviewScopeKey = `\$\{user\.id\}:\$\{activePlan\.id\}:\$\{weekStart\}`/);

  const resetStart = source.indexOf('useLayoutEffect(() => {', source.indexOf('reviewScopeKey'));
  const resetEnd = source.indexOf('}, [reviewScopeKey]);', resetStart);
  assert.notEqual(resetStart, -1);
  assert.notEqual(resetEnd, -1);
  const resetBlock = source.slice(resetStart, resetEnd);

  assert.match(resetBlock, /operationIdRef\.current = createOperationId\(\)/);
  assert.match(resetBlock, /setReflection\(''\)/);
  assert.match(resetBlock, /setDecision\('keep'\)/);
  assert.match(resetBlock, /setReview\(null\)/);
  assert.match(resetBlock, /requestIdRef\.current \+= 1/);
});

test('guardar vuelve a comprobar la fecha civil y descarta respuestas de otro scope', () => {
  const saveStart = source.indexOf('async function saveReview()');
  const saveEnd = source.indexOf('\n  const sec =', saveStart);
  const saveBlock = source.slice(saveStart, saveEnd);
  const rolloverGuard = saveBlock.indexOf('currentPeriod.week_start !== weekStart');
  const mutation = saveBlock.indexOf('const result = await completeWeeklyReview');

  assert.notEqual(rolloverGuard, -1);
  assert.notEqual(mutation, -1);
  assert.ok(rolloverGuard < mutation);
  assert.match(saveBlock, /reviewScopeRef\.current !== savingScopeKey/);
  assert.match(saveBlock, /reviewScopeRef\.current === savingScopeKey/);
});

test('Revisión se actualiza al volver al foreground o cruzar la fecha y no agrupa la tarjeta', () => {
  assert.match(source, /AppState\.addEventListener\('change'/);
  assert.match(source, /setInterval\(refreshCivilDate, 60_000\)/);
  assert.doesNotMatch(
    source,
    /<View\s+accessible[\s\S]{0,200}style=\{styles\.eligibilityCard\}/,
  );
});
