'use strict';

const {
  DAYS,
  DECISIONS,
  METRIC_STATES,
  REDUCE_MODES,
  REFLECTION_OPTIONS,
  SCENARIOS,
  SIMULATIONS,
  deepFreeze,
} = require('./fixtures');

const DEFAULT_TEAM_CONFIG = Object.freeze({
  scenarioKey: 'learning',
  metricStateId: 'two_or_more',
  simulationId: 'stable',
});

const KNOWN_DAY_IDS = new Set(DAYS.map((day) => day.id));
const SESSION_PROOF = Symbol('UX02 session proof');
const RECOVERY_PROOF = Symbol('UX02 recovery proof');
const SESSION_TOKENS = new WeakMap();
const RECOVERY_TOKENS = new WeakMap();
const CONFIRMED_SESSIONS = new WeakSet();

function draftFingerprint(session) {
  return JSON.stringify({
    afterDays: session.afterDays,
    afterMinimumAction: session.afterMinimumAction,
    decision: session.decision,
    effectiveDate: session.effectiveDate,
    pendingConflictSource: session.pendingConflictSource,
    reduceMode: session.reduceMode,
    reflection: session.reflection,
    replacement: session.replacement,
    reviewThroughDate: session.reviewThroughDate,
    sourceCommitment: session.sourceCommitment,
    targetId: session.targetId,
  });
}

function withRecoveryProof(session, phase) {
  const token = {};
  RECOVERY_TOKENS.set(token, Object.freeze({
    phase,
    draftFingerprint: draftFingerprint(session),
    scenarioKey: session.config.scenarioKey,
    sessionToken: session[SESSION_PROOF],
    simulationId: session.config.simulationId,
  }));
  return { ...session, [RECOVERY_PROOF]: token };
}

function getRecoveryMetadata(session) {
  if (!session || !session.config) return false;
  const metadata = RECOVERY_TOKENS.get(session[RECOVERY_PROOF]);
  if (
    metadata &&
      metadata.scenarioKey === session.config.scenarioKey &&
      metadata.sessionToken === session[SESSION_PROOF] &&
      metadata.simulationId === session.config.simulationId
  ) return metadata;
  return null;
}

function asConfirmed(session) {
  const confirmed = deepFreeze({
    ...session,
    screen: 'receipt',
    confirmationStatus: 'confirmed',
  });
  CONFIRMED_SESSIONS.add(confirmed);
  return confirmed;
}

function cloneCommitment(commitment) {
  return {
    id: commitment.id,
    sourceVersion: commitment.sourceVersion,
    name: commitment.name,
    minimumAction: commitment.minimumAction,
    scheduledDays: [...commitment.scheduledDays],
  };
}

function createSession(config = DEFAULT_TEAM_CONFIG) {
  const normalizedConfig = {
    scenarioKey: config.scenarioKey || DEFAULT_TEAM_CONFIG.scenarioKey,
    metricStateId: config.metricStateId || DEFAULT_TEAM_CONFIG.metricStateId,
    simulationId: config.simulationId || DEFAULT_TEAM_CONFIG.simulationId,
  };
  const scenario = SCENARIOS[normalizedConfig.scenarioKey];

  if (
    !scenario ||
    !METRIC_STATES.some((item) => item.id === normalizedConfig.metricStateId) ||
    !SIMULATIONS.some((item) => item.id === normalizedConfig.simulationId)
  ) {
    throw new Error('Unknown synthetic configuration.');
  }

  const sourceCommitment = cloneCommitment(scenario.commitment);
  const sessionToken = {};
  SESSION_TOKENS.set(sessionToken, Object.freeze({
    scenarioKey: normalizedConfig.scenarioKey,
  }));

  return {
    screen: 'step1',
    reflection: '',
    targetId: null,
    decision: null,
    reduceMode: null,
    afterDays: [...sourceCommitment.scheduledDays],
    afterMinimumAction: sourceCommitment.minimumAction,
    replacement: {
      fixtureId: null,
      name: '',
      minimumAction: '',
      scheduledDays: [],
    },
    sourceCommitment,
    pendingConflictSource: null,
    reloadedConflictSummary: null,
    reviewThroughDate: { ...scenario.reviewDate },
    effectiveDate: { ...scenario.effectiveDate },
    confirmationStatus: 'idle',
    simulationConsumed: false,
    config: normalizedConfig,
    [SESSION_PROOF]: sessionToken,
  };
}

function toggleDay(days, dayId) {
  if (!KNOWN_DAY_IDS.has(dayId)) {
    return [...days];
  }

  if (days.includes(dayId)) {
    return days.filter((id) => id !== dayId);
  }
  return [...days, dayId];
}

function hasKnownUniqueDays(days) {
  return (
    Array.isArray(days) &&
    days.length > 0 &&
    new Set(days).size === days.length &&
    days.every((day) => KNOWN_DAY_IDS.has(day))
  );
}

function includesSameDays(left, right) {
  return (
    hasKnownUniqueDays(left) &&
    hasKnownUniqueDays(right) &&
    left.length === right.length &&
    left.every((day) => right.includes(day))
  );
}

function getSourceCommitment(session, scenario) {
  const candidate = session && session.sourceCommitment;
  if (isTrustedSourceCommitment(candidate, scenario)) {
    return candidate;
  }
  return cloneCommitment(scenario.commitment);
}

function isStrictSubset(candidate, source) {
  return (
    hasKnownUniqueDays(candidate) &&
    candidate.length < source.length &&
    candidate.every((day) => source.includes(day))
  );
}

function isStrictSuperset(candidate, source) {
  return (
    hasKnownUniqueDays(candidate) &&
    candidate.length > source.length &&
    source.every((day) => candidate.includes(day))
  );
}

function isChangedMinimumAction(candidate, source, allowedOptions) {
  const next = candidate.trim();
  const previous = source.trim();
  return (
    next.length > 0 &&
    next.length <= 160 &&
    next !== previous &&
    allowedOptions.includes(next)
  );
}

function isDraftValid(session, scenario) {
  if (!isSessionEnvelopeTrusted(session, scenario)) return false;

  const source = getSourceCommitment(session, scenario);
  if (session.targetId !== source.id || !session.decision) return false;

  const sameDays = includesSameDays(session.afterDays, source.scheduledDays);
  const sameMinimumAction = session.afterMinimumAction === source.minimumAction;

  if (session.decision === 'keep') {
    return sameDays && sameMinimumAction;
  }

  if (session.decision === 'reduce') {
    const scheduleReduced = isStrictSubset(session.afterDays, source.scheduledDays);
    const minimumReduced = isChangedMinimumAction(
      session.afterMinimumAction || '',
      source.minimumAction,
      scenario.reducedMinimumActions,
    );

    if (session.reduceMode === 'schedule') return scheduleReduced && sameMinimumAction;
    if (session.reduceMode === 'minimum_action') return sameDays && minimumReduced;
    if (session.reduceMode === 'both') return scheduleReduced && minimumReduced;
    return false;
  }

  if (session.decision === 'increase') {
    return isStrictSuperset(session.afterDays, source.scheduledDays) && sameMinimumAction;
  }

  if (session.decision === 'replace') {
    const replacementName = session.replacement.name.trim();
    const replacementMinimum = session.replacement.minimumAction.trim();
    const fixture = scenario.replacementOptions.find(
      (option) => option.id === session.replacement.fixtureId,
    );
    return (
      Boolean(fixture) &&
      replacementName.length > 0 &&
      replacementName.length <= 80 &&
      replacementName !== source.name &&
      replacementMinimum.length > 0 &&
      replacementMinimum.length <= 160 &&
      hasKnownUniqueDays(session.replacement.scheduledDays) &&
      replacementName === fixture.name &&
      replacementMinimum === fixture.minimumAction &&
      includesSameDays(session.replacement.scheduledDays, fixture.scheduledDays)
    );
  }

  return false;
}

function dayLabels(dayIds) {
  return DAYS.filter((day) => dayIds.includes(day.id)).map((day) => day.short);
}

function buildAfterCommitment(session, scenario) {
  const source = getSourceCommitment(session, scenario);
  if (session.decision === 'replace') {
    return {
      name: session.replacement.name.trim(),
      minimumAction: session.replacement.minimumAction.trim(),
      scheduledDays: [...session.replacement.scheduledDays],
    };
  }

  return {
    name: source.name,
    minimumAction:
      session.decision === 'reduce' ? session.afterMinimumAction.trim() : source.minimumAction,
    scheduledDays: [...session.afterDays],
  };
}

function describeChange(session, scenario) {
  const source = getSourceCommitment(session, scenario);
  const beforeDays = dayLabels(source.scheduledDays).join(' · ');
  const after = buildAfterCommitment(session, scenario);
  const afterDays = dayLabels(after.scheduledDays).join(' · ');

  if (session.decision === 'keep') {
    return `${source.name} continúa con la acción mínima “${source.minimumAction}” y los días ${beforeDays}.`;
  }

  if (session.decision === 'replace') {
    return `${source.name} será sustituido por ${after.name}. Acción mínima: “${after.minimumAction}”. Días: ${afterDays}.`;
  }

  if (session.decision === 'increase') {
    return `Días: ${beforeDays} → ${afterDays}. Acción mínima sin cambios: “${source.minimumAction}”.`;
  }

  const changes = [];
  if (session.reduceMode === 'schedule' || session.reduceMode === 'both') {
    changes.push(`Días: ${beforeDays} → ${afterDays}`);
  } else {
    changes.push(`Días sin cambios: ${beforeDays}`);
  }
  if (session.reduceMode === 'minimum_action' || session.reduceMode === 'both') {
    changes.push(`Acción mínima: “${source.minimumAction}” → “${after.minimumAction}”`);
  } else {
    changes.push(`Acción mínima sin cambios: “${source.minimumAction}”`);
  }
  return `${changes.join('. ')}.`;
}

function buildConflictSource(scenario) {
  return {
    id: scenario.commitment.id,
    sourceVersion: scenario.conflictUpdate.sourceVersion,
    name: scenario.commitment.name,
    minimumAction: scenario.conflictUpdate.minimumAction,
    scheduledDays: [...scenario.conflictUpdate.scheduledDays],
  };
}

function isExactDate(candidate, expected) {
  return Boolean(
    candidate && candidate.iso === expected.iso && candidate.full === expected.full,
  );
}

function isExactCommitment(candidate, expected) {
  return Boolean(
    candidate &&
      candidate.id === expected.id &&
      candidate.sourceVersion === expected.sourceVersion &&
      candidate.name === expected.name &&
      candidate.minimumAction === expected.minimumAction &&
      includesSameDays(candidate.scheduledDays, expected.scheduledDays),
  );
}

function isTrustedSourceCommitment(candidate, scenario) {
  return (
    isExactCommitment(candidate, scenario.commitment) ||
    isExactCommitment(candidate, buildConflictSource(scenario))
  );
}

function isExactReplacement(candidate, option) {
  return Boolean(
    candidate &&
      candidate.fixtureId === option.id &&
      candidate.name === option.name &&
      candidate.minimumAction === option.minimumAction &&
      includesSameDays(candidate.scheduledDays, option.scheduledDays),
  );
}

function isEmptyReplacement(candidate) {
  return Boolean(
    candidate &&
      candidate.fixtureId === null &&
      candidate.name === '' &&
      candidate.minimumAction === '' &&
      Array.isArray(candidate.scheduledDays) &&
      candidate.scheduledDays.length === 0,
  );
}

function hasKnownUniqueOrEmptyDays(days) {
  return (
    Array.isArray(days) &&
    new Set(days).size === days.length &&
    days.every((day) => KNOWN_DAY_IDS.has(day))
  );
}

function isSessionEnvelopeTrusted(session, scenario) {
  if (!session || typeof session !== 'object' || !session.config) return false;
  const sessionMetadata = SESSION_TOKENS.get(session[SESSION_PROOF]);
  if (!sessionMetadata || sessionMetadata.scenarioKey !== session.config.scenarioKey) return false;
  if (SCENARIOS[session.config.scenarioKey] !== scenario) return false;
  if (!METRIC_STATES.some((item) => item.id === session.config.metricStateId)) return false;
  if (!SIMULATIONS.some((item) => item.id === session.config.simulationId)) return false;
  if (!['step1', 'step2', 'step3', 'confirmation', 'receipt'].includes(session.screen)) return false;
  if (!['idle', 'offline', 'conflict', 'rollover', 'invalid', 'confirmed'].includes(session.confirmationStatus)) return false;
  if (typeof session.simulationConsumed !== 'boolean') return false;
  if (!isTrustedSourceCommitment(session.sourceCommitment, scenario)) return false;

  const source = session.sourceCommitment;
  if (session.targetId !== null && session.targetId !== source.id) return false;
  if (session.decision !== null && !DECISIONS.some((item) => item.id === session.decision)) return false;
  if (session.reduceMode !== null && !REDUCE_MODES.some((item) => item.id === session.reduceMode)) return false;
  if (!hasKnownUniqueOrEmptyDays(session.afterDays)) return false;
  if (
    session.afterMinimumAction !== source.minimumAction &&
    !scenario.reducedMinimumActions.includes(session.afterMinimumAction)
  ) return false;

  const reflectionIsTrusted =
    session.reflection === '' ||
    REFLECTION_OPTIONS.some((option) => option.label === session.reflection);
  if (!reflectionIsTrusted) return false;

  const replacementIsTrusted =
    isEmptyReplacement(session.replacement) ||
    scenario.replacementOptions.some((option) => isExactReplacement(session.replacement, option));
  if (!replacementIsTrusted) return false;

  const initialDates =
    isExactDate(session.reviewThroughDate, scenario.reviewDate) &&
    isExactDate(session.effectiveDate, scenario.effectiveDate);
  const rolloverDates =
    isExactDate(session.reviewThroughDate, scenario.rolloverReviewDate) &&
    isExactDate(session.effectiveDate, scenario.rolloverDate);
  if (!initialDates && !rolloverDates) return false;

  const conflictSource = buildConflictSource(scenario);
  if (
    session.pendingConflictSource !== null &&
    !isExactCommitment(session.pendingConflictSource, conflictSource)
  ) return false;
  if (session.confirmationStatus === 'conflict' && session.pendingConflictSource === null) return false;
  if (session.confirmationStatus !== 'conflict' && session.pendingConflictSource !== null) return false;
  if (
    session.reloadedConflictSummary !== null &&
    session.reloadedConflictSummary !== scenario.conflictUpdate.summary
  ) return false;

  if (source.sourceVersion === conflictSource.sourceVersion) {
    if (
      session.config.simulationId !== 'conflict' ||
      !session.simulationConsumed ||
      session.reloadedConflictSummary !== scenario.conflictUpdate.summary
    ) return false;
  }
  if (session.confirmationStatus === 'conflict' && session.config.simulationId !== 'conflict') return false;
  if (session.confirmationStatus === 'rollover' && session.config.simulationId !== 'rollover') return false;
  if (session.confirmationStatus === 'offline' && session.config.simulationId !== 'offline') return false;
  if (session.confirmationStatus === 'confirmed' && session.screen !== 'receipt') return false;
  if (session.screen === 'receipt' && session.confirmationStatus !== 'confirmed') return false;
  if (
    ['offline', 'conflict', 'rollover', 'invalid'].includes(session.confirmationStatus) &&
    session.screen !== 'confirmation'
  ) return false;

  const simulationId = session.config.simulationId;
  const recoveryMetadata = getRecoveryMetadata(session);
  const recoveryProof = Boolean(recoveryMetadata);
  const sourceIsInitial = isExactCommitment(source, scenario.commitment);
  const sourceIsConflict = isExactCommitment(source, conflictSource);

  if (
    recoveryMetadata &&
    recoveryMetadata.phase === 'presented' &&
    recoveryMetadata.draftFingerprint !== draftFingerprint(session)
  ) return false;

  if (simulationId === 'stable') {
    if (session.simulationConsumed || recoveryProof || !sourceIsInitial || !initialDates) return false;
  } else if (!session.simulationConsumed) {
    if (
      recoveryProof ||
      session.confirmationStatus !== 'idle' ||
      !sourceIsInitial ||
      !initialDates ||
      session.pendingConflictSource !== null ||
      session.reloadedConflictSummary !== null
    ) return false;
  } else {
    if (!recoveryProof) return false;

    if (simulationId === 'offline') {
      if (
        recoveryMetadata.phase !== 'presented' ||
        !sourceIsInitial ||
        !initialDates ||
        session.pendingConflictSource !== null ||
        session.reloadedConflictSummary !== null ||
        !['offline', 'confirmed'].includes(session.confirmationStatus)
      ) return false;
    }

    if (simulationId === 'conflict') {
      if (session.confirmationStatus === 'conflict') {
        if (
          recoveryMetadata.phase !== 'presented' ||
          !sourceIsInitial ||
          !initialDates ||
          !isExactCommitment(session.pendingConflictSource, conflictSource) ||
          session.reloadedConflictSummary !== null
        ) return false;
      } else if (
        recoveryMetadata.phase !== 'recovered' ||
        !sourceIsConflict ||
        !initialDates ||
        session.pendingConflictSource !== null ||
        session.reloadedConflictSummary !== scenario.conflictUpdate.summary ||
        !['idle', 'invalid', 'confirmed'].includes(session.confirmationStatus)
      ) return false;
    }

    if (simulationId === 'rollover') {
      if (
        (session.confirmationStatus === 'rollover'
          ? recoveryMetadata.phase !== 'presented'
          : recoveryMetadata.phase !== 'recovered') ||
        !sourceIsInitial ||
        !rolloverDates ||
        session.pendingConflictSource !== null ||
        session.reloadedConflictSummary !== null ||
        !['rollover', 'idle', 'invalid', 'confirmed'].includes(session.confirmationStatus)
      ) return false;
    }
  }

  if (
    session.confirmationStatus === 'confirmed' &&
    !CONFIRMED_SESSIONS.has(session)
  ) return false;

  return true;
}

function attemptConfirmation(session, scenario) {
  if (!['idle', 'offline'].includes(session.confirmationStatus)) {
    return session;
  }

  if (session.screen !== 'confirmation' || !isDraftValid(session, scenario)) {
    return { ...session, confirmationStatus: 'invalid' };
  }

  if (session.simulationConsumed || session.config.simulationId === 'stable') {
    return asConfirmed(session);
  }

  if (session.config.simulationId === 'rollover') {
    return withRecoveryProof({
      ...session,
      confirmationStatus: 'rollover',
      simulationConsumed: true,
      reviewThroughDate: { ...scenario.rolloverReviewDate },
      effectiveDate: { ...scenario.rolloverDate },
    }, 'presented');
  }

  if (session.config.simulationId === 'conflict') {
    return withRecoveryProof({
      ...session,
      confirmationStatus: 'conflict',
      simulationConsumed: true,
      pendingConflictSource: buildConflictSource(scenario),
    }, 'presented');
  }

  return withRecoveryProof({
    ...session,
    confirmationStatus: 'offline',
    simulationConsumed: true,
  }, 'presented');
}

function canShowReceipt(session, scenario) {
  return (
    CONFIRMED_SESSIONS.has(session) &&
    session.screen === 'receipt' &&
    session.confirmationStatus === 'confirmed' &&
    isDraftValid(session, scenario)
  );
}

function rebuildAfterConflict(session, scenario) {
  if (
    session.confirmationStatus !== 'conflict' ||
    !isSessionEnvelopeTrusted(session, scenario)
  ) return session;

  const reloaded = buildConflictSource(scenario);
  return withRecoveryProof({
    ...session,
    screen: 'step2',
    targetId: null,
    decision: null,
    reduceMode: null,
    sourceCommitment: cloneCommitment(reloaded),
    pendingConflictSource: null,
    reloadedConflictSummary: scenario.conflictUpdate.summary,
    afterDays: [...reloaded.scheduledDays],
    afterMinimumAction: reloaded.minimumAction,
    replacement: {
      fixtureId: null,
      name: '',
      minimumAction: '',
      scheduledDays: [],
    },
    confirmationStatus: 'idle',
  }, 'recovered');
}

function acknowledgeRollover(session, scenario) {
  if (
    session.confirmationStatus !== 'rollover' ||
    !isSessionEnvelopeTrusted(session, scenario)
  ) return session;

  return withRecoveryProof({
    ...session,
    screen: 'step3',
    confirmationStatus: 'idle',
  }, 'recovered');
}

function resetForDecision(session, decision, scenario) {
  const source = getSourceCommitment(session, scenario);
  return {
    ...session,
    decision,
    reduceMode: null,
    afterDays: [...source.scheduledDays],
    afterMinimumAction: source.minimumAction,
    replacement: {
      fixtureId: null,
      name: '',
      minimumAction: '',
      scheduledDays: [],
    },
    confirmationStatus: 'idle',
  };
}

function resetForReduceMode(session, reduceMode, scenario) {
  const source = getSourceCommitment(session, scenario);
  return {
    ...session,
    reduceMode,
    afterDays: [...source.scheduledDays],
    afterMinimumAction: source.minimumAction,
    confirmationStatus: 'idle',
  };
}

module.exports = {
  DEFAULT_TEAM_CONFIG,
  acknowledgeRollover,
  attemptConfirmation,
  buildAfterCommitment,
  canShowReceipt,
  createSession,
  dayLabels,
  describeChange,
  getSourceCommitment,
  hasKnownUniqueDays,
  includesSameDays,
  isDraftValid,
  isSessionEnvelopeTrusted,
  rebuildAfterConflict,
  resetForDecision,
  resetForReduceMode,
  toggleDay,
};
