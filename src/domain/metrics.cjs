'use strict';

const {
  assertDateRange,
  endOfIsoWeek,
  enumerateDateKeys,
  parseDateKey,
  startOfIsoWeek,
} = require('./dateKeys.cjs');
const { deriveCompletionStates } = require('./completionEvents.cjs');
const {
  assertValidPlan,
  isCommitmentScheduled,
  normalizeCommitments,
} = require('./plans.cjs');

const SEC_METRIC_VERSION = 'sec.v1';
const SEC_METRIC_DEFINITION = Object.freeze({
  evidence_date_cap: 3,
  metric_version: SEC_METRIC_VERSION,
  review_required: true,
  week_starts_on: 'monday',
});

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} es obligatorio.`);
  }
}

function stateKey(habitId, localDate) {
  return `${habitId}\u0000${localDate}`;
}

function buildCompletionIndex(events) {
  return new Map(
    deriveCompletionStates(events).map((state) => [
      stateKey(state.habit_id, state.local_date),
      state,
    ]),
  );
}

function listScheduledOpportunities({ plan, from, through }) {
  assertDateRange(from, through);
  const commitments = normalizeCommitments(plan);
  const opportunities = [];

  for (const dateKey of enumerateDateKeys(from, through)) {
    for (const commitment of commitments) {
      if (isCommitmentScheduled(commitment, dateKey)) {
        opportunities.push({
          habit_id: commitment.id,
          local_date: dateKey,
        });
      }
    }
  }

  return opportunities;
}

function continuityForTimeline(timeline) {
  let bestRun = 0;
  let run = 0;
  for (const entry of timeline) {
    run = entry.completed ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }

  return {
    best_run: bestRun,
    current_run: timeline.length > 0 && timeline.at(-1).completed ? run : 0,
  };
}

function recoveryForTimeline(timeline) {
  const episodes = [];
  let openEpisode = null;

  for (const entry of timeline) {
    if (!entry.completed) {
      if (!openEpisode) {
        openEpisode = {
          missed_dates: [],
          missed_opportunities: 0,
          recovered_on: null,
          started_on: entry.local_date,
          status: 'open',
        };
      }
      openEpisode.missed_dates.push(entry.local_date);
      openEpisode.missed_opportunities += 1;
      continue;
    }

    if (openEpisode) {
      openEpisode.recovered_on = entry.local_date;
      openEpisode.status = 'recovered';
      episodes.push(openEpisode);
      openEpisode = null;
    }
  }

  if (openEpisode) episodes.push(openEpisode);
  const recovered = episodes.filter((episode) => episode.status === 'recovered').length;
  const latest = episodes.at(-1) ?? null;

  return {
    episodes,
    recovered_episodes: recovered,
    recovery_rate: episodes.length === 0 ? null : recovered / episodes.length,
    status:
      latest == null
        ? 'steady'
        : latest.status === 'open'
          ? 'reentry_due'
          : 'recovered',
  };
}

function calculateConsistency({ plan, events, from, through }) {
  assertValidPlan(plan);
  const opportunities = listScheduledOpportunities({ plan, from, through });
  const completionIndex = buildCompletionIndex(events);
  const timeline = opportunities.map((opportunity) => ({
    ...opportunity,
    completed:
      completionIndex.get(stateKey(opportunity.habit_id, opportunity.local_date))
        ?.completed === true,
  }));
  const completed = timeline.filter((entry) => entry.completed);
  const scheduledDates = [...new Set(timeline.map((entry) => entry.local_date))];
  const evidenceDates = [...new Set(completed.map((entry) => entry.local_date))];

  const commitments = normalizeCommitments(plan).map((commitment) => {
    const commitmentTimeline = timeline.filter(
      (entry) => entry.habit_id === commitment.id,
    );
    const completedCount = commitmentTimeline.filter((entry) => entry.completed).length;
    return {
      completed_opportunities: completedCount,
      consistency_rate:
        commitmentTimeline.length === 0
          ? null
          : completedCount / commitmentTimeline.length,
      habit_id: commitment.id,
      recovery: recoveryForTimeline(commitmentTimeline),
      scheduled_opportunities: commitmentTimeline.length,
      ...continuityForTimeline(commitmentTimeline),
    };
  });

  return {
    commitments,
    completed_opportunities: completed.length,
    consistency_rate:
      timeline.length === 0 ? null : completed.length / timeline.length,
    evidence_dates: evidenceDates,
    from,
    missed_opportunities: timeline.length - completed.length,
    scheduled_dates: scheduledDates,
    scheduled_opportunities: timeline.length,
    through,
  };
}

function assertMetricVersion(metricVersion) {
  if (metricVersion !== SEC_METRIC_VERSION) {
    throw new RangeError(`metric_version no soportada: ${String(metricVersion)}.`);
  }
}

function hasWeeklyReview(reviews, planId, weekStart) {
  if (!Array.isArray(reviews)) {
    throw new TypeError('weekly_reviews debe ser una lista.');
  }
  return reviews.some(
    (review) =>
      review && review.plan_id === planId && review.week_start === weekStart,
  );
}

function evaluateSecWeek({
  user_id: userId,
  plan,
  events,
  weekly_reviews: weeklyReviews,
  week_start: weekStart,
  as_of_date: asOfDate,
  metric_version: metricVersion = SEC_METRIC_VERSION,
}) {
  assertMetricVersion(metricVersion);
  assertValidPlan(plan);
  requireText(userId ?? plan.user_id, 'user_id');
  parseDateKey(weekStart, 'week_start');
  parseDateKey(asOfDate, 'as_of_date');
  if (startOfIsoWeek(weekStart) !== weekStart) {
    throw new RangeError('week_start debe ser lunes.');
  }

  const weekEnd = endOfIsoWeek(weekStart);
  const weekClosed = asOfDate > weekEnd;
  const opportunities = listScheduledOpportunities({
    from: weekStart,
    plan,
    through: weekEnd,
  });
  const scheduledDates = [...new Set(opportunities.map((item) => item.local_date))];
  const completionIndex = buildCompletionIndex(events);
  const evidenceDates = scheduledDates.filter((dateKey) =>
    opportunities.some(
      (opportunity) =>
        opportunity.local_date === dateKey &&
        completionIndex.get(stateKey(opportunity.habit_id, dateKey))?.completed === true,
    ),
  );
  const requiredEvidenceDates = Math.min(
    SEC_METRIC_DEFINITION.evidence_date_cap,
    scheduledDates.length,
  );
  const reviewCompleted = hasWeeklyReview(weeklyReviews, plan.id, weekStart);
  const eligible = weekClosed && scheduledDates.length > 0;
  const closed =
    eligible &&
    evidenceDates.length >= requiredEvidenceDates &&
    reviewCompleted;

  return {
    closed,
    eligibility_reason: !weekClosed
      ? 'week_not_closed'
      : scheduledDates.length === 0
        ? 'no_scheduled_dates'
        : 'eligible',
    eligible,
    evidence_date_count: evidenceDates.length,
    evidence_dates: evidenceDates,
    metric_version: metricVersion,
    required_evidence_dates: requiredEvidenceDates,
    review_completed: reviewCompleted,
    scheduled_date_count: scheduledDates.length,
    scheduled_dates: scheduledDates,
    user_id: userId ?? plan.user_id,
    week_end: weekEnd,
    week_start: weekStart,
  };
}

function calculateSecRate(evaluations, metricVersion = SEC_METRIC_VERSION) {
  assertMetricVersion(metricVersion);
  if (!Array.isArray(evaluations)) {
    throw new TypeError('evaluations debe ser una lista.');
  }

  const userIds = new Set();
  let weekStart = null;
  for (const evaluation of evaluations) {
    if (!evaluation || evaluation.metric_version !== metricVersion) {
      throw new TypeError('Todas las evaluaciones deben usar la misma metric_version.');
    }
    requireText(evaluation.user_id, 'evaluation.user_id');
    parseDateKey(evaluation.week_start, 'evaluation.week_start');
    if (weekStart == null) weekStart = evaluation.week_start;
    if (evaluation.week_start !== weekStart) {
      throw new TypeError('Todas las evaluaciones deben pertenecer a la misma semana.');
    }
    if (userIds.has(evaluation.user_id)) {
      throw new TypeError('Solo puede existir una evaluacion por usuario y semana.');
    }
    userIds.add(evaluation.user_id);
  }

  const eligible = evaluations.filter((evaluation) => evaluation.eligible);
  const closed = eligible.filter((evaluation) => evaluation.closed);
  return {
    closed_users: closed.length,
    eligible_users: eligible.length,
    metric_version: metricVersion,
    sec_rate: eligible.length === 0 ? null : closed.length / eligible.length,
    week_start: weekStart,
  };
}

module.exports = {
  SEC_METRIC_DEFINITION,
  SEC_METRIC_VERSION,
  calculateConsistency,
  calculateSecRate,
  evaluateSecWeek,
  listScheduledOpportunities,
};
