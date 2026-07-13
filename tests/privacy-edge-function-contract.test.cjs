'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'delete-account', 'index.ts'),
  'utf8',
);
const configSource = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'config.toml'),
  'utf8',
);

test('delete-account autentica al caller y revalida su contraseña en servidor', () => {
  assert.match(source, /callerClient\.auth\.getUser\(\)/);
  assert.match(source, /signInWithPassword/);
  assert.match(source, /reauthenticationData\.user\.id !== caller\.id/);
});

test('delete-account usa service role solo dentro de la función y borra al caller', () => {
  assert.match(source, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.match(source, /auth\.admin\.deleteUser\(caller\.id, false\)/);
  assert.doesNotMatch(source, /payload\.(userId|user_id)/);
});

test('delete-account conserva un recibo corto para reconciliar una respuesta perdida', () => {
  assert.match(configSource, /\[functions\.delete-account\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(source, /get_account_deletion_receipt/);
  assert.match(source, /begin_account_deletion_receipt/);
  assert.match(source, /complete_account_deletion_receipt/);
  assert.match(source, /reconciled: true/);
});

test('delete-account exige método, frase y operationId sin registrar secretos', () => {
  assert.match(source, /request\.method !== 'POST'/);
  assert.match(source, /request\.body\?\.getReader\(\)/);
  assert.match(source, /totalBytes > MAX_REQUEST_BYTES/);
  assert.match(source, /unsupported_media_type/);
  assert.doesNotMatch(source, /request\.json\(\)/);
  assert.match(source, /confirmation !== DELETE_CONFIRMATION/);
  assert.match(source, /UUID_PATTERN\.test\(operationId\)/);
  assert.doesNotMatch(source, /console\.(log|error)/);
});
