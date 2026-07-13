'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitUtf8Chunks, utf8ByteLength } = require('../src/lib/utf8Chunks.cjs');

test('calcula bytes UTF-8, no solo caracteres JavaScript', () => {
  assert.equal(utf8ByteLength('abc'), 3);
  assert.equal(utf8ByteLength('á'), 2);
  assert.equal(utf8ByteLength('🜁'), 4);
});

test('ningún chunk excede el límite de bytes y el valor se reconstruye', () => {
  const original = 'á'.repeat(8) + '🜁'.repeat(4) + 'abc';
  const chunks = splitUtf8Chunks(original, 12);
  assert.equal(chunks.join(''), original);
  assert.ok(chunks.every((chunk) => utf8ByteLength(chunk) <= 12));
});

test('un valor vacío produce un chunk válido', () => {
  assert.deepEqual(splitUtf8Chunks('', 8), ['']);
});
