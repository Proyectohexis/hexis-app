'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PRODUCT_EVENT_NAMES } = require('../src/analytics/eventTaxonomy.cjs');

const instrumentedFiles = [
  'src/screens/onboarding/WelcomeScreen.js',
  'src/screens/onboarding/GoalScreen.js',
  'src/screens/onboarding/PlanSetupScreen.js',
  'src/screens/today/TodayScreen.js',
  'src/screens/review/WeeklyReviewScreen.js',
  'src/screens/discipline/DisciplineScreen.js',
  'src/screens/account/AccountScreen.js',
];

const source = instrumentedFiles
  .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
  .join('\n');

test('los nueve eventos permitidos tienen un punto de instrumentación explícito', () => {
  for (const eventName of PRODUCT_EVENT_NAMES) {
    assert.match(source, new RegExp(`trackProductEvent\\('${eventName}'`), eventName);
  }
});

test('ninguna pantalla configura un proveedor o sink de analítica', () => {
  assert.doesNotMatch(source, /configureAnalyticsSink/);
});
