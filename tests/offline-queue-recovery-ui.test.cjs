'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const component = readFileSync(
  'src/components/QueueRecoveryNotice.js',
  'utf8',
);
const today = readFileSync('src/screens/today/TodayScreen.js', 'utf8');
const account = readFileSync('src/screens/account/AccountScreen.js', 'utf8');

test('el aviso de recuperación es visible, accesible y requiere confirmación explícita', () => {
  assert.match(component, /accessibilityRole="alert"/);
  assert.match(component, /accessibilityLiveRegion="assertive"/);
  assert.match(component, /Código para soporte/);
  assert.match(component, /Entiendo el posible cambio faltante/);
  assert.match(component, /recovery_notice_unreadable/);
  assert.match(component, /accessibilityRole="button"/);
  assert.doesNotMatch(component, /<View\s+accessible/);
});

test('Hoy y Cuenta leen y reconocen el aviso persistente de la cola', () => {
  for (const source of [today, account]) {
    assert.match(source, /QueueRecoveryNotice/);
    assert.match(source, /recoveryNotice/);
    assert.match(source, /\.list\(\{\s*userId:/);
    assert.match(source, /acknowledgeRecoveryNotice\([\s\S]*?\.generation/);
    assert.match(source, /setQueueUnavailable\(true\)/);
  }
});
