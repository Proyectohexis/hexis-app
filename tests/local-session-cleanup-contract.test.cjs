'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('cerrar sesión limpia recordatorios y cola antes de revocar la sesión', () => {
  const authSource = source('src/lib/auth.js');
  const signOutBody = authSource.slice(
    authSource.indexOf('export async function signOut()'),
    authSource.indexOf('export async function requestPasswordReset'),
  );

  const remindersIndex = signOutBody.indexOf('disableUserHabitReminders(authenticatedUserId)');
  const queueIndex = signOutBody.indexOf('asyncStorageCheckInQueue.clearForUser(authenticatedUserId)');
  const remoteSignOutIndex = signOutBody.lastIndexOf('supabase.auth.signOut()');
  assert.ok(remindersIndex >= 0);
  assert.ok(queueIndex > remindersIndex);
  assert.ok(remoteSignOutIndex > queueIndex);
});

test('el borrado no anuncia limpieza completa cuando existen advertencias locales', () => {
  const screenSource = source('src/screens/account/AccountScreen.js');
  assert.match(screenSource, /const cleanup = await finalizeDeletedAccount\(user\.id\)/);
  assert.match(screenSource, /if \(cleanup\.warnings\.length\)/);
  assert.match(screenSource, /Cuenta eliminada con limpieza pendiente/);
});
