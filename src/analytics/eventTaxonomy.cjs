'use strict';

const EVENT_TAXONOMY_VERSION = 1;

const PRODUCT_EVENT_NAMES = Object.freeze([
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

function enumProperty(values) {
  return Object.freeze({ type: 'enum', values: Object.freeze([...values]), required: true });
}

function integerProperty(min, max) {
  return Object.freeze({ type: 'integer', min, max, required: true });
}

function booleanProperty() {
  return Object.freeze({ type: 'boolean', required: true });
}

const EVENT_SCHEMAS = Object.freeze({
  onboarding_started: Object.freeze({
    entry_point: enumProperty(['signup', 'resume']),
  }),
  identity_defined: Object.freeze({
    definition_mode: enumProperty(['preset', 'custom']),
  }),
  plan_created: Object.freeze({
    commitment_count: integerProperty(1, 3),
    reminder_count: integerProperty(0, 3),
  }),
  checkin_recorded: Object.freeze({
    completion_level: enumProperty(['minimum', 'full']),
    sync_state: enumProperty(['confirmed', 'offline_queued']),
  }),
  checkin_sync_failed: Object.freeze({
    failure_class: enumProperty(['network', 'timeout', 'server', 'conflict', 'unknown']),
    retryable: booleanProperty(),
    attempt_bucket: enumProperty(['first', 'retry', 'exhausted']),
  }),
  weekly_review_completed: Object.freeze({
    decision: enumProperty(['keep', 'reduce', 'increase', 'replace']),
    consistency_band: enumProperty(['insufficient', 'low', 'medium', 'high']),
  }),
  plan_adjusted: Object.freeze({
    adjustment_type: enumProperty([
      'reduce',
      'increase',
      'replace',
      'pause',
      'reactivate',
      'archive',
      'schedule',
    ]),
    active_commitment_count: integerProperty(0, 3),
  }),
  export_requested: Object.freeze({
    network_state: enumProperty(['online', 'offline', 'unknown']),
  }),
  account_deleted: Object.freeze({
    local_cleanup: enumProperty(['complete', 'residuals_detected']),
  }),
});

const EVENT_NAME_SET = new Set(PRODUCT_EVENT_NAMES);

const FORBIDDEN_KEY_PARTS = Object.freeze([
  'email',
  'e_mail',
  'mail_address',
  'name',
  'nombre',
  'identity_text',
  'identity_statement',
  'identidad_texto',
  'habit',
  'habito',
  'commitment_title',
  'note',
  'nota',
  'weight',
  'peso',
  'photo',
  'foto',
  'image',
  'imagen',
  'metric_value',
  'physical_value',
  'measurement',
  'medida',
  'phone',
  'telefono',
  'address',
  'direccion',
  'user_id',
  'account_id',
  'device_id',
  'ip_address',
  'token',
  'password',
  'contrasena',
]);

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const PHONE_PATTERN = /^\+?[\d ()-]{7,}$/;

function normalizeKey(key) {
  return key
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function isForbiddenKey(key) {
  const normalized = normalizeKey(key);
  return FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part));
}

function looksLikePii(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return EMAIL_PATTERN.test(trimmed)
    || UUID_PATTERN.test(trimmed)
    || URL_PATTERN.test(trimmed)
    || IPV4_PATTERN.test(trimmed)
    || PHONE_PATTERN.test(trimmed);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(reason) {
  return Object.freeze({ valid: false, reason });
}

function validEvent(name, properties) {
  const event = Object.freeze({
    name,
    properties: Object.freeze({ ...properties }),
    taxonomyVersion: EVENT_TAXONOMY_VERSION,
  });
  return Object.freeze({ valid: true, reason: 'valid', event });
}

function validatePropertyValue(rule, value) {
  if (value !== null && typeof value === 'object') return 'nested_value_not_allowed';
  if (looksLikePii(value)) return 'pii_value';

  if (rule.type === 'enum') {
    if (typeof value !== 'string') return 'invalid_property_type';
    if (!rule.values.includes(value)) return 'free_text_not_allowed';
    return null;
  }

  if (rule.type === 'integer') {
    if (!Number.isInteger(value)) return 'invalid_property_type';
    if (value < rule.min || value > rule.max) return 'invalid_property_value';
    return null;
  }

  if (rule.type === 'boolean') {
    return typeof value === 'boolean' ? null : 'invalid_property_type';
  }

  return 'invalid_property_type';
}

function validateProductEvent(name, properties = {}) {
  try {
    if (typeof name !== 'string' || !EVENT_NAME_SET.has(name)) return invalid('unknown_event');
    if (!isPlainRecord(properties)) return invalid('invalid_properties');

    const schema = EVENT_SCHEMAS[name];
    const keys = Reflect.ownKeys(properties);

    for (const key of keys) {
      if (typeof key !== 'string') return invalid('unknown_property');
      if (isForbiddenKey(key)) return invalid('pii_key');
      if (!Object.hasOwn(schema, key)) return invalid('unknown_property');

      const descriptor = Object.getOwnPropertyDescriptor(properties, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return invalid('invalid_properties');
      }

      const reason = validatePropertyValue(schema[key], descriptor.value);
      if (reason) return invalid(reason);
    }

    for (const [key, rule] of Object.entries(schema)) {
      if (rule.required && !Object.hasOwn(properties, key)) return invalid('missing_property');
    }

    return validEvent(name, properties);
  } catch {
    return invalid('invalid_properties');
  }
}

let analyticsSink = null;

function configureAnalyticsSink(nextSink) {
  if (nextSink === null) {
    analyticsSink = null;
    return Object.freeze({ configured: false, reason: 'disabled' });
  }
  if (typeof nextSink !== 'function') {
    analyticsSink = null;
    return Object.freeze({ configured: false, reason: 'invalid_sink' });
  }
  analyticsSink = nextSink;
  return Object.freeze({ configured: true, reason: 'configured' });
}

async function trackProductEvent(name, properties = {}) {
  const validation = validateProductEvent(name, properties);
  if (!validation.valid) {
    return Object.freeze({ delivered: false, reason: validation.reason });
  }

  const sink = analyticsSink;
  if (!sink) return Object.freeze({ delivered: false, reason: 'disabled' });

  try {
    const result = await sink(validation.event);
    if (result === false) return Object.freeze({ delivered: false, reason: 'sink_rejected' });
    return Object.freeze({ delivered: true, reason: 'delivered' });
  } catch {
    return Object.freeze({ delivered: false, reason: 'sink_failed' });
  }
}

module.exports = {
  EVENT_SCHEMAS,
  EVENT_TAXONOMY_VERSION,
  PRODUCT_EVENT_NAMES,
  configureAnalyticsSink,
  trackProductEvent,
  validateProductEvent,
};
