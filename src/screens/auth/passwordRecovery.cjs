'use strict';

const PASSWORD_RECOVERY_REDIRECT_URL = 'hexis://auth/reset-password';
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function normalizeRecoveryEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateRecoveryEmail(value) {
  const email = normalizeRecoveryEmail(value);
  if (email.length === 0 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return 'Escribe un correo válido.';
  }
  return null;
}

function validateNewPassword({ password, confirmation }) {
  if (typeof password !== 'string' || Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (Array.from(password).length > MAX_PASSWORD_LENGTH) {
    return `Usa como máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/\S/.test(password)) {
    return 'La contraseña no puede contener solo espacios.';
  }
  if (password !== confirmation) {
    return 'Las contraseñas no coinciden.';
  }
  return null;
}

function readParameter(queryParameters, hashParameters, name) {
  return queryParameters.get(name) || hashParameters.get(name) || '';
}

function parsePasswordRecoveryUrl(value) {
  if (typeof value !== 'string' || value.length > 16384) {
    return { errorCode: 'invalid_recovery_link' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    return { errorCode: 'invalid_recovery_link' };
  }

  if (
    parsedUrl.protocol !== 'hexis:' ||
    parsedUrl.hostname !== 'auth' ||
    parsedUrl.pathname !== '/reset-password'
  ) {
    return { errorCode: 'invalid_recovery_link' };
  }

  const queryParameters = parsedUrl.searchParams;
  const hashParameters = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const providerError =
    readParameter(queryParameters, hashParameters, 'error') ||
    readParameter(queryParameters, hashParameters, 'error_code');
  if (providerError) {
    return { errorCode: 'recovery_link_rejected' };
  }

  const type = readParameter(queryParameters, hashParameters, 'type');
  if (type && type !== 'recovery') {
    return { errorCode: 'invalid_recovery_link' };
  }

  const code = queryParameters.get('code') || '';
  if (code) {
    return { mode: 'pkce', code };
  }

  return { errorCode: 'invalid_recovery_link' };
}

module.exports = {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_REDIRECT_URL,
  normalizeRecoveryEmail,
  parsePasswordRecoveryUrl,
  validateNewPassword,
  validateRecoveryEmail,
};
