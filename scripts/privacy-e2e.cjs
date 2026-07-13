'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function loadDotEnv() {
  const file = join(__dirname, '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] == null) process.env[match[1]] = match[2];
  }
}

loadDotEnv();

const baseUrl = (
  process.env.SUPABASE_URL
  || process.env.EXPO_PUBLIC_SUPABASE_URL
  || 'http://127.0.0.1:55321'
).replace(/\/$/, '');
const publishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || ''
);

if (!publishableKey) {
  throw new Error('Falta SUPABASE_PUBLISHABLE_KEY o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}

async function request(path, { token, body, contentType = 'application/json', rawBody } = {}) {
  const headers = { apikey: publishableKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (contentType) headers['Content-Type'] = contentType;
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: rawBody ?? JSON.stringify(body ?? {}),
    ...(rawBody instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

async function signUp(email, password) {
  const result = await request('/auth/v1/signup', { body: { email, password } });
  assert.equal(result.response.status, 200, 'signup temporal debe devolver 200');
  assert.ok(result.payload?.access_token, 'signup temporal debe devolver sesión');
  return result.payload;
}

async function signIn(email, password) {
  return request('/auth/v1/token?grant_type=password', { body: { email, password } });
}

async function assertAccountExists(email, password, message) {
  const result = await signIn(email, password);
  assert.equal(result.response.status, 200, message);
  return result.payload.access_token;
}

async function assertAccountDeleted(email, password, message) {
  const result = await signIn(email, password);
  assert.ok(result.response.status >= 400, message);
}

function deletionBody(password, operationId, extras = {}) {
  return {
    password,
    confirmation: 'ELIMINAR HEXIS',
    operationId,
    ...extras,
  };
}

async function deleteAccount(token, password, operationId = randomUUID()) {
  return request('/functions/v1/delete-account', {
    token,
    body: deletionBody(password, operationId),
  });
}

async function bestEffortCleanup(account) {
  if (!account?.token) return;
  try {
    await deleteAccount(account.token, account.password);
  } catch {
    // The harness must preserve the original failure. Accounts are random and local only.
  }
}

async function run() {
  const suffix = randomUUID().replace(/-/g, '');
  const accountA = {
    email: `hexis-privacy-a-${suffix}@example.test`,
    password: `Hx!A-${suffix}-9`,
  };
  const accountB = {
    email: `hexis-privacy-b-${suffix}@example.test`,
    password: `Hx!B-${suffix}-9`,
  };

  try {
    accountA.token = (await signUp(accountA.email, accountA.password)).access_token;
    accountB.token = (await signUp(accountB.email, accountB.password)).access_token;
    console.log('✓ cuentas temporales A/B creadas');

    const exported = await request('/rest/v1/rpc/export_current_account', {
      token: accountA.token,
      body: {},
    });
    assert.equal(exported.response.status, 200);
    assert.equal(exported.payload?.format, 'hexis-account-export');
    assert.equal(exported.payload?.account?.id, (await signIn(accountA.email, accountA.password)).payload.user.id);
    const serializedExport = JSON.stringify(exported.payload);
    assert.ok(!serializedExport.includes('client_operation_id'));
    assert.ok(!serializedExport.includes('request_fingerprint'));
    console.log('✓ exportación ligada al caller y sin campos internos');

    const withoutAuth = await request('/functions/v1/delete-account', {
      body: deletionBody(accountA.password, randomUUID()),
    });
    assert.equal(withoutAuth.response.status, 401);
    console.log('✓ solicitud sin JWT rechazada');

    const wrongPassword = await deleteAccount(accountA.token, 'contraseña-incorrecta', randomUUID());
    assert.equal(wrongPassword.response.status, 403);
    assert.equal(wrongPassword.payload?.code, 'reauthentication_failed');
    accountA.token = await assertAccountExists(
      accountA.email,
      accountA.password,
      'contraseña incorrecta no debe borrar A',
    );
    console.log('✓ contraseña incorrecta rechazada sin borrar la cuenta');

    const crossCaller = await deleteAccount(accountB.token, accountA.password, randomUUID());
    assert.equal(crossCaller.response.status, 403);
    accountA.token = await assertAccountExists(accountA.email, accountA.password, 'A debe sobrevivir');
    accountB.token = await assertAccountExists(accountB.email, accountB.password, 'B debe sobrevivir');
    console.log('✓ credenciales de otra cuenta no permiten borrado cruzado');

    const oversizedPayload = JSON.stringify(
      deletionBody(accountA.password, randomUUID(), { padding: 'x'.repeat(5000) }),
    );
    const encodedPayload = new TextEncoder().encode(oversizedPayload);
    const oversizedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encodedPayload);
        controller.close();
      },
    });
    const oversized = await request('/functions/v1/delete-account', {
      token: accountA.token,
      rawBody: oversizedStream,
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.payload?.code, 'request_too_large');
    accountA.token = await assertAccountExists(
      accountA.email,
      accountA.password,
      'body sobredimensionado no debe borrar A',
    );
    console.log('✓ body chunked mayor de 4 KiB rechazado por tamaño real');

    const unsupported = await request('/functions/v1/delete-account', {
      token: accountA.token,
      contentType: 'text/plain',
      rawBody: '{}',
    });
    assert.equal(unsupported.response.status, 415);
    console.log('✓ Content-Type no JSON rechazado');

    const lostResponseOperationId = randomUUID();
    await deleteAccount(accountB.token, accountB.password, lostResponseOperationId);
    const reconciled = await deleteAccount(accountB.token, accountB.password, lostResponseOperationId);
    assert.equal(reconciled.response.status, 200);
    assert.equal(reconciled.payload?.deleted, true);
    assert.equal(reconciled.payload?.operationId, lostResponseOperationId);
    assert.equal(reconciled.payload?.reconciled, true);
    await assertAccountDeleted(
      accountB.email,
      accountB.password,
      'B debe permanecer eliminada después del reintento',
    );
    console.log('✓ respuesta perdida simulada reconciliada con el mismo operationId');

    const deletionA = await deleteAccount(accountA.token, accountA.password);
    assert.equal(deletionA.response.status, 200);
    assert.equal(deletionA.payload?.deleted, true);
    await assertAccountDeleted(accountA.email, accountA.password, 'A debe quedar eliminada');
    console.log('✓ eliminación final revoca el acceso');
  } finally {
    await Promise.all([bestEffortCleanup(accountA), bestEffortCleanup(accountB)]);
  }
}

run().catch((error) => {
  console.error(`Privacy E2E FAIL: ${error.message}`);
  process.exitCode = 1;
});
