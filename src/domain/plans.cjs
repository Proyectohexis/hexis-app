'use strict';

const { parseDateKey, weekdayOf } = require('./dateKeys.cjs');

const PLAN_STATUSES = new Set(['active', 'completed', 'archived']);
const COMMITMENT_STATUSES = new Set(['active', 'paused', 'archived']);
const REMINDER_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

class DomainValidationError extends Error {
  constructor(issues) {
    super('El plan no cumple el contrato de dominio de HEXIS.');
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}

function issue(code, path, message) {
  return { code, message, path };
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectDateIssue(value, path, errors, required = false) {
  if (value == null || value === '') {
    if (required) {
      errors.push(issue('required', path, 'La fecha es obligatoria.'));
    }
    return;
  }

  try {
    parseDateKey(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(issue('invalid_date', path, message));
  }
}

function validateWeekdays(weekdays, path, errors) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    errors.push(
      issue('weekdays_required', path, 'Selecciona al menos un dia programado.'),
    );
    return;
  }

  const seen = new Set();
  weekdays.forEach((weekday, index) => {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      errors.push(
        issue(
          'invalid_weekday',
          `${path}[${index}]`,
          'El dia debe ser un entero entre 0 (domingo) y 6 (sabado).',
        ),
      );
      return;
    }
    if (seen.has(weekday)) {
      errors.push(
        issue('duplicate_weekday', `${path}[${index}]`, 'El dia esta repetido.'),
      );
    }
    seen.add(weekday);
  });
}

function validateReminderTime(reminderTime, path, errors) {
  if (reminderTime == null || reminderTime === '') return;
  if (typeof reminderTime !== 'string' || !REMINDER_TIME_PATTERN.test(reminderTime)) {
    errors.push(
      issue('invalid_reminder_time', path, 'La hora debe usar el formato HH:MM de 24 horas.'),
    );
  }
}

function validateExclusions(commitment, path, errors) {
  const excludedDates = commitment.excluded_dates ?? [];
  if (!Array.isArray(excludedDates)) {
    errors.push(
      issue('invalid_excluded_dates', `${path}.excluded_dates`, 'Debe ser una lista.'),
    );
  } else {
    excludedDates.forEach((dateKey, index) => {
      collectDateIssue(dateKey, `${path}.excluded_dates[${index}]`, errors, true);
    });
    if (new Set(excludedDates).size !== excludedDates.length) {
      errors.push(
        issue(
          'duplicate_excluded_date',
          `${path}.excluded_dates`,
          'Una fecha excluida no puede repetirse.',
        ),
      );
    }
  }

  const pauses = commitment.pause_intervals ?? [];
  if (!Array.isArray(pauses)) {
    errors.push(
      issue('invalid_pause_intervals', `${path}.pause_intervals`, 'Debe ser una lista.'),
    );
    return;
  }

  pauses.forEach((pause, index) => {
    const pausePath = `${path}.pause_intervals[${index}]`;
    if (!pause || typeof pause !== 'object' || Array.isArray(pause)) {
      errors.push(issue('invalid_pause', pausePath, 'La pausa debe ser un objeto.'));
      return;
    }
    collectDateIssue(pause.starts_on, `${pausePath}.starts_on`, errors, true);
    collectDateIssue(pause.ends_on, `${pausePath}.ends_on`, errors, true);
    if (
      typeof pause.starts_on === 'string' &&
      typeof pause.ends_on === 'string' &&
      pause.starts_on > pause.ends_on
    ) {
      errors.push(
        issue('invalid_range', pausePath, 'La pausa termina antes de comenzar.'),
      );
    }
  });
}

function validateCommitment(commitment, index, plan, errors) {
  const path = `commitments[${index}]`;
  if (!commitment || typeof commitment !== 'object' || Array.isArray(commitment)) {
    errors.push(issue('invalid_commitment', path, 'El compromiso debe ser un objeto.'));
    return;
  }

  if (!isNonEmptyText(commitment.id)) {
    errors.push(issue('required', `${path}.id`, 'El identificador es obligatorio.'));
  }
  if (!isNonEmptyText(commitment.name)) {
    errors.push(issue('required', `${path}.name`, 'El nombre es obligatorio.'));
  }
  if (!isNonEmptyText(commitment.minimum_action)) {
    errors.push(
      issue('required', `${path}.minimum_action`, 'La accion minima es obligatoria.'),
    );
  }

  const status = commitment.status ?? 'active';
  if (!COMMITMENT_STATUSES.has(status)) {
    errors.push(issue('invalid_status', `${path}.status`, 'Estado de compromiso invalido.'));
  }

  validateWeekdays(commitment.scheduled_weekdays, `${path}.scheduled_weekdays`, errors);
  validateReminderTime(commitment.reminder_time, `${path}.reminder_time`, errors);
  collectDateIssue(commitment.starts_on, `${path}.starts_on`, errors);
  collectDateIssue(commitment.ends_on, `${path}.ends_on`, errors);
  collectDateIssue(commitment.inactive_from, `${path}.inactive_from`, errors);
  validateExclusions(commitment, path, errors);

  const startsOn = commitment.starts_on ?? plan.starts_on;
  const endsOn = commitment.ends_on ?? plan.ends_on;
  if (startsOn && endsOn && startsOn > endsOn) {
    errors.push(issue('invalid_range', path, 'El compromiso termina antes de comenzar.'));
  }
  if (plan.starts_on && startsOn && startsOn < plan.starts_on) {
    errors.push(
      issue('outside_plan', `${path}.starts_on`, 'El compromiso comienza antes del plan.'),
    );
  }
  if (plan.ends_on && endsOn && endsOn > plan.ends_on) {
    errors.push(
      issue('outside_plan', `${path}.ends_on`, 'El compromiso termina despues del plan.'),
    );
  }
  if (status !== 'active' && !commitment.ends_on && !commitment.inactive_from) {
    errors.push(
      issue(
        'inactive_boundary_required',
        path,
        'Un compromiso no activo necesita una fecha de cierre para preservar su historia.',
      ),
    );
  }
}

function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return {
      errors: [issue('invalid_plan', 'plan', 'El plan debe ser un objeto.')],
      valid: false,
    };
  }

  if (!isNonEmptyText(plan.id)) {
    errors.push(issue('required', 'id', 'El identificador del plan es obligatorio.'));
  }
  if (!isNonEmptyText(plan.identity_statement)) {
    errors.push(
      issue('required', 'identity_statement', 'La identidad objetivo es obligatoria.'),
    );
  }
  if (!isNonEmptyText(plan.outcome_statement)) {
    errors.push(issue('required', 'outcome_statement', 'La meta concreta es obligatoria.'));
  }
  if (!isNonEmptyText(plan.why_statement)) {
    errors.push(issue('required', 'why_statement', 'El motivo personal es obligatorio.'));
  }
  if (!isNonEmptyText(plan.timezone)) {
    errors.push(issue('required', 'timezone', 'La zona horaria es obligatoria.'));
  }

  const status = plan.status ?? 'active';
  if (!PLAN_STATUSES.has(status)) {
    errors.push(issue('invalid_status', 'status', 'Estado de plan invalido.'));
  }

  collectDateIssue(plan.starts_on, 'starts_on', errors, true);
  collectDateIssue(plan.ends_on, 'ends_on', errors);
  if (plan.starts_on && plan.ends_on && plan.starts_on > plan.ends_on) {
    errors.push(issue('invalid_range', 'plan', 'El plan termina antes de comenzar.'));
  }
  if (status !== 'active' && !plan.ends_on) {
    errors.push(
      issue(
        'end_date_required',
        'ends_on',
        'Un plan no activo necesita ends_on para conservar su historia programada.',
      ),
    );
  }

  if (!Array.isArray(plan.commitments)) {
    errors.push(issue('commitments_required', 'commitments', 'Debe ser una lista.'));
  } else {
    const activeCommitmentCount = plan.commitments.filter(
      (commitment) => (commitment?.status ?? 'active') === 'active',
    ).length;
    if (
      activeCommitmentCount > 3 ||
      ((plan.status ?? 'active') === 'active' && activeCommitmentCount < 1)
    ) {
      errors.push(
        issue(
          'commitment_count',
          'commitments',
          'Un plan activo debe contener entre uno y tres compromisos vigentes.',
        ),
      );
    }
    plan.commitments.forEach((commitment, index) =>
      validateCommitment(commitment, index, plan, errors),
    );

    const ids = plan.commitments
      .map((commitment) => commitment && commitment.id)
      .filter(isNonEmptyText);
    if (new Set(ids).size !== ids.length) {
      errors.push(
        issue('duplicate_commitment_id', 'commitments', 'Los identificadores deben ser unicos.'),
      );
    }
  }

  return { errors, valid: errors.length === 0 };
}

function assertValidPlan(plan) {
  const result = validatePlan(plan);
  if (!result.valid) {
    throw new DomainValidationError(result.errors);
  }
  return plan;
}

function validateInitialPlan(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      errors: [issue('invalid_plan', 'plan', 'El plan debe ser un objeto.')],
      valid: false,
    };
  }

  if (!isNonEmptyText(input.identity_statement)) {
    errors.push(
      issue('required', 'identity_statement', 'La identidad objetivo es obligatoria.'),
    );
  }
  if (!isNonEmptyText(input.outcome_statement)) {
    errors.push(issue('required', 'outcome_statement', 'La meta concreta es obligatoria.'));
  }
  if (!isNonEmptyText(input.why_statement)) {
    errors.push(issue('required', 'why_statement', 'El motivo personal es obligatorio.'));
  }
  if (!isNonEmptyText(input.timezone)) {
    errors.push(issue('required', 'timezone', 'La zona horaria es obligatoria.'));
  }
  collectDateIssue(input.starts_on, 'starts_on', errors, true);

  if (!Array.isArray(input.commitments)) {
    errors.push(issue('commitments_required', 'commitments', 'Debe ser una lista.'));
  } else {
    if (input.commitments.length < 1 || input.commitments.length > 3) {
      errors.push(
        issue(
          'commitment_count',
          'commitments',
          'El plan debe contener entre uno y tres compromisos.',
        ),
      );
    }
    input.commitments.forEach((commitment, index) => {
      const path = `commitments[${index}]`;
      if (!commitment || typeof commitment !== 'object' || Array.isArray(commitment)) {
        errors.push(issue('invalid_commitment', path, 'El compromiso debe ser un objeto.'));
        return;
      }
      if (!isNonEmptyText(commitment.name)) {
        errors.push(issue('required', `${path}.name`, 'El nombre es obligatorio.'));
      }
      if (!isNonEmptyText(commitment.minimum_action)) {
        errors.push(
          issue('required', `${path}.minimum_action`, 'La accion minima es obligatoria.'),
        );
      }
      validateWeekdays(commitment.scheduled_weekdays, `${path}.scheduled_weekdays`, errors);
      validateReminderTime(commitment.reminder_time, `${path}.reminder_time`, errors);
    });

    const providedIds = input.commitments
      .map((commitment) => commitment && commitment.id)
      .filter(isNonEmptyText);
    if (new Set(providedIds).size !== providedIds.length) {
      errors.push(
        issue('duplicate_commitment_id', 'commitments', 'Los identificadores deben ser unicos.'),
      );
    }
  }

  return { errors, valid: errors.length === 0 };
}

function normalizeCommitments(plan) {
  assertValidPlan(plan);
  return plan.commitments.map((commitment) => ({
    ...commitment,
    ends_on: commitment.ends_on ?? plan.ends_on ?? null,
    starts_on: commitment.starts_on ?? plan.starts_on,
    status: commitment.status ?? 'active',
  }));
}

function isWithinPause(commitment, dateKey) {
  return (commitment.pause_intervals ?? []).some(
    (pause) => pause.starts_on <= dateKey && dateKey <= pause.ends_on,
  );
}

function isCommitmentScheduled(commitment, dateKey) {
  parseDateKey(dateKey);
  if (!commitment || typeof commitment !== 'object') {
    throw new TypeError('commitment debe ser un objeto.');
  }
  const scheduleErrors = [];
  validateWeekdays(commitment.scheduled_weekdays, 'scheduled_weekdays', scheduleErrors);
  if (scheduleErrors.length > 0) {
    throw new DomainValidationError(scheduleErrors);
  }
  if (
    !Array.isArray(commitment.scheduled_weekdays) ||
    commitment.scheduled_weekdays.length === 0 ||
    !commitment.scheduled_weekdays.includes(weekdayOf(dateKey))
  ) {
    return false;
  }
  if (commitment.starts_on && dateKey < commitment.starts_on) return false;
  if (commitment.ends_on && dateKey > commitment.ends_on) return false;
  if (commitment.inactive_from && dateKey >= commitment.inactive_from) return false;
  if (
    (commitment.status === 'paused' || commitment.status === 'archived') &&
    !commitment.inactive_from &&
    !commitment.ends_on
  ) {
    return false;
  }
  if ((commitment.excluded_dates ?? []).includes(dateKey)) return false;
  if (isWithinPause(commitment, dateKey)) return false;
  return true;
}

module.exports = {
  COMMITMENT_STATUSES,
  DomainValidationError,
  PLAN_STATUSES,
  assertValidPlan,
  isCommitmentScheduled,
  normalizeCommitments,
  validateInitialPlan,
  validatePlan,
};
