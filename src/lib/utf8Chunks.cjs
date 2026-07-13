'use strict';

function utf8BytesForCodePoint(codePoint) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function utf8ByteLength(value) {
  let total = 0;
  for (const character of String(value)) {
    total += utf8BytesForCodePoint(character.codePointAt(0));
  }
  return total;
}

function splitUtf8Chunks(value, maximumBytes) {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 4) {
    throw new TypeError('maximumBytes debe ser un entero de al menos 4.');
  }

  const chunks = [];
  let current = '';
  let currentBytes = 0;

  for (const character of String(value)) {
    const characterBytes = utf8BytesForCodePoint(character.codePointAt(0));
    if (current && currentBytes + characterBytes > maximumBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }

  chunks.push(current);
  return chunks;
}

module.exports = {
  splitUtf8Chunks,
  utf8ByteLength,
};
