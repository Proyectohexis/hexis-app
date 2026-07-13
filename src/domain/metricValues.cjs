'use strict';

const { parseDateKey } = require('./dateKeys.cjs');

const DECIMAL_PATTERN = /^-?\d{1,10}(?:[.,]\d{1,4})?$/;

function parseMetricValue(input) {
  if (typeof input !== 'string') return Number.NaN;
  const normalized = input.trim().replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) return Number.NaN;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validateMetricEntry({ valueText, localDate, note = '', minValue, maxValue, maxDate = null }) {
  const errors = [];
  const value = parseMetricValue(valueText);

  if (!Number.isFinite(value)) {
    errors.push({ code: 'invalid_value', path: 'value', message: 'Escribe un número válido con hasta cuatro decimales.' });
  } else if (value < Number(minValue) || value > Number(maxValue)) {
    errors.push({
      code: 'out_of_range',
      path: 'value',
      message: `El valor debe estar entre ${minValue} y ${maxValue}.`,
    });
  }

  try {
    parseDateKey(localDate, 'local_date');
    if (maxDate) {
      parseDateKey(maxDate, 'max_date');
      if (localDate > maxDate) {
        errors.push({ code: 'future_date', path: 'local_date', message: 'La fecha no puede estar en el futuro.' });
      }
    }
  } catch {
    errors.push({ code: 'invalid_date', path: 'local_date', message: 'La fecha debe ser válida y usar YYYY-MM-DD.' });
  }

  if (typeof note !== 'string' || note.trim().length > 500) {
    errors.push({ code: 'invalid_note', path: 'note', message: 'La nota no puede superar 500 caracteres.' });
  }

  return { errors, valid: errors.length === 0, value };
}

module.exports = { parseMetricValue, validateMetricEntry };
