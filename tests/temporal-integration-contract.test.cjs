'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const practice = fs.readFileSync(path.join(root, 'src/data/repositories/practiceRepository.js'), 'utf8');
const discipline = fs.readFileSync(path.join(root, 'src/screens/discipline/DisciplineScreen.js'), 'utf8');
const navigator = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');

test('Hoy deriva vigencia por fechas incluso si el estado raw ya fue archivado', () => {
  const body = /export async function getTodayPractice[\s\S]*?export async function recordHabitCompletion/.exec(practice)?.[0] || '';
  assert.match(body, /getPlanHabits\(\{ userId, planId, includeArchived: true \}\)/);
  assert.match(body, /isCommitmentScheduled/);
  assert.match(practice, /\.is\('deleted_at', null\)/);
});

test('Disciplina selecciona la versión efectiva y acota el aviso vigente sin adelantar D+1', () => {
  assert.match(discipline, /selectHabitTimelineForDate\(result\.data, effectiveOn\)/);
  assert.match(discipline, /status: habit\.effective_status \|\| habit\.status/);
  assert.doesNotMatch(discipline, /latestHabitVersions/);
  assert.match(discipline, /effective_status: 'active',[\s\S]*?ends_on: effectiveOn/);
  assert.doesNotMatch(discipline, /nextHabit:\s*result\.data\.habit/);
  assert.match(discipline, /setInterval\(refreshDateBoundary, 60 \* 1000\)/);
  assert.match(discipline, /excluded_dates: excludedDates/);
});

test('el bootstrap reconcilia recordatorios efectivos al iniciar, reanudar y cambiar de fecha', () => {
  assert.match(navigator, /selectHabitTimelineForDate\(result\.data, localDate\)/);
  assert.match(navigator, /AppState\.addEventListener\('change'/);
  assert.match(navigator, /setInterval\(\(\) => reconcileEffectiveReminders\(\), 60 \* 1000\)/);
  assert.match(navigator, /if \(!userId\) return undefined;[\s\S]*?suspendUserRemindersForTimezoneChange\(userId\)/);
  assert.match(navigator, /getScheduleExceptions\([\s\S]*?REMINDER_HORIZON_DAYS - 1/);
  assert.match(navigator, /excluded_dates: exceptionsResult\.data/);
});
