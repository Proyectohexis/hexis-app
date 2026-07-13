'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVENT_SCHEMAS,
  EVENT_TAXONOMY_VERSION,
  PRODUCT_EVENT_NAMES,
  configureAnalyticsSink,
  trackProductEvent,
  validateProductEvent,
} = require('../src/analytics/eventTaxonomy.cjs');

const validFixtures = Object.freeze({
  onboarding_started: { entry_point: 'signup' },
  identity_defined: { definition_mode: 'preset' },
  plan_created: { commitment_count: 3, reminder_count: 2 },
  checkin_recorded: { completion_level: 'minimum', sync_state: 'offline_queued' },
  checkin_sync_failed: { failure_class: 'network', retryable: true, attempt_bucket: 'retry' },
  weekly_review_completed: { decision: 'keep', consistency_band: 'medium' },
  plan_adjusted: { adjustment_type: 'schedule', active_commitment_count: 2 },
  export_requested: { network_state: 'online' },
  account_deleted: { local_cleanup: 'complete' },
});

test('la allowlist coincide exactamente con los nueve eventos del PRD', () => {
  assert.equal(EVENT_TAXONOMY_VERSION, 1);
  assert.deepEqual(PRODUCT_EVENT_NAMES, [
    'onboarding_started',
    'identity_defined',
    'plan_created',
    'checkin_recorded',
    'checkin_sync_failed',
    'weekly_review_completed',
    'plan_adjusted',
    'export_requested',
    'account_deleted',
  ]);
  assert.deepEqual(Object.keys(EVENT_SCHEMAS), PRODUCT_EVENT_NAMES);
  assert.equal(Object.isFrozen(PRODUCT_EVENT_NAMES), true);
  assert.equal(Object.isFrozen(EVENT_SCHEMAS), true);
});

test('acepta un payload mínimo válido de cada evento y congela la salida', () => {
  for (const eventName of PRODUCT_EVENT_NAMES) {
    const result = validateProductEvent(eventName, validFixtures[eventName]);
    assert.equal(result.valid, true, `${eventName}: ${result.reason}`);
    assert.equal(result.event.name, eventName);
    assert.equal(result.event.taxonomyVersion, 1);
    assert.deepEqual(result.event.properties, validFixtures[eventName]);
    assert.equal(Object.isFrozen(result.event), true);
    assert.equal(Object.isFrozen(result.event.properties), true);
  }
});

test('cada enum, booleano y límite numérico declarado es ejecutable', () => {
  for (const eventName of PRODUCT_EVENT_NAMES) {
    for (const [propertyName, rule] of Object.entries(EVENT_SCHEMAS[eventName])) {
      if (rule.type === 'enum') {
        for (const value of rule.values) {
          const result = validateProductEvent(eventName, {
            ...validFixtures[eventName],
            [propertyName]: value,
          });
          assert.equal(result.valid, true, `${eventName}.${propertyName}=${value}`);
        }
      } else if (rule.type === 'boolean') {
        for (const value of [true, false]) {
          const result = validateProductEvent(eventName, {
            ...validFixtures[eventName],
            [propertyName]: value,
          });
          assert.equal(result.valid, true, `${eventName}.${propertyName}=${value}`);
        }
      } else if (rule.type === 'integer') {
        for (const value of [rule.min, rule.max]) {
          const result = validateProductEvent(eventName, {
            ...validFixtures[eventName],
            [propertyName]: value,
          });
          assert.equal(result.valid, true, `${eventName}.${propertyName}=${value}`);
        }
        assert.equal(validateProductEvent(eventName, {
          ...validFixtures[eventName],
          [propertyName]: rule.min - 1,
        }).reason, 'invalid_property_value');
        assert.equal(validateProductEvent(eventName, {
          ...validFixtures[eventName],
          [propertyName]: rule.max + 1,
        }).reason, 'invalid_property_value');
      }
    }
  }
});

test('rechaza eventos desconocidos, reservados y nombres de tipo incorrecto', () => {
  assert.deepEqual(validateProductEvent('paywall_viewed', {}), { valid: false, reason: 'unknown_event' });
  assert.deepEqual(validateProductEvent('subscription_started', {}), { valid: false, reason: 'unknown_event' });
  assert.deepEqual(validateProductEvent('checkin_recorded_v2', {}), { valid: false, reason: 'unknown_event' });
  assert.deepEqual(validateProductEvent(null, {}), { valid: false, reason: 'unknown_event' });
});

test('rechaza claves desconocidas y propiedades requeridas ausentes', () => {
  assert.deepEqual(
    validateProductEvent('onboarding_started', { entry_point: 'signup', platform: 'android' }),
    { valid: false, reason: 'unknown_property' },
  );
  for (const eventName of PRODUCT_EVENT_NAMES) {
    assert.deepEqual(
      validateProductEvent(eventName, {}),
      { valid: false, reason: 'missing_property' },
      eventName,
    );
  }
});

test('rechaza contenedores, objetos anidados, arrays, null y accessors', () => {
  assert.deepEqual(validateProductEvent('onboarding_started', null), {
    valid: false,
    reason: 'invalid_properties',
  });
  assert.deepEqual(validateProductEvent('onboarding_started', []), {
    valid: false,
    reason: 'invalid_properties',
  });
  assert.deepEqual(validateProductEvent('onboarding_started', { entry_point: { value: 'signup' } }), {
    valid: false,
    reason: 'nested_value_not_allowed',
  });
  assert.deepEqual(validateProductEvent('onboarding_started', { entry_point: ['signup'] }), {
    valid: false,
    reason: 'nested_value_not_allowed',
  });
  const accessor = {};
  Object.defineProperty(accessor, 'entry_point', { enumerable: true, get: () => 'signup' });
  assert.deepEqual(validateProductEvent('onboarding_started', accessor), {
    valid: false,
    reason: 'invalid_properties',
  });
  const hidden = {};
  Object.defineProperty(hidden, 'entry_point', { enumerable: false, value: 'signup' });
  assert.deepEqual(validateProductEvent('onboarding_started', hidden), {
    valid: false,
    reason: 'invalid_properties',
  });
});

test('rechaza claves PII aunque el resto del payload sea válido', () => {
  const forbiddenKeys = [
    'email',
    'nombre',
    'identity_text',
    'habit_name',
    'notes',
    'peso',
    'photo_url',
    'metric_value',
    'user_id',
    'device-id',
    'password',
  ];
  for (const key of forbiddenKeys) {
    assert.deepEqual(
      validateProductEvent('onboarding_started', { entry_point: 'signup', [key]: 'redacted' }),
      { valid: false, reason: 'pii_key' },
      key,
    );
  }
});

test('rechaza valores con patrones PII antes de aceptar cualquier texto', () => {
  const sensitiveValues = [
    'persona@example.com',
    'signup persona@example.com',
    'https://example.com/perfil/maria',
    '550e8400-e29b-41d4-a716-446655440000',
    '192.168.0.3',
    '+507 6000-0000',
  ];
  for (const value of sensitiveValues) {
    assert.deepEqual(
      validateProductEvent('onboarding_started', { entry_point: value }),
      { valid: false, reason: 'pii_value' },
      value,
    );
  }
});

test('rechaza texto libre y enums con capitalización o espacios distintos', () => {
  for (const value of ['campaña de julio', 'Signup', 'signup ', '', 'María']) {
    assert.deepEqual(
      validateProductEvent('onboarding_started', { entry_point: value }),
      { valid: false, reason: 'free_text_not_allowed' },
      value,
    );
  }
});

test('aplica tipos y rangos exactos a conteos y booleanos', () => {
  assert.equal(validateProductEvent('plan_created', { commitment_count: 1, reminder_count: 0 }).valid, true);
  assert.equal(validateProductEvent('plan_created', { commitment_count: 3, reminder_count: 3 }).valid, true);
  assert.deepEqual(
    validateProductEvent('plan_created', { commitment_count: 0, reminder_count: 0 }),
    { valid: false, reason: 'invalid_property_value' },
  );
  assert.deepEqual(
    validateProductEvent('plan_created', { commitment_count: 4, reminder_count: 0 }),
    { valid: false, reason: 'invalid_property_value' },
  );
  assert.deepEqual(
    validateProductEvent('plan_created', { commitment_count: 2.5, reminder_count: 0 }),
    { valid: false, reason: 'invalid_property_type' },
  );
  assert.deepEqual(
    validateProductEvent('plan_created', { commitment_count: 2, reminder_count: Number.NaN }),
    { valid: false, reason: 'invalid_property_type' },
  );
  assert.deepEqual(
    validateProductEvent('checkin_sync_failed', {
      failure_class: 'network', retryable: 'true', attempt_bucket: 'first',
    }),
    { valid: false, reason: 'invalid_property_type' },
  );
});

test('la analítica está deshabilitada por defecto y valida antes del no-op', async () => {
  configureAnalyticsSink(null);
  assert.deepEqual(
    await trackProductEvent('onboarding_started', validFixtures.onboarding_started),
    { delivered: false, reason: 'disabled' },
  );
  assert.deepEqual(
    await trackProductEvent('evento_inventado', {}),
    { delivered: false, reason: 'unknown_event' },
  );
});

test('un sink inyectado recibe solo el evento validado, sin IDs ni campos automáticos', async () => {
  const received = [];
  assert.deepEqual(configureAnalyticsSink(async (event) => received.push(event)), {
    configured: true,
    reason: 'configured',
  });

  assert.deepEqual(
    await trackProductEvent('plan_created', validFixtures.plan_created),
    { delivered: true, reason: 'delivered' },
  );
  assert.deepEqual(received, [{
    name: 'plan_created',
    properties: { commitment_count: 3, reminder_count: 2 },
    taxonomyVersion: 1,
  }]);
  assert.deepEqual(Object.keys(received[0]).sort(), ['name', 'properties', 'taxonomyVersion']);
  configureAnalyticsSink(null);
});

test('un sink inválido desactiva el anterior y un rechazo explícito falla cerrado', async () => {
  let calls = 0;
  configureAnalyticsSink(() => { calls += 1; });
  assert.deepEqual(configureAnalyticsSink({ send() {} }), {
    configured: false,
    reason: 'invalid_sink',
  });
  assert.deepEqual(
    await trackProductEvent('identity_defined', validFixtures.identity_defined),
    { delivered: false, reason: 'disabled' },
  );
  assert.equal(calls, 0);

  configureAnalyticsSink(() => false);
  assert.deepEqual(
    await trackProductEvent('identity_defined', validFixtures.identity_defined),
    { delivered: false, reason: 'sink_rejected' },
  );
  configureAnalyticsSink(null);
});

test('fallos sync/async del sink no escapan ni registran el payload', async () => {
  const originalConsole = { error: console.error, log: console.log, warn: console.warn };
  const consoleCalls = [];
  console.error = (...args) => consoleCalls.push(args);
  console.log = (...args) => consoleCalls.push(args);
  console.warn = (...args) => consoleCalls.push(args);

  try {
    configureAnalyticsSink(() => { throw new Error('provider unavailable'); });
    assert.deepEqual(
      await trackProductEvent('export_requested', validFixtures.export_requested),
      { delivered: false, reason: 'sink_failed' },
    );
    configureAnalyticsSink(async () => Promise.reject(new Error('network unavailable')));
    assert.deepEqual(
      await trackProductEvent('account_deleted', validFixtures.account_deleted),
      { delivered: false, reason: 'sink_failed' },
    );
    assert.equal(consoleCalls.length, 0);
  } finally {
    configureAnalyticsSink(null);
    console.error = originalConsole.error;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }
});
