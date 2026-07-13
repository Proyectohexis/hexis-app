'use strict';

function firstAvailableActivePosition(habits) {
  const occupied = new Set((habits || [])
    .filter((habit) => ['active', 'scheduled'].includes(habit.effective_status || habit.status))
    .map((habit) => habit.position));
  return [0, 1, 2].find((position) => !occupied.has(position)) ?? null;
}

module.exports = { firstAvailableActivePosition };
