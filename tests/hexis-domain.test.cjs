'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SEC_METRIC_VERSION,
  addDays,
  calculateConsistency,
  calculateSecRate,
  deriveCompletionState,
  deriveCompletionStates,
  endOfIsoWeek,
  evaluateWeeklyReviewEligibility,
  evaluateSecWeek,
  getPreviousClosedIsoWeek,
  isCommitmentScheduled,
  listScheduledOpportunities,
  parseDateKey,
  startOfIsoWeek,
  validateInitialPlan,
  validatePlan,
  weekdayOf,
} = require('../src/domain/index.cjs');

function makeCommitment(overrides = {}) {
  return {
    id: 'habit-1',
    minimum_action: 'Leer una pagina',
    name: 'Leer',
    scheduled_weekdays: [1, 3, 5],
    status: 'active',
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    commitments: [makeCommitment()],
    id: 'plan-1',
    identity_statement: 'Soy una persona que aprende cada dia',
    outcome_statement: 'Leer doce libros',
    starts_on: '2026-07-06',
    status: 'active',
    timezone: 'America/Panama',
    why_statement: 'Quiero pensar con mayor claridad',
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    completion_level: 'minimum',
    created_at: '2026-07-06T13:00:00.000Z',
    event_type: 'recorded',
    habit_id: 'habit-1',
    id: 'event-1',
    local_date: '2026-07-06',
    source: 'manual',
    ...overrides,
  };
}

function makeReview(overrides = {}) {
  return {
    created_at: '2026-07-13T13:00:00.000Z',
    plan_id: 'plan-1',
    week_start: '2026-07-06',
    ...overrides,
  };
}

test('las fechas civiles son estrictas y el calendario usa domingo=0', () => {
  assert.equal(parseDateKey('2028-02-29').dateKey, '2028-02-29');
  assert.throws(() => parseDateKey('2026-02-29'), /fecha civil/);
  assert.throws(() => parseDateKey('07-06-2026'), /YYYY-MM-DD/);
  assert.equal(weekdayOf('2026-07-05'), 0);
  assert.equal(weekdayOf('2026-07-06'), 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(startOfIsoWeek('2026-07-12'), '2026-07-06');
  assert.equal(endOfIsoWeek('2026-07-06'), '2026-07-12');
});

test('la revisión selecciona la última semana ISO cerrada en la frontera del lunes', () => {
  assert.deepEqual(getPreviousClosedIsoWeek('2026-07-12'), {
    available_on: '2026-07-06',
    week_end: '2026-07-05',
    week_start: '2026-06-29',
  });
  assert.deepEqual(getPreviousClosedIsoWeek('2026-07-13'), {
    available_on: '2026-07-13',
    week_end: '2026-07-12',
    week_start: '2026-07-06',
  });
  assert.deepEqual(getPreviousClosedIsoWeek('2027-01-04'), {
    available_on: '2027-01-04',
    week_end: '2027-01-03',
    week_start: '2026-12-28',
  });
});

test('un plan nuevo no ofrece una revisión anterior y comunica su primera fecha', () => {
  const result = evaluateWeeklyReviewEligibility({
    as_of_date: '2026-07-13',
    plan: makePlan({ starts_on: '2026-07-13' }),
    week_start: '2026-07-06',
  });

  assert.equal(result.eligible, false);
  assert.equal(result.overlaps_plan, false);
  assert.equal(result.eligibility_reason, 'week_before_plan');
  assert.equal(result.first_review_available_on, '2026-07-20');
});

test('una semana parcial es elegible cuando toca la vigencia inclusiva del plan', () => {
  const startsOnSunday = evaluateWeeklyReviewEligibility({
    as_of_date: '2026-07-13',
    plan: makePlan({ starts_on: '2026-07-12' }),
    week_start: '2026-07-06',
  });
  const endsOnMonday = evaluateWeeklyReviewEligibility({
    as_of_date: '2026-07-13',
    plan: makePlan({ ends_on: '2026-07-06', status: 'completed' }),
    week_start: '2026-07-06',
  });

  assert.equal(startsOnSunday.eligible, true);
  assert.equal(startsOnSunday.overlaps_plan, true);
  assert.equal(startsOnSunday.first_review_available_on, '2026-07-13');
  assert.equal(endsOnMonday.eligible, true);
  assert.equal(endsOnMonday.overlaps_plan, true);
});

test('una revisión nunca es elegible hasta que termine el domingo en fecha civil', () => {
  const result = evaluateWeeklyReviewEligibility({
    as_of_date: '2026-07-12',
    plan: makePlan(),
    week_start: '2026-07-06',
  });

  assert.equal(result.eligible, false);
  assert.equal(result.week_closed, false);
  assert.equal(result.eligibility_reason, 'week_not_closed');
});

test('validateInitialPlan acepta el contrato de onboarding sin IDs', () => {
  const result = validateInitialPlan({
    commitments: [
      {
        minimum_action: 'Caminar diez minutos',
        name: 'Caminar',
        reminder_time: '06:30',
        scheduled_weekdays: [1, 3, 5],
      },
    ],
    identity_statement: 'Soy una persona activa',
    outcome_statement: 'Caminar con regularidad',
    starts_on: '2026-07-13',
    timezone: 'America/Panama',
    why_statement: 'Quiero cuidar mi energia',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateInitialPlan reporta campos, frecuencia y hora sin lanzar', () => {
  const result = validateInitialPlan({
    commitments: [
      {
        minimum_action: '',
        name: '',
        reminder_time: '25:99',
        scheduled_weekdays: [1, 1, 8],
      },
    ],
    identity_statement: '',
    outcome_statement: '',
    starts_on: '2026-02-29',
    timezone: '',
    why_statement: '',
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'identity_statement'));
  assert.ok(result.errors.some((error) => error.code === 'duplicate_weekday'));
  assert.ok(result.errors.some((error) => error.code === 'invalid_weekday'));
  assert.ok(result.errors.some((error) => error.code === 'invalid_reminder_time'));
  assert.ok(result.errors.some((error) => error.code === 'invalid_date'));
});

test('un plan persistido exige entre uno y tres compromisos ejecutables', () => {
  assert.equal(validatePlan(makePlan()).valid, true);
  assert.ok(
    validatePlan(makePlan({ commitments: [] })).errors.some(
      (error) => error.code === 'commitment_count',
    ),
  );
  assert.ok(
    validatePlan(
      makePlan({
        commitments: [1, 2, 3, 4].map((number) =>
          makeCommitment({ id: `habit-${number}` }),
        ),
      }),
    ).errors.some((error) => error.code === 'commitment_count'),
  );
  assert.equal(
    validatePlan(
      makePlan({
        starts_on: '2026-04-01',
        commitments: [
          makeCommitment(),
          makeCommitment({
            id: 'habit-old-1',
            status: 'archived',
            starts_on: '2026-06-01',
            ends_on: '2026-06-30',
          }),
          makeCommitment({
            id: 'habit-old-2',
            status: 'archived',
            starts_on: '2026-05-01',
            ends_on: '2026-05-31',
          }),
          makeCommitment({
            id: 'habit-old-3',
            status: 'archived',
            starts_on: '2026-04-01',
            ends_on: '2026-04-30',
          }),
        ],
      }),
    ).valid,
    true,
  );
  assert.ok(
    validatePlan(
      makePlan({ commitments: [makeCommitment({ minimum_action: ' ' })] }),
    ).errors.some((error) => error.path === 'commitments[0].minimum_action'),
  );
});

test('la programacion respeta dias, limites, exclusiones y pausas planificadas', () => {
  const commitment = makeCommitment({
    ends_on: '2026-07-20',
    excluded_dates: ['2026-07-08'],
    pause_intervals: [{ ends_on: '2026-07-17', starts_on: '2026-07-17' }],
    starts_on: '2026-07-06',
  });

  assert.equal(isCommitmentScheduled(commitment, '2026-07-06'), true);
  assert.equal(isCommitmentScheduled(commitment, '2026-07-07'), false);
  assert.equal(isCommitmentScheduled(commitment, '2026-07-08'), false);
  assert.equal(isCommitmentScheduled(commitment, '2026-07-17'), false);
  assert.equal(isCommitmentScheduled(commitment, '2026-07-22'), false);
});

test('una versión archivada conserva oportunidades anteriores a su cierre', () => {
  const archivedVersion = makeCommitment({
    ends_on: '2026-07-10',
    id: 'habit-old',
    scheduled_weekdays: [1, 3, 5],
    starts_on: '2026-07-06',
    status: 'archived',
  });

  assert.equal(
    validatePlan(makePlan({ commitments: [makeCommitment(), archivedVersion] })).valid,
    true,
  );
  assert.equal(isCommitmentScheduled(archivedVersion, '2026-07-08'), true);
  assert.equal(isCommitmentScheduled(archivedVersion, '2026-07-13'), false);
  assert.ok(
    validatePlan(makePlan({ commitments: [makeCommitment({ status: 'paused' })] }))
      .errors.some((error) => error.code === 'inactive_boundary_required'),
  );
});

test('las oportunidades se enumeran por compromiso y fecha programada', () => {
  const plan = makePlan({
    commitments: [
      makeCommitment(),
      makeCommitment({ id: 'habit-2', scheduled_weekdays: [2] }),
    ],
  });
  const opportunities = listScheduledOpportunities({
    from: '2026-07-06',
    plan,
    through: '2026-07-12',
  });

  assert.deepEqual(opportunities, [
    { habit_id: 'habit-1', local_date: '2026-07-06' },
    { habit_id: 'habit-2', local_date: '2026-07-07' },
    { habit_id: 'habit-1', local_date: '2026-07-08' },
    { habit_id: 'habit-1', local_date: '2026-07-10' },
  ]);
});

test('el estado vigente no depende del orden de entrada y una regrabacion recupera', () => {
  const recorded = makeEvent({ id: 'event-a' });
  const retracted = makeEvent({
    completion_level: null,
    created_at: '2026-07-06T14:00:00.000Z',
    event_type: 'retracted',
    id: 'event-b',
    supersedes_event_id: 'event-a',
  });
  const rerecorded = makeEvent({
    completion_level: 'full',
    created_at: '2026-07-06T15:00:00.000Z',
    id: 'event-c',
  });

  const state = deriveCompletionState(
    [rerecorded, retracted, recorded],
    'habit-1',
    '2026-07-06',
  );
  assert.equal(state.completed, true);
  assert.equal(state.completion_level, 'full');
  assert.equal(state.source_event_id, 'event-c');
  assert.deepEqual(state.active_record_ids, ['event-c']);
});

test('una retractacion sin objetivo limpia lo anterior, no una grabacion posterior', () => {
  const state = deriveCompletionState(
    [
      makeEvent({ id: 'event-a' }),
      makeEvent({
        completion_level: null,
        created_at: '2026-07-06T14:00:00.000Z',
        event_type: 'retracted',
        id: 'event-b',
      }),
      makeEvent({ created_at: '2026-07-06T15:00:00.000Z', id: 'event-c' }),
    ],
    'habit-1',
    '2026-07-06',
  );

  assert.equal(state.completed, true);
  assert.deepEqual(state.active_record_ids, ['event-c']);
});

test('las retractaciones corruptas quedan visibles como anomalias', () => {
  const states = deriveCompletionStates([
    makeEvent({ habit_id: 'habit-2', id: 'event-target' }),
    makeEvent({
      completion_level: null,
      created_at: '2026-07-06T14:00:00.000Z',
      event_type: 'retracted',
      id: 'event-retract',
      supersedes_event_id: 'event-target',
    }),
  ]);

  const habitOne = states.find((state) => state.habit_id === 'habit-1');
  assert.equal(habitOne.completed, false);
  assert.equal(habitOne.anomalies[0].code, 'target_group_mismatch');
});

test('IDs y operaciones duplicadas se rechazan para no ocultar corrupcion', () => {
  assert.throws(
    () => deriveCompletionStates([makeEvent(), makeEvent()]),
    /duplicado/,
  );
  assert.throws(
    () =>
      deriveCompletionStates([
        makeEvent({ client_operation_id: 'op-1', id: 'event-a' }),
        makeEvent({ client_operation_id: 'op-1', id: 'event-b' }),
      ]),
    /operacion/,
  );
});

test('consistencia cuenta oportunidades, ignora evidencia no programada y muestra reentrada', () => {
  const plan = makePlan({
    commitments: [
      makeCommitment(),
      makeCommitment({ id: 'habit-2', scheduled_weekdays: [2] }),
    ],
  });
  const result = calculateConsistency({
    events: [
      makeEvent(),
      makeEvent({
        created_at: '2026-07-07T13:00:00.000Z',
        habit_id: 'habit-2',
        id: 'event-2',
        local_date: '2026-07-07',
      }),
      makeEvent({
        created_at: '2026-07-08T13:00:00.000Z',
        habit_id: 'habit-2',
        id: 'event-off-schedule',
        local_date: '2026-07-08',
      }),
    ],
    from: '2026-07-06',
    plan,
    through: '2026-07-12',
  });

  assert.equal(result.scheduled_opportunities, 4);
  assert.equal(result.completed_opportunities, 2);
  assert.equal(result.consistency_rate, 0.5);
  assert.deepEqual(result.evidence_dates, ['2026-07-06', '2026-07-07']);
  const first = result.commitments.find((item) => item.habit_id === 'habit-1');
  assert.equal(first.best_run, 1);
  assert.equal(first.current_run, 0);
  assert.equal(first.recovery.status, 'reentry_due');
  assert.deepEqual(first.recovery.episodes[0].missed_dates, [
    '2026-07-08',
    '2026-07-10',
  ]);
});

test('recuperacion cierra un episodio en la siguiente oportunidad completada', () => {
  const plan = makePlan();
  const result = calculateConsistency({
    events: [
      makeEvent(),
      makeEvent({
        created_at: '2026-07-13T13:00:00.000Z',
        id: 'event-2',
        local_date: '2026-07-13',
      }),
    ],
    from: '2026-07-06',
    plan,
    through: '2026-07-13',
  });
  const recovery = result.commitments[0].recovery;

  assert.equal(recovery.status, 'recovered');
  assert.equal(recovery.recovered_episodes, 1);
  assert.deepEqual(recovery.episodes[0], {
    missed_dates: ['2026-07-08', '2026-07-10'],
    missed_opportunities: 2,
    recovered_on: '2026-07-13',
    started_on: '2026-07-08',
    status: 'recovered',
  });
});

test('SEC v1 adapta el umbral a una frecuencia real menor de tres dias', () => {
  const plan = makePlan({
    commitments: [makeCommitment({ scheduled_weekdays: [1, 4] })],
  });
  const result = evaluateSecWeek({
    as_of_date: '2026-07-13',
    events: [
      makeEvent(),
      makeEvent({
        created_at: '2026-07-09T13:00:00.000Z',
        id: 'event-2',
        local_date: '2026-07-09',
      }),
    ],
    plan,
    user_id: 'user-1',
    week_start: '2026-07-06',
    weekly_reviews: [makeReview()],
  });

  assert.equal(result.metric_version, SEC_METRIC_VERSION);
  assert.equal(result.scheduled_date_count, 2);
  assert.equal(result.required_evidence_dates, 2);
  assert.equal(result.evidence_date_count, 2);
  assert.equal(result.eligible, true);
  assert.equal(result.closed, true);
});

test('SEC cuenta fechas distintas, no cantidad de compromisos en el mismo dia', () => {
  const plan = makePlan({
    commitments: [
      makeCommitment({ scheduled_weekdays: [1, 3, 5] }),
      makeCommitment({ id: 'habit-2', scheduled_weekdays: [1, 3, 5] }),
    ],
  });
  const result = evaluateSecWeek({
    as_of_date: '2026-07-13',
    events: [
      makeEvent(),
      makeEvent({ habit_id: 'habit-2', id: 'event-2' }),
      makeEvent({
        created_at: '2026-07-08T13:00:00.000Z',
        id: 'event-3',
        local_date: '2026-07-08',
      }),
    ],
    plan,
    user_id: 'user-1',
    week_start: '2026-07-06',
    weekly_reviews: [makeReview()],
  });

  assert.equal(result.evidence_date_count, 2);
  assert.equal(result.required_evidence_dates, 3);
  assert.equal(result.closed, false);
});

test('SEC exige cierre temporal, fechas programadas y revision semanal', () => {
  const future = evaluateSecWeek({
    as_of_date: '2026-07-12',
    events: [makeEvent()],
    plan: makePlan(),
    user_id: 'user-1',
    week_start: '2026-07-06',
    weekly_reviews: [makeReview()],
  });
  assert.equal(future.eligible, false);
  assert.equal(future.eligibility_reason, 'week_not_closed');

  const noReview = evaluateSecWeek({
    as_of_date: '2026-07-13',
    events: [
      makeEvent(),
      makeEvent({
        created_at: '2026-07-08T13:00:00.000Z',
        id: 'event-2',
        local_date: '2026-07-08',
      }),
      makeEvent({
        created_at: '2026-07-10T13:00:00.000Z',
        id: 'event-3',
        local_date: '2026-07-10',
      }),
    ],
    plan: makePlan(),
    user_id: 'user-1',
    week_start: '2026-07-06',
    weekly_reviews: [],
  });
  assert.equal(noReview.eligible, true);
  assert.equal(noReview.review_completed, false);
  assert.equal(noReview.closed, false);
});

test('SEC Rate excluye no elegibles y conserva metric_version auditable', () => {
  const closed = {
    closed: true,
    eligible: true,
    metric_version: SEC_METRIC_VERSION,
    user_id: 'user-1',
    week_start: '2026-07-06',
  };
  const open = {
    closed: false,
    eligible: true,
    metric_version: SEC_METRIC_VERSION,
    user_id: 'user-2',
    week_start: '2026-07-06',
  };
  const notEligible = {
    closed: false,
    eligible: false,
    metric_version: SEC_METRIC_VERSION,
    user_id: 'user-3',
    week_start: '2026-07-06',
  };

  assert.deepEqual(calculateSecRate([closed, open, notEligible]), {
    closed_users: 1,
    eligible_users: 2,
    metric_version: SEC_METRIC_VERSION,
    sec_rate: 0.5,
    week_start: '2026-07-06',
  });
  assert.throws(
    () => calculateSecRate([closed], 'sec.v2'),
    /metric_version no soportada/,
  );
  assert.throws(
    () => calculateSecRate([closed, { ...open, user_id: 'user-1' }]),
    /una evaluacion por usuario/,
  );
});
