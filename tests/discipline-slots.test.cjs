'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { firstAvailableActivePosition } = require('../src/screens/discipline/disciplineSlots.cjs');

test('elige el primer slot activo libre aunque existan pausados o huecos', () => {
  assert.equal(firstAvailableActivePosition([
    { status: 'active', position: 0 },
    { status: 'paused', position: 1 },
    { status: 'active', position: 2 },
  ]), 1);
});

test('no ofrece un cuarto slot cuando 0..2 están ocupados', () => {
  assert.equal(firstAvailableActivePosition([
    { status: 'active', position: 2 },
    { status: 'active', position: 0 },
    { status: 'active', position: 1 },
  ]), null);
});

test('un cierre programado para mañana mantiene ocupado el slot de hoy', () => {
  assert.equal(firstAvailableActivePosition([
    { status: 'paused', effective_status: 'active', position: 0 },
    { status: 'active', position: 2 },
  ]), 1);
});

test('un alta futura reserva su slot para evitar un solapamiento posterior', () => {
  assert.equal(firstAvailableActivePosition([
    { status: 'active', effective_status: 'scheduled', position: 0 },
    { status: 'active', position: 1 },
  ]), 2);
});
