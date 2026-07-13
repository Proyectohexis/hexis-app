'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_REDIRECT_URL,
  normalizeRecoveryEmail,
  parsePasswordRecoveryUrl,
  validateNewPassword,
  validateRecoveryEmail,
} = require('../src/screens/auth/passwordRecovery.cjs');

test('normaliza el correo sin conservar mayúsculas ni espacios exteriores', () => {
  assert.equal(normalizeRecoveryEmail('  Persona@Example.COM '), 'persona@example.com');
});

test('valida el formato y longitud del correo antes de contactar auth', () => {
  assert.equal(validateRecoveryEmail('persona@example.com'), null);
  assert.equal(validateRecoveryEmail('sin-arroba'), 'Escribe un correo válido.');
  assert.equal(validateRecoveryEmail(`${'a'.repeat(250)}@x.com`), 'Escribe un correo válido.');
});

test('exige contraseña larga y confirmación exacta sin imponer composición', () => {
  const validPassword = 'cuatro palabras seguras';
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.equal(
    validateNewPassword({ password: validPassword, confirmation: validPassword }),
    null,
  );
  assert.equal(
    validateNewPassword({ password: 'muy corta', confirmation: 'muy corta' }),
    `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  );
  assert.equal(
    validateNewPassword({ password: validPassword, confirmation: 'otra contraseña segura' }),
    'Las contraseñas no coinciden.',
  );
  assert.equal(
    validateNewPassword({
      password: ' '.repeat(MIN_PASSWORD_LENGTH),
      confirmation: ' '.repeat(MIN_PASSWORD_LENGTH),
    }),
    'La contraseña no puede contener solo espacios.',
  );
  assert.equal(
    validateNewPassword({
      password: 'a'.repeat(MAX_PASSWORD_LENGTH + 1),
      confirmation: 'a'.repeat(MAX_PASSWORD_LENGTH + 1),
    }),
    `Usa como máximo ${MAX_PASSWORD_LENGTH} caracteres.`,
  );
});

test('acepta únicamente el callback PKCE exacto de recuperación de HEXIS', () => {
  assert.equal(PASSWORD_RECOVERY_REDIRECT_URL, 'hexis://auth/reset-password');
  assert.deepEqual(
    parsePasswordRecoveryUrl('hexis://auth/reset-password?code=code-one-time&type=recovery'),
    { mode: 'pkce', code: 'code-one-time' },
  );
  assert.deepEqual(
    parsePasswordRecoveryUrl('hexis://auth/reset-password?code=code-one-time'),
    { mode: 'pkce', code: 'code-one-time' },
  );
});

test('rechaza rutas, tipos, errores del proveedor y tokens de flujo implícito', () => {
  const invalid = { errorCode: 'invalid_recovery_link' };
  assert.deepEqual(parsePasswordRecoveryUrl('https://auth/reset-password?code=x'), invalid);
  assert.deepEqual(parsePasswordRecoveryUrl('hexis://auth/otro?code=x'), invalid);
  assert.deepEqual(
    parsePasswordRecoveryUrl('hexis://auth/reset-password?code=x&type=signup'),
    invalid,
  );
  assert.deepEqual(
    parsePasswordRecoveryUrl(
      'hexis://auth/reset-password#access_token=secret&refresh_token=secret&type=recovery',
    ),
    invalid,
  );
  assert.deepEqual(
    parsePasswordRecoveryUrl('hexis://auth/reset-password?error_code=otp_expired'),
    { errorCode: 'recovery_link_rejected' },
  );
});
