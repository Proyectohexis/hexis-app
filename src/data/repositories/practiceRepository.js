import { supabase } from '../../lib/supabase';
import { createOperationId } from '../../lib/operationId';
const { deriveCompletionState } = require('../../domain/completionEvents.cjs');
const { isCommitmentScheduled } = require('../../domain/plans.cjs');

const HABIT_COLUMNS = [
  'id',
  'user_id',
  'plan_id',
  'lineage_id',
  'replaces_habit_id',
  'version_number',
  'name',
  'minimum_action',
  'cue_type',
  'cue_value',
  'scheduled_weekdays',
  'reminder_time',
  'timezone',
  'status',
  'position',
  'starts_on',
  'ends_on',
  'created_at',
  'updated_at',
].join(',');

const EVENT_COLUMNS = [
  'id',
  'user_id',
  'habit_id',
  'local_date',
  'occurred_at',
  'timezone',
  'event_type',
  'completion_level',
  'source',
  'client_operation_id',
  'supersedes_event_id',
  'created_at',
].join(',');

const EXCEPTION_COLUMNS = [
  'id',
  'user_id',
  'habit_id',
  'local_date',
  'kind',
  'reason',
  'client_operation_id',
  'created_at',
  'deleted_at',
].join(',');

function configurationError() {
  return new Error('Supabase no está configurado.');
}

export function getPracticeRepositoryErrorMessage(error) {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)) {
    return 'El backend de desarrollo todavía no tiene el modelo de eventos de HEXIS.';
  }
  if (error?.code === 'HX409' || error?.message?.includes('HX409')) {
    return 'La operación ya existe con otro contenido. Recarga antes de reintentar.';
  }
  return 'No pudimos confirmar la evidencia con el servidor. Revisa la conexión e inténtalo de nuevo.';
}

export async function getPlanHabits({ userId, planId, includeArchived = false }) {
  if (!supabase) return { data: [], error: configurationError() };

  let query = supabase
    .from('habits')
    .select(HABIT_COLUMNS)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeArchived) query = query.neq('status', 'archived');
  const { data, error } = await query;
  return { data: data || [], error };
}

export function latestHabitVersions(habits) {
  const latestByLineage = new Map();
  for (const habit of habits || []) {
    const lineageId = habit.lineage_id || habit.id;
    const current = latestByLineage.get(lineageId);
    if (!current || (habit.version_number || 1) > (current.version_number || 1)) {
      latestByLineage.set(lineageId, habit);
    }
  }
  return [...latestByLineage.values()].sort((left, right) => (
    left.position === right.position
      ? left.created_at.localeCompare(right.created_at)
      : left.position - right.position
  ));
}

export async function getCompletionEvents({ userId, habitIds, from, through }) {
  if (!supabase) return { data: [], error: configurationError() };
  if (!habitIds?.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('habit_completion_events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .in('habit_id', habitIds)
    .gte('local_date', from)
    .lte('local_date', through)
    .order('created_at', { ascending: true });

  return { data: data || [], error };
}

export async function getScheduleExceptions({ userId, habitIds, from, through }) {
  if (!supabase) return { data: [], error: configurationError() };
  if (!habitIds?.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('habit_schedule_exceptions')
    .select(EXCEPTION_COLUMNS)
    .eq('user_id', userId)
    .in('habit_id', habitIds)
    .gte('local_date', from)
    .lte('local_date', through)
    .is('deleted_at', null)
    .order('local_date', { ascending: true });

  return { data: data || [], error };
}

export async function getTodayPractice({ userId, planId, localDate }) {
  // A future replacement/pause closes the current version by date and may also
  // change its raw status immediately. Today must therefore be derived from the
  // validity interval, not from the denormalized status flag.
  const habitsResult = await getPlanHabits({ userId, planId, includeArchived: true });
  if (habitsResult.error) return { data: [], error: habitsResult.error };

  const exceptionsResult = await getScheduleExceptions({
    userId,
    habitIds: habitsResult.data.map((habit) => habit.id),
    from: localDate,
    through: localDate,
  });
  if (exceptionsResult.error) return { data: [], error: exceptionsResult.error };

  const applicableHabits = habitsResult.data.map((habit) => ({
    ...habit,
    excluded_dates: exceptionsResult.data
      .filter((exception) => exception.habit_id === habit.id)
      .map((exception) => exception.local_date),
  })).filter((habit) => (
    isCommitmentScheduled({
      ...habit,
      pause_intervals: habit.pause_intervals || [],
    }, localDate)
  ));

  const eventsResult = await getCompletionEvents({
    userId,
    habitIds: applicableHabits.map((habit) => habit.id),
    from: localDate,
    through: localDate,
  });
  if (eventsResult.error) return { data: [], error: eventsResult.error };

  const data = applicableHabits.map((habit) => {
    const events = eventsResult.data.filter((event) => event.habit_id === habit.id);
    const completion = deriveCompletionState(events, habit.id, localDate);
    return { ...habit, completion, completed: completion.completed };
  });

  return { data, error: null };
}

export async function recordHabitCompletion({
  habitId,
  localDate,
  timeZone,
  completionLevel = 'full',
  source = 'manual',
  occurredAt = new Date().toISOString(),
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };

  const { data, error } = await supabase.rpc('record_habit_completion', {
    p_habit_id: habitId,
    p_local_date: localDate,
    p_occurred_at: occurredAt,
    p_timezone: timeZone,
    p_client_operation_id: clientOperationId,
    p_completion_level: completionLevel,
    p_source: source,
  });

  return { data, error, clientOperationId };
}

export async function retractHabitCompletion({
  habitId,
  localDate,
  timeZone,
  source = 'manual',
  occurredAt = new Date().toISOString(),
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };

  const { data, error } = await supabase.rpc('retract_habit_completion', {
    p_habit_id: habitId,
    p_local_date: localDate,
    p_occurred_at: occurredAt,
    p_timezone: timeZone,
    p_client_operation_id: clientOperationId,
    p_source: source,
  });

  return { data, error, clientOperationId };
}

function normalizedHabitArguments(habit) {
  return {
    p_name: habit.name.trim(),
    p_minimum_action: habit.minimum_action.trim(),
    p_scheduled_weekdays: [...habit.scheduled_weekdays].sort((a, b) => a - b),
    p_timezone: habit.timezone,
    p_cue_type: habit.reminder_time ? 'time' : 'none',
    p_cue_value: habit.reminder_time ? { time: habit.reminder_time } : {},
    p_reminder_time: habit.reminder_time || null,
    p_position: habit.position ?? null,
  };
}

export async function createPlanHabit({
  planId,
  habit,
  effectiveOn,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('create_habit', {
    p_plan_id: planId,
    ...normalizedHabitArguments(habit),
    p_client_operation_id: clientOperationId,
    p_effective_on: effectiveOn,
  });
  return { data, error, clientOperationId };
}

export async function replaceHabitConfiguration({
  habitId,
  habit,
  effectiveOn,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('replace_habit_configuration', {
    p_habit_id: habitId,
    ...normalizedHabitArguments(habit),
    p_client_operation_id: clientOperationId,
    p_effective_on: effectiveOn,
  });
  return { data, error, clientOperationId };
}

export async function setHabitStatus({
  habitId,
  status,
  effectiveOn,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('set_habit_status', {
    p_habit_id: habitId,
    p_status: status,
    p_effective_on: effectiveOn,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}

export async function setHabitScheduleException({
  habitId,
  localDate,
  kind = 'rest',
  reason = null,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('set_habit_schedule_exception', {
    p_habit_id: habitId,
    p_local_date: localDate,
    p_kind: kind,
    p_reason: reason,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}

export async function removeHabitScheduleException({
  exceptionId,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('remove_habit_schedule_exception', {
    p_exception_id: exceptionId,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}
