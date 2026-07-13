'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isRetryableTransportError } = require('../src/lib/networkErrors.cjs');

test('solo clasifica transportes y respuestas transitorias como reintentables', () => {
  assert.equal(isRetryableTransportError(new TypeError('Network request failed')), true);
  assert.equal(isRetryableTransportError({ status: 503, message: 'Unavailable' }), true);
  assert.equal(isRetryableTransportError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableTransportError({ status: 401, message: 'Unauthorized' }), false);
  assert.equal(isRetryableTransportError({ code: '42501', message: 'RLS denied' }), false);
  assert.equal(isRetryableTransportError({ code: 'HX409', message: 'Conflict' }), false);
});
