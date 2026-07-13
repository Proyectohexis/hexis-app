'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWeightInput, validateCredentials } = require('../src/lib/validation.cjs');

test('acepta punto o coma y limita decimales del peso', () => {
  assert.equal(parseWeightInput('75,5'), 75.5);
  assert.equal(parseWeightInput('75.25'), 75.25);
  assert.ok(Number.isNaN(parseWeightInput('75.255')));
  assert.ok(Number.isNaN(parseWeightInput('0')));
  assert.ok(Number.isNaN(parseWeightInput('501')));
});

test('valida las credenciales mínimas de cuenta', () => {
  assert.match(validateCredentials({ email: 'mal', password: '12345678' }), /correo/);
  assert.match(validateCredentials({ email: 'a@b.com', password: '123' }), /12 caracteres/);
  assert.match(validateCredentials({ email: 'a@b.com', password: '            ' }), /solo espacios/);
  assert.match(validateCredentials({ email: 'a@b.com', password: '123456789012', confirmation: '123456789013' }), /no coinciden/);
  assert.equal(validateCredentials({ email: 'a@b.com', password: '123456789012' }), null);
});
