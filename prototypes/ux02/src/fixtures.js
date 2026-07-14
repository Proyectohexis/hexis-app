'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

const PROTOTYPE_VERSION = 'UX02-PROT-v0.2';
const ARTIFACT_DATE = '13 de julio de 2026';

const REFLECTION_OPTIONS = deepFreeze([
  {
    id: 'prepared',
    label: 'Me ayudó dejar el material preparado.',
  },
  {
    id: 'schedule_changed',
    label: 'Una interrupción cambió el horario previsto.',
  },
  {
    id: 'small_start',
    label: 'Empezar por una acción pequeña facilitó continuar.',
  },
]);

const DAYS = deepFreeze([
  { id: 'monday', short: 'Lun', label: 'lunes' },
  { id: 'tuesday', short: 'Mar', label: 'martes' },
  { id: 'wednesday', short: 'Mié', label: 'miércoles' },
  { id: 'thursday', short: 'Jue', label: 'jueves' },
  { id: 'friday', short: 'Vie', label: 'viernes' },
  { id: 'saturday', short: 'Sáb', label: 'sábado' },
  { id: 'sunday', short: 'Dom', label: 'domingo' },
]);

const DECISIONS = deepFreeze([
  {
    id: 'keep',
    label: 'Mantener',
    description: 'Continuará con la misma configuración.',
  },
  {
    id: 'reduce',
    label: 'Reducir',
    description: 'Menos días, una acción mínima más pequeña o ambos.',
  },
  {
    id: 'increase',
    label: 'Aumentar',
    description: 'Más días programados.',
  },
  {
    id: 'replace',
    label: 'Sustituir',
    description: 'Otra acción ocupará su lugar.',
  },
]);

const REDUCE_MODES = deepFreeze([
  {
    id: 'schedule',
    label: 'Menos días',
    description: 'Conservar la acción mínima y reducir la frecuencia.',
  },
  {
    id: 'minimum_action',
    label: 'Acción mínima más pequeña',
    description: 'Conservar los días y hacer más pequeño el primer paso.',
  },
  {
    id: 'both',
    label: 'Ambos',
    description: 'Reducir los días y también la acción mínima.',
  },
]);

const METRIC_STATES = deepFreeze([
  {
    id: 'not_configured',
    label: 'Sin métrica configurada',
    variantId: 'UX02-METRIC-NOT-CONFIGURED-v1',
  },
  {
    id: 'no_records',
    label: 'Sin registros',
    variantId: 'UX02-METRIC-NO-RECORDS-v1',
  },
  {
    id: 'one_record',
    label: 'Un registro',
    variantId: 'UX02-METRIC-ONE-RECORD-v1',
  },
  {
    id: 'two_or_more',
    label: 'Dos o más registros',
    variantId: 'UX02-METRIC-TWO-PLUS-v1',
  },
  {
    id: 'unavailable',
    label: 'No disponible',
    variantId: 'UX02-METRIC-UNAVAILABLE-v1',
  },
]);

const SIMULATIONS = deepFreeze([
  {
    id: 'stable',
    label: 'Camino principal',
    variantId: 'UX02-STATE-STABLE-v1',
  },
  {
    id: 'offline',
    label: 'Conexión perdida al confirmar',
    variantId: 'UX02-STATE-OFFLINE-v1',
  },
  {
    id: 'conflict',
    label: 'Configuración cambió',
    variantId: 'UX02-STATE-CONFLICT-v1',
  },
  {
    id: 'rollover',
    label: 'Cambió la fecha civil',
    variantId: 'UX02-STATE-ROLLOVER-v1',
  },
]);

const SCENARIOS = deepFreeze({
  learning: {
    id: 'UX02-SC-A-APRENDER-v1',
    teamLabel: 'A · Aprendizaje',
    timezone: 'America/Panama',
    reviewDate: {
      iso: '2026-07-13',
      full: 'lunes 13 de julio de 2026',
    },
    rolloverReviewDate: {
      iso: '2026-07-14',
      full: 'martes 14 de julio de 2026',
    },
    effectiveDate: {
      iso: '2026-07-14',
      full: 'martes 14 de julio de 2026',
    },
    rolloverDate: {
      iso: '2026-07-15',
      full: 'miércoles 15 de julio de 2026',
    },
    weekLabel: '6–12 de julio de 2026',
    identity: 'Soy una persona que protege tiempo para aprender',
    goal: 'Terminar un curso introductorio durante ocho semanas',
    commitment: {
      id: 'commitment-learning',
      sourceVersion: 1,
      name: 'Estudiar',
      minimumAction: 'Abrir la lección y leer un apartado',
      scheduledDays: ['monday', 'wednesday', 'friday'],
      evidence: [
        { day: 'lunes', state: 'completa' },
        { day: 'miércoles', state: 'mínima' },
        { day: 'viernes', state: 'sin registro' },
      ],
    },
    conflictUpdate: {
      sourceVersion: 2,
      minimumAction: 'Abrir la lección y responder una pregunta',
      scheduledDays: ['monday', 'thursday', 'friday'],
      summary: 'La acción mínima cambió y el día miércoles pasó al jueves.',
    },
    reducedMinimumActions: [
      'Abrir la lección',
      'Leer un párrafo',
    ],
    replacementOptions: [
      {
        id: 'learning-practice',
        name: 'Practicar ejercicios',
        minimumAction: 'Resolver un ejercicio guiado',
        scheduledDays: ['tuesday', 'thursday'],
      },
      {
        id: 'learning-recap',
        name: 'Repasar conceptos',
        minimumAction: 'Leer una tarjeta de repaso',
        scheduledDays: ['saturday'],
      },
    ],
    metric: {
      name: 'Lecciones terminadas',
      unit: 'lecciones',
      records: [
        { day: 'lunes', value: 4 },
        { day: 'domingo', value: 5 },
      ],
    },
  },
  strength: {
    id: 'UX02-SC-B-FUERZA-v1',
    teamLabel: 'B · Disciplina física',
    timezone: 'America/Panama',
    reviewDate: {
      iso: '2026-07-13',
      full: 'lunes 13 de julio de 2026',
    },
    rolloverReviewDate: {
      iso: '2026-07-14',
      full: 'martes 14 de julio de 2026',
    },
    effectiveDate: {
      iso: '2026-07-14',
      full: 'martes 14 de julio de 2026',
    },
    rolloverDate: {
      iso: '2026-07-15',
      full: 'miércoles 15 de julio de 2026',
    },
    weekLabel: '6–12 de julio de 2026',
    identity: 'Soy una persona que entrena con constancia',
    goal: 'Completar un ciclo básico de fuerza durante ocho semanas',
    commitment: {
      id: 'commitment-strength',
      sourceVersion: 1,
      name: 'Entrenamiento de fuerza',
      minimumAction: 'Hacer el calentamiento y una serie técnica',
      scheduledDays: ['tuesday', 'thursday', 'saturday'],
      evidence: [
        { day: 'martes', state: 'completa' },
        { day: 'jueves', state: 'mínima' },
        { day: 'sábado', state: 'sin registro' },
      ],
    },
    conflictUpdate: {
      sourceVersion: 2,
      minimumAction: 'Completar el calentamiento y dos series técnicas',
      scheduledDays: ['tuesday', 'friday', 'saturday'],
      summary: 'La acción mínima cambió y el día jueves pasó al viernes.',
    },
    reducedMinimumActions: [
      'Preparar el espacio',
      'Hacer un movimiento de calentamiento',
    ],
    replacementOptions: [
      {
        id: 'strength-mobility',
        name: 'Movilidad',
        minimumAction: 'Completar un movimiento suave',
        scheduledDays: ['monday', 'friday'],
      },
      {
        id: 'strength-walk',
        name: 'Caminata breve',
        minimumAction: 'Caminar cinco minutos',
        scheduledDays: ['sunday'],
      },
    ],
    metric: {
      name: 'Minutos de entrenamiento',
      unit: 'minutos',
      records: [
        { day: 'martes', value: 20 },
        { day: 'domingo', value: 25 },
      ],
    },
  },
});

module.exports = {
  ARTIFACT_DATE,
  DAYS,
  DECISIONS,
  METRIC_STATES,
  PROTOTYPE_VERSION,
  REDUCE_MODES,
  REFLECTION_OPTIONS,
  SCENARIOS,
  SIMULATIONS,
  deepFreeze,
};
