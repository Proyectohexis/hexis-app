'use strict';

function aggregateLineageBreakdown(summaryCommitments, habits) {
  const habitsById = new Map((habits || []).map((habit) => [habit.id, habit]));
  const grouped = new Map();

  for (const item of summaryCommitments || []) {
    if (!item.scheduled_opportunities && !item.completed_opportunities) continue;
    const habit = habitsById.get(item.habit_id);
    if (!habit) continue;
    const lineageId = habit.lineage_id || habit.id;
    const current = grouped.get(lineageId) || {
      completed_opportunities: 0,
      habit,
      lineage_id: lineageId,
      recovery_status: 'steady',
      scheduled_opportunities: 0,
    };

    current.completed_opportunities += item.completed_opportunities;
    current.scheduled_opportunities += item.scheduled_opportunities;
    if ((habit.version_number || 1) >= (current.habit.version_number || 1)) {
      current.habit = habit;
    }
    if (item.recovery?.status === 'reentry_due') {
      current.recovery_status = 'reentry_due';
    } else if (item.recovery?.status === 'recovered' && current.recovery_status !== 'reentry_due') {
      current.recovery_status = 'recovered';
    }
    grouped.set(lineageId, current);
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    consistency_rate: item.scheduled_opportunities
      ? item.completed_opportunities / item.scheduled_opportunities
      : null,
  }));
}

module.exports = { aggregateLineageBreakdown };
