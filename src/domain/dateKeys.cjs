'use strict';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey, label = 'dateKey') {
  if (typeof dateKey !== 'string') {
    throw new TypeError(`${label} debe usar el formato YYYY-MM-DD.`);
  }

  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new TypeError(`${label} debe usar el formato YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // setUTCFullYear evita la conversion especial de Date.UTC para anos 00-99.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const timestamp = date.getTime();

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${label} no representa una fecha civil valida.`);
  }

  return { dateKey, day, month, timestamp, year };
}

function assertDateRange(from, through) {
  const start = parseDateKey(from, 'from');
  const end = parseDateKey(through, 'through');
  if (start.timestamp > end.timestamp) {
    throw new RangeError('from no puede ser posterior a through.');
  }
  return { end, start };
}

function addDays(dateKey, amount) {
  const parsed = parseDateKey(dateKey);
  if (!Number.isInteger(amount)) {
    throw new TypeError('amount debe ser un entero.');
  }
  return new Date(parsed.timestamp + amount * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function differenceInDays(from, through) {
  const { start, end } = assertDateRange(from, through);
  return (end.timestamp - start.timestamp) / MILLISECONDS_PER_DAY;
}

function enumerateDateKeys(from, through) {
  const days = differenceInDays(from, through);
  return Array.from({ length: days + 1 }, (_, index) => addDays(from, index));
}

function weekdayOf(dateKey) {
  return new Date(parseDateKey(dateKey).timestamp).getUTCDay();
}

function startOfIsoWeek(dateKey) {
  const weekday = weekdayOf(dateKey);
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addDays(dateKey, -daysSinceMonday);
}

function endOfIsoWeek(dateKey) {
  return addDays(startOfIsoWeek(dateKey), 6);
}

module.exports = {
  addDays,
  assertDateRange,
  differenceInDays,
  endOfIsoWeek,
  enumerateDateKeys,
  parseDateKey,
  startOfIsoWeek,
  weekdayOf,
};
