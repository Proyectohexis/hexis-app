begin;

-- A portable, machine-readable snapshot of the authenticated account. This
-- function is SECURITY DEFINER only so soft-deleted rows remain visible in an
-- export. Every relation is still explicitly constrained to auth.uid().
create function public.export_current_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using
      errcode = 'HX401',
      message = 'authentication required';
  end if;

  return pg_catalog.jsonb_build_object(
    'format', 'hexis-account-export',
    'schema_version', 1,
    'generated_at', pg_catalog.statement_timestamp(),
    'account', pg_catalog.jsonb_build_object(
      'id', caller_id,
      'email', (select auth.jwt() ->> 'email')
    ),
    'data', pg_catalog.jsonb_build_object(
      'profile', coalesce(
        (
          select pg_catalog.jsonb_build_object(
            'id', profile_row.id,
            'display_name', profile_row.display_name,
            'focus_domain', profile_row.focus_domain,
            'timezone', profile_row.timezone,
            'locale', profile_row.locale,
            'unit_system', profile_row.unit_system,
            'created_at', profile_row.created_at,
            'updated_at', profile_row.updated_at
          )
          from public.profiles profile_row
          where profile_row.id = caller_id
        ),
        'null'::jsonb
      ),
      'plans', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', plan_row.id,
              'user_id', plan_row.user_id,
              'identity_statement', plan_row.identity_statement,
              'outcome_statement', plan_row.outcome_statement,
              'why_statement', plan_row.why_statement,
              'timezone', plan_row.timezone,
              'status', plan_row.status,
              'starts_on', plan_row.starts_on,
              'ends_on', plan_row.ends_on,
              'created_at', plan_row.created_at,
              'updated_at', plan_row.updated_at
            )
            order by plan_row.created_at, plan_row.id
          )
          from public.plans plan_row
          where plan_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'habits', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', habit_row.id,
              'user_id', habit_row.user_id,
              'name', habit_row.name,
              'completed', habit_row.completed,
              'completed_date', habit_row.completed_date,
              'model_version', habit_row.model_version,
              'plan_id', habit_row.plan_id,
              'lineage_id', habit_row.lineage_id,
              'replaces_habit_id', habit_row.replaces_habit_id,
              'version_number', habit_row.version_number,
              'minimum_action', habit_row.minimum_action,
              'cue_type', habit_row.cue_type,
              'cue_value', habit_row.cue_value,
              'scheduled_weekdays', habit_row.scheduled_weekdays,
              'reminder_time', habit_row.reminder_time,
              'timezone', habit_row.timezone,
              'status', habit_row.status,
              'position', habit_row.position,
              'starts_on', habit_row.starts_on,
              'ends_on', habit_row.ends_on,
              'created_at', habit_row.created_at,
              'updated_at', habit_row.updated_at
            )
            order by habit_row.created_at, habit_row.id
          )
          from public.habits habit_row
          where habit_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'habit_completion_events', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', event_row.id,
              'user_id', event_row.user_id,
              'habit_id', event_row.habit_id,
              'local_date', event_row.local_date,
              'occurred_at', event_row.occurred_at,
              'timezone', event_row.timezone,
              'event_type', event_row.event_type,
              'completion_level', event_row.completion_level,
              'source', event_row.source,
              'supersedes_event_id', event_row.supersedes_event_id,
              'created_at', event_row.created_at
            )
            order by event_row.created_at, event_row.id
          )
          from public.habit_completion_events event_row
          where event_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'habit_schedule_exceptions', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', exception_row.id,
              'user_id', exception_row.user_id,
              'habit_id', exception_row.habit_id,
              'local_date', exception_row.local_date,
              'kind', exception_row.kind,
              'reason', exception_row.reason,
              'deleted_at', exception_row.deleted_at,
              'created_at', exception_row.created_at,
              'updated_at', exception_row.updated_at
            )
            order by exception_row.created_at, exception_row.id
          )
          from public.habit_schedule_exceptions exception_row
          where exception_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'transformation_metrics', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', metric_row.id,
              'user_id', metric_row.user_id,
              'plan_id', metric_row.plan_id,
              'kind', metric_row.kind,
              'label', metric_row.label,
              'unit', metric_row.unit,
              'min_value', metric_row.min_value,
              'max_value', metric_row.max_value,
              'status', metric_row.status,
              'created_at', metric_row.created_at,
              'updated_at', metric_row.updated_at
            )
            order by metric_row.created_at, metric_row.id
          )
          from public.transformation_metrics metric_row
          where metric_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'metric_entries', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', entry_row.id,
              'user_id', entry_row.user_id,
              'metric_id', entry_row.metric_id,
              'value', entry_row.value,
              'local_date', entry_row.local_date,
              'recorded_at', entry_row.recorded_at,
              'note', entry_row.note,
              'deleted_at', entry_row.deleted_at,
              'created_at', entry_row.created_at,
              'updated_at', entry_row.updated_at
            )
            order by entry_row.created_at, entry_row.id
          )
          from public.metric_entries entry_row
          where entry_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'weekly_reviews', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', review_row.id,
              'user_id', review_row.user_id,
              'plan_id', review_row.plan_id,
              'week_start', review_row.week_start,
              'reflection', review_row.reflection,
              'decision', review_row.decision,
              'created_at', review_row.created_at,
              'updated_at', review_row.updated_at
            )
            order by review_row.week_start, review_row.id
          )
          from public.weekly_reviews review_row
          where review_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'legacy_progress', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', progress_row.id,
              'user_id', progress_row.user_id,
              'weight', progress_row.weight,
              'notes', progress_row.notes,
              'date', progress_row.date,
              'created_at', progress_row.created_at
            )
            order by progress_row.date, progress_row.id
          )
          from public.progress progress_row
          where progress_row.user_id = caller_id
        ),
        '[]'::jsonb
      ),
      'legacy_streak', coalesce(
        (
          select pg_catalog.jsonb_build_object(
            'user_id', streak_row.user_id,
            'goal', streak_row.goal,
            'current_streak', streak_row.current_streak,
            'last_completed', streak_row.last_completed,
            'updated_at', streak_row.updated_at
          )
          from public.streaks streak_row
          where streak_row.user_id = caller_id
        ),
        'null'::jsonb
      )
    )
  );
end
$$;

revoke all on function public.export_current_account()
  from public, anon, authenticated;
grant execute on function public.export_current_account()
  to authenticated;

comment on function public.export_current_account() is
  'Exports the authenticated HEXIS account as versioned JSON, including soft-deleted user records but excluding credentials, sessions and internal operation receipts.';

commit;
