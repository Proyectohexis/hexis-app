'use strict';

function selectStableCheckInOperation({
  existing,
  intendedCompleted,
  completionLevel,
  createId,
  occurredAt,
}) {
  const samePayload = existing?.intendedCompleted === intendedCompleted
    && (!intendedCompleted || existing.completionLevel === completionLevel);
  if (samePayload) return existing;

  return {
    id: createId(),
    intendedCompleted,
    completionLevel,
    occurredAt,
  };
}

module.exports = { selectStableCheckInOperation };
