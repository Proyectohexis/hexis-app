'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { colors } = require('../src/theme/palette.cjs');

function luminance(hex) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const normalTextPairs = [
  ['primary text / primary background', colors.text.primary, colors.background.primary],
  ['secondary text / primary background', colors.text.secondary, colors.background.primary],
  ['tertiary text / card', colors.text.tertiary, colors.background.card],
  ['inverse text / gold button', colors.text.inverse, colors.accent.primary],
  ['error / primary background', colors.error, colors.background.primary],
  ['success / primary background', colors.success, colors.background.primary],
  ['light gold / muted gold', colors.accent.light, colors.accent.muted],
];

for (const [name, foreground, background] of normalTextPairs) {
  test(`${name} alcanza contraste 4.5:1`, () => {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${name} solo alcanza ${contrast(foreground, background).toFixed(2)}:1`
    );
  });
}

const controlBoundaryPairs = [
  ['default border / card', colors.border.default, colors.background.card],
  ['default border / secondary background', colors.border.default, colors.background.secondary],
  ['strong border / primary background', colors.border.strong, colors.background.primary],
];

for (const [name, foreground, background] of controlBoundaryPairs) {
  test(`${name} alcanza contraste no textual 3:1`, () => {
    assert.ok(
      contrast(foreground, background) >= 3,
      `${name} solo alcanza ${contrast(foreground, background).toFixed(2)}:1`
    );
  });
}
