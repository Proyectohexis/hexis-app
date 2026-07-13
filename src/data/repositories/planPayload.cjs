'use strict';

function buildInitialHabitPayload(habits) {
  return (habits || []).map((habit, position) => ({
    name: habit.name.trim(),
    minimum_action: habit.minimum_action.trim(),
    scheduled_weekdays: [...habit.scheduled_weekdays].sort((a, b) => a - b),
    cue_type: habit.reminder_time ? 'time' : 'none',
    cue_value: habit.reminder_time ? { time: habit.reminder_time } : {},
    reminder_time: habit.reminder_time || null,
    position,
  }));
}

module.exports = { buildInitialHabitPayload };
