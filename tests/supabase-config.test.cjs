'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSupabaseConfiguration } = require('../src/lib/supabaseConfig.cjs');

const validUrl = 'https://abcdefghijklmnopqrst.supabase.co';

function legacyJwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature`;
}

test('acepta solamente URL HTTPS y publishable key', () => {
  assert.equal(validateSupabaseConfiguration({
    url: validUrl,
    publishableKey: 'sb_publishable_example',
  }), null);
});

test('rechaza una secret key antes de que llegue al bundle operativo', () => {
  assert.match(validateSupabaseConfiguration({
    url: validUrl,
    publishableKey: 'sb_secret_example',
  }), /clave secreta/);
});

test('rechaza JWT legacy porque podría ser service_role', () => {
  assert.match(validateSupabaseConfiguration({
    url: validUrl,
    publishableKey: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
  }), /JWT legacy/);
});

test('permite el anon JWT únicamente contra Supabase local con opt-in explícito', () => {
  assert.equal(validateSupabaseConfiguration({
    url: 'http://127.0.0.1:54321',
    publishableKey: legacyJwt('anon'),
    allowLocalDevelopment: true,
  }), null);

  assert.match(validateSupabaseConfiguration({
    url: 'http://127.0.0.1:54321',
    publishableKey: legacyJwt('service_role'),
    allowLocalDevelopment: true,
  }), /JWT legacy/);

  assert.match(validateSupabaseConfiguration({
    url: 'http://example.com:54321',
    publishableKey: legacyJwt('anon'),
    allowLocalDevelopment: true,
  }), /host administrado/);
});

test('rechaza hosts o protocolos inesperados', () => {
  assert.match(validateSupabaseConfiguration({
    url: 'http://example.com',
    publishableKey: 'sb_publishable_example',
  }), /HTTPS/);
  assert.match(validateSupabaseConfiguration({
    url: 'https://example.com',
    publishableKey: 'sb_publishable_example',
  }), /host administrado/);
});
