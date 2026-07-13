'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DELETE_CONFIRMATION,
  exportFileName,
  serializeExportSnapshot,
  shouldRetryDeletionRequest,
  validateDeletionInput,
  validateExportSnapshot,
} = require('../src/data/repositories/privacyOperations.cjs');

function snapshot(overrides = {}) {
  return {
    format: 'hexis-account-export',
    schema_version: 1,
    generated_at: '2026-07-12T12:30:00.000Z',
    account: { id: 'user-a', email: 'user@example.test' },
    data: { plans: [], habits: [] },
    ...overrides,
  };
}

test('la eliminación exige contraseña y frase exacta', () => {
  assert.equal(validateDeletionInput({ password: '', confirmation: DELETE_CONFIRMATION }), 'Escribe tu contraseña actual.');
  assert.match(validateDeletionInput({ password: 'correcta', confirmation: 'eliminar hexis' }), /exactamente/);
  assert.equal(validateDeletionInput({ password: 'correcta', confirmation: DELETE_CONFIRMATION }), '');
});

test('solo serializa snapshots versionados y agrega salto final', () => {
  assert.equal(validateExportSnapshot(snapshot()), true);
  assert.equal(validateExportSnapshot(snapshot({ schema_version: 2 })), false);
  const serialized = serializeExportSnapshot(snapshot());
  assert.equal(serialized.endsWith('\n'), true);
  assert.equal(JSON.parse(serialized).format, 'hexis-account-export');
  assert.throws(() => serializeExportSnapshot({ format: 'otro' }), /invalid_export_snapshot/);
});

test('el nombre de exportación es determinista y seguro para archivos', () => {
  assert.equal(
    exportFileName('2026-07-12T12:30:00.000Z'),
    'hexis-datos-2026-07-12T12-30-00-000Z.json',
  );
  assert.equal(exportFileName('fecha inválida'), 'hexis-datos-sin-fecha.json');
});

test('solo reintenta una eliminación ante transporte ambiguo o respuesta 5xx', () => {
  assert.equal(shouldRetryDeletionRequest({ name: 'FunctionsFetchError' }), true);
  assert.equal(shouldRetryDeletionRequest({ name: 'FunctionsRelayError' }), true);
  assert.equal(shouldRetryDeletionRequest({ context: { status: 503 } }), true);
  assert.equal(shouldRetryDeletionRequest({ context: { status: 403 } }), false);
  assert.equal(shouldRetryDeletionRequest(null), false);
});
