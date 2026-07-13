'use strict';

function assertValidDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('Se esperaba una fecha válida.');
  }
}

function assertDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError('La fecha debe usar el formato YYYY-MM-DD.');
  }
}

function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getDateKeyInTimeZone(date = new Date(), timeZone = getDeviceTimeZone()) {
  assertValidDate(date);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateKey(dateKey, amount) {
  assertDateKey(dateKey);
  if (!Number.isInteger(amount)) {
    throw new TypeError('La cantidad de días debe ser un entero.');
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getDeviceTimeZone,
};
