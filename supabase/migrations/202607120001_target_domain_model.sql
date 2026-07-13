begin;

-- HEXIS target domain model.
--
-- This migration is intentionally additive. It keeps the legacy habits,
-- progress and streaks contracts intact while introducing the event-sourced
-- model used by the new client. It must only run after the legacy baseline,
-- a remote schema inventory and a tested backup/restore exercise.

do $$
declare
  target_relation text;
  unexpected_policies text;
begin
  if to_regclass('public.habits') is null then
    raise exception using
      errcode = 'HX500',
      message = 'HEXIS baseline missing: public.habits does not exist';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'habits'
      and column_name = 'model_version'
  ) then
    raise exception using
      errcode = 'HX500',
      message = 'Target habits columns already exist; inventory the partial migration before continuing';
  end if;

  foreach target_relation in array array[
    'profiles',
    'plans',
    'habit_completion_events',
    'habit_schedule_exceptions',
    'transformation_metrics',
    'metric_entries',
    'weekly_reviews',
    'habit_daily_evidence'
  ]
  loop
    if to_regclass(format('public.%I', target_relation)) is not null then
      raise exception using
        errcode = 'HX500',
        message = format(
          'Target relation public.%I already exists; inventory it before applying this migration',
          target_relation
        );
    end if;
  end loop;

  if exists (select 1 from pg_namespace where nspname = 'hexis_private') then
    raise exception using
      errcode = 'HX500',
      message = 'Schema hexis_private already exists; inventory it before applying this migration';
  end if;

  select string_agg(format('%I', policyname), ', ' order by policyname)
    into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'habits'
    and policyname not in (
      'hexis_habits_select_own',
      'hexis_habits_insert_own',
      'hexis_habits_update_own',
      'hexis_habits_delete_own'
    );

  if unexpected_policies is not null then
    raise exception using
      errcode = 'HX500',
      message = format(
        'Unexpected policies on public.habits: %s. Inventory them before continuing',
        unexpected_policies
      );
  end if;
end
$$;

create schema hexis_private;
revoke all on schema hexis_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null or char_length(btrim(display_name)) between 1 and 80
  ),
  focus_domain text check (
    focus_domain is null or char_length(btrim(focus_domain)) between 1 and 40
  ),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64),
  locale text not null default 'es'
    check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  unit_system text not null default 'metric'
    check (unit_system in ('metric', 'imperial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_statement text not null
    check (char_length(btrim(identity_statement)) between 3 and 240),
  outcome_statement text not null
    check (char_length(btrim(outcome_statement)) between 3 and 240),
  why_statement text not null
    check (char_length(btrim(why_statement)) between 3 and 500),
  timezone text not null check (char_length(timezone) between 1 and 64),
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  starts_on date not null,
  ends_on date,
  client_operation_id uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_date_range_check check (
    ends_on is null or ends_on >= starts_on
  ),
  constraint plans_id_user_id_key unique (id, user_id),
  constraint plans_user_operation_key unique (user_id, client_operation_id)
);

create unique index plans_one_active_per_user_idx
  on public.plans (user_id)
  where status = 'active';

create index plans_user_status_created_idx
  on public.plans (user_id, status, created_at desc);

-- Mark existing rows as legacy before changing the default. Every subsequent
-- insert receives model_version = 2 and must satisfy the target contract.
alter table public.habits add column model_version smallint;
update public.habits set model_version = 1 where model_version is null;
alter table public.habits alter column model_version set default 2;
alter table public.habits alter column model_version set not null;

alter table public.habits
  add column plan_id uuid,
  add column lineage_id uuid,
  add column replaces_habit_id uuid,
  add column version_number integer not null default 1,
  add column minimum_action text,
  add column cue_type text not null default 'none',
  add column cue_value jsonb not null default '{}'::jsonb,
  add column scheduled_weekdays smallint[] not null
    default array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  add column reminder_time time,
  add column timezone text not null default 'UTC',
  add column status text not null default 'active',
  add column position smallint not null default 0,
  add column starts_on date not null default current_date,
  add column ends_on date,
  add column updated_at timestamptz not null default now();

update public.habits
set lineage_id = id
where lineage_id is null;

alter table public.habits alter column lineage_id set not null;

alter table public.habits
  add constraint habits_model_version_check
    check (model_version in (1, 2)),
  add constraint habits_id_user_id_key
    unique (id, user_id),
  add constraint habits_plan_user_fk
    foreign key (plan_id, user_id)
    references public.plans (id, user_id)
    on delete cascade
    not valid,
  add constraint habits_lineage_user_fk
    foreign key (lineage_id, user_id)
    references public.habits (id, user_id)
    on delete cascade
    not valid,
  add constraint habits_replaces_user_fk
    foreign key (replaces_habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade
    not valid,
  add constraint habits_lineage_shape_check
    check (
      model_version = 1
      or (
        replaces_habit_id is null
        and lineage_id = id
        and version_number = 1
      )
      or (
        replaces_habit_id is not null
        and lineage_id <> id
        and version_number > 1
      )
    ),
  add constraint habits_target_contract_check
    check (
      model_version = 1
      or (
        plan_id is not null
        and minimum_action is not null
        and char_length(btrim(minimum_action)) between 1 and 160
        and char_length(timezone) between 1 and 64
        and position between 0 and 2
        and (ends_on is null or ends_on >= starts_on)
      )
    ),
  add constraint habits_cue_type_check
    check (cue_type in ('time', 'event', 'location', 'none')),
  add constraint habits_cue_value_check
    check (
      jsonb_typeof(cue_value) = 'object'
      and octet_length(cue_value::text) <= 1000
      and (
        model_version = 1
        or (cue_type = 'none' and cue_value = '{}'::jsonb)
        or (cue_type = 'time' and reminder_time is not null)
        or (
          cue_type in ('event', 'location')
          and cue_value ? 'description'
          and char_length(btrim(cue_value ->> 'description')) between 1 and 160
        )
      )
    ),
  add constraint habits_schedule_check
    check (
      cardinality(scheduled_weekdays) between 1 and 7
      and scheduled_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      and cardinality(scheduled_weekdays) =
        (case when scheduled_weekdays @> array[0]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[1]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[2]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[3]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[4]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[5]::smallint[] then 1 else 0 end)
        + (case when scheduled_weekdays @> array[6]::smallint[] then 1 else 0 end)
    ),
  add constraint habits_status_check
    check (status in ('active', 'paused', 'archived'));

alter table public.habits validate constraint habits_plan_user_fk;
alter table public.habits validate constraint habits_lineage_user_fk;
alter table public.habits validate constraint habits_replaces_user_fk;

create unique index habits_one_successor_idx
  on public.habits (replaces_habit_id)
  where replaces_habit_id is not null;

create unique index habits_active_plan_position_idx
  on public.habits (plan_id, position)
  where model_version = 2 and status = 'active';

create index habits_user_status_position_idx
  on public.habits (user_id, status, position)
  where model_version = 2;

create index habits_plan_status_position_idx
  on public.habits (plan_id, status, position)
  where model_version = 2;

create table public.habit_completion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  local_date date not null,
  occurred_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  event_type text not null check (event_type in ('recorded', 'retracted')),
  completion_level text check (completion_level in ('minimum', 'full')),
  source text not null default 'manual'
    check (source in ('manual', 'offline_sync', 'integration')),
  client_operation_id uuid not null,
  supersedes_event_id uuid,
  created_at timestamptz not null default now(),
  constraint habit_completion_events_id_user_key unique (id, user_id),
  constraint habit_completion_events_user_operation_key
    unique (user_id, client_operation_id),
  constraint habit_completion_events_habit_user_fk
    foreign key (habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade,
  constraint habit_completion_events_supersedes_user_fk
    foreign key (supersedes_event_id, user_id)
    references public.habit_completion_events (id, user_id),
  constraint habit_completion_events_shape_check check (
    (
      event_type = 'recorded'
      and completion_level is not null
      and supersedes_event_id is null
    )
    or (
      event_type = 'retracted'
      and completion_level is null
      and supersedes_event_id is not null
    )
  )
);

create unique index habit_completion_one_retraction_idx
  on public.habit_completion_events (supersedes_event_id)
  where event_type = 'retracted';

create index habit_completion_user_day_idx
  on public.habit_completion_events
  (user_id, local_date desc, occurred_at desc);

create index habit_completion_habit_day_idx
  on public.habit_completion_events
  (user_id, habit_id, local_date, created_at desc);

create table public.habit_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  local_date date not null,
  kind text not null check (kind in ('rest', 'skip')),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 240),
  client_operation_id uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_schedule_exceptions_habit_user_fk
    foreign key (habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade,
  constraint habit_schedule_exceptions_id_user_key
    unique (id, user_id),
  constraint habit_schedule_exceptions_user_habit_date_key
    unique (user_id, habit_id, local_date),
  constraint habit_schedule_exceptions_user_operation_key
    unique (user_id, client_operation_id)
);

create index habit_schedule_exceptions_today_idx
  on public.habit_schedule_exceptions (user_id, local_date, habit_id);

create table public.transformation_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  kind text not null check (kind in ('weight', 'circumference', 'custom')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  unit text not null check (char_length(btrim(unit)) between 1 and 20),
  min_value numeric(14, 4) not null default -1000000,
  max_value numeric(14, 4) not null default 1000000,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  client_operation_id uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transformation_metrics_bounds_check check (
    min_value < max_value
  ),
  constraint transformation_metrics_id_user_key unique (id, user_id),
  constraint transformation_metrics_user_operation_key
    unique (user_id, client_operation_id),
  constraint transformation_metrics_plan_user_fk
    foreign key (plan_id, user_id)
    references public.plans (id, user_id)
    on delete cascade
);

create unique index transformation_metrics_one_active_per_plan_idx
  on public.transformation_metrics (plan_id)
  where status = 'active';

create index transformation_metrics_user_status_idx
  on public.transformation_metrics (user_id, status, created_at);

create table public.metric_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_id uuid not null,
  value numeric(14, 4) not null,
  local_date date not null,
  recorded_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500),
  client_operation_id uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_entries_id_user_key unique (id, user_id),
  constraint metric_entries_user_operation_key
    unique (user_id, client_operation_id),
  constraint metric_entries_metric_user_fk
    foreign key (metric_id, user_id)
    references public.transformation_metrics (id, user_id)
    on delete cascade
);

create index metric_entries_metric_date_idx
  on public.metric_entries (metric_id, local_date desc, recorded_at desc);

create index metric_entries_user_date_idx
  on public.metric_entries (user_id, local_date desc, recorded_at desc);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  week_start date not null,
  reflection text not null
    check (char_length(btrim(reflection)) between 1 and 1000),
  decision text not null
    check (decision in ('keep', 'reduce', 'increase', 'replace')),
  client_operation_id uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reviews_monday_check check (
    extract(isodow from week_start) = 1
  ),
  constraint weekly_reviews_user_plan_week_key
    unique (user_id, plan_id, week_start),
  constraint weekly_reviews_user_operation_key
    unique (user_id, client_operation_id),
  constraint weekly_reviews_plan_user_fk
    foreign key (plan_id, user_id)
    references public.plans (id, user_id)
    on delete cascade
);

create index weekly_reviews_user_week_idx
  on public.weekly_reviews (user_id, week_start desc);

create function hexis_private.assert_timezone(p_timezone text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception using
      errcode = 'HX422',
      message = 'timezone must be a recognized IANA timezone';
  end if;
end
$$;

create function hexis_private.validate_timezone_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform hexis_private.assert_timezone(new.timezone);
  return new;
end
$$;

create function hexis_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create function hexis_private.validate_completion_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  habit_row public.habits%rowtype;
  superseded_row public.habit_completion_events%rowtype;
  validation_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform hexis_private.assert_timezone(new.timezone);

  if new.source = 'integration' and (select auth.uid()) is not null then
    raise exception using
      errcode = 'HX403',
      message = 'integration source is reserved for trusted server operations';
  end if;

  if new.event_type = 'recorded'
    and (pg_catalog.timezone(new.timezone, new.occurred_at))::date <> new.local_date
  then
    raise exception using
      errcode = 'HX422',
      message = 'local_date does not match occurred_at in timezone';
  end if;

  select *
    into habit_row
  from public.habits
  where id = new.habit_id
    and user_id = new.user_id;

  if not found or habit_row.model_version <> 2 then
    raise exception using
      errcode = 'HX403',
      message = 'habit is unavailable for this user';
  end if;

  if new.timezone <> habit_row.timezone then
    raise exception using
      errcode = 'HX422',
      message = 'event timezone must match the frozen habit timezone';
  end if;

  -- Five minutes absorbs ordinary mobile clock skew without allowing a
  -- client to pre-complete a future day. Retractions describe an earlier
  -- recorded event, so their audit timestamp is intentionally exempt.
  if new.event_type = 'recorded'
    and (
      new.local_date > (
        pg_catalog.timezone(habit_row.timezone, validation_now)
      )::date
      or new.occurred_at > validation_now + interval '5 minutes'
    )
  then
    raise exception using
      errcode = 'HX422',
      message = 'completion evidence cannot be recorded in the future';
  end if;

  if new.local_date < habit_row.starts_on
    or (habit_row.ends_on is not null and new.local_date > habit_row.ends_on)
    or not (
      extract(dow from new.local_date)::smallint = any(habit_row.scheduled_weekdays)
    )
  then
    raise exception using
      errcode = 'HX422',
      message = 'habit is not scheduled for local_date';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:event:' || new.user_id::text || ':' || new.habit_id::text || ':' || new.local_date::text,
      0
    )
  );

  -- The exception check belongs inside the same advisory critical section
  -- used by set_habit_schedule_exception. Otherwise two transactions can
  -- both validate first and commit contradictory active rows.
  if exists (
    select 1
    from public.habit_schedule_exceptions
    where user_id = new.user_id
      and habit_id = new.habit_id
      and local_date = new.local_date
      and deleted_at is null
  ) then
    raise exception using
      errcode = 'HX409',
      message = 'habit date is excluded by a rest or skip exception';
  end if;

  -- A concurrent retry with the same operation id must reach the unique
  -- constraint instead of being rejected as a second active completion.
  if exists (
    select 1
    from public.habit_completion_events
    where user_id = new.user_id
      and client_operation_id = new.client_operation_id
  ) then
    return new;
  end if;

  if new.event_type = 'recorded' then
    if exists (
      select 1
      from public.habit_completion_events recorded
      where recorded.user_id = new.user_id
        and recorded.habit_id = new.habit_id
        and recorded.local_date = new.local_date
        and recorded.event_type = 'recorded'
        and not exists (
          select 1
          from public.habit_completion_events retracted
          where retracted.user_id = recorded.user_id
            and retracted.event_type = 'retracted'
            and retracted.supersedes_event_id = recorded.id
        )
    ) then
      raise exception using
        errcode = 'HX409',
        message = 'habit already has active evidence for local_date';
    end if;
  else
    select *
      into superseded_row
    from public.habit_completion_events
    where id = new.supersedes_event_id
      and user_id = new.user_id;

    if not found
      or superseded_row.event_type <> 'recorded'
      or superseded_row.habit_id <> new.habit_id
      or superseded_row.local_date <> new.local_date
      or superseded_row.timezone <> new.timezone
    then
      raise exception using
        errcode = 'HX422',
        message = 'supersedes_event_id is not matching recorded evidence';
    end if;
  end if;

  return new;
end
$$;

create function hexis_private.validate_habit_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_row public.habits%rowtype;
begin
  if new.model_version = 1 then
    return new;
  end if;

  if new.replaces_habit_id is null then
    if new.lineage_id <> new.id or new.version_number <> 1 then
      raise exception using
        errcode = 'HX422',
        message = 'root habit must start its own lineage at version 1';
    end if;
    return new;
  end if;

  select *
    into previous_row
  from public.habits
  where id = new.replaces_habit_id
    and user_id = new.user_id;

  if not found
    or previous_row.model_version <> 2
    or previous_row.plan_id <> new.plan_id
    or previous_row.lineage_id <> new.lineage_id
    or new.version_number <> previous_row.version_number + 1
  then
    raise exception using
      errcode = 'HX422',
      message = 'replacement habit does not continue the previous lineage';
  end if;

  return new;
end
$$;

create function hexis_private.validate_schedule_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  habit_row public.habits%rowtype;
begin
  select *
    into habit_row
  from public.habits
  where id = new.habit_id
    and user_id = new.user_id;

  if not found or habit_row.model_version <> 2 then
    raise exception using
      errcode = 'HX403',
      message = 'habit is unavailable for this user';
  end if;

  if new.local_date < habit_row.starts_on
    or (habit_row.ends_on is not null and new.local_date > habit_row.ends_on)
    or not (
      extract(dow from new.local_date)::smallint = any(habit_row.scheduled_weekdays)
    )
  then
    raise exception using
      errcode = 'HX422',
      message = 'exception date is outside the habit schedule';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:event:' || new.user_id::text || ':' || new.habit_id::text || ':' || new.local_date::text,
      0
    )
  );

  if exists (
    select 1
    from public.habit_completion_events recorded
    where recorded.user_id = new.user_id
      and recorded.habit_id = new.habit_id
      and recorded.local_date = new.local_date
      and recorded.event_type = 'recorded'
      and not exists (
        select 1
        from public.habit_completion_events retracted
        where retracted.user_id = recorded.user_id
          and retracted.event_type = 'retracted'
          and retracted.supersedes_event_id = recorded.id
      )
  ) then
    raise exception using
      errcode = 'HX409',
      message = 'active evidence exists for the exception date';
  end if;

  return new;
end
$$;

create function hexis_private.prevent_client_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    raise exception using
      errcode = 'HX405',
      message = 'completion events are append-only; append a retraction instead';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$$;

create function hexis_private.validate_metric_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_row public.transformation_metrics%rowtype;
begin
  select *
    into metric_row
  from public.transformation_metrics
  where id = new.metric_id
    and user_id = new.user_id;

  if not found then
    raise exception using
      errcode = 'HX403',
      message = 'metric is unavailable for this user';
  end if;

  if new.value < metric_row.min_value or new.value > metric_row.max_value then
    raise exception using
      errcode = 'HX422',
      message = 'metric value is outside configured bounds';
  end if;

  return new;
end
$$;

create trigger profiles_timezone_guard
before insert or update of timezone on public.profiles
for each row execute function hexis_private.validate_timezone_column();

create trigger plans_timezone_guard
before insert or update of timezone on public.plans
for each row execute function hexis_private.validate_timezone_column();

create trigger habits_timezone_guard
before insert or update of timezone on public.habits
for each row execute function hexis_private.validate_timezone_column();

create trigger habits_version_guard
before insert or update of lineage_id, replaces_habit_id, version_number, plan_id, user_id
on public.habits
for each row execute function hexis_private.validate_habit_version();

create trigger habit_completion_timezone_guard
before insert on public.habit_completion_events
for each row execute function hexis_private.validate_completion_event();

create trigger habit_completion_append_only_guard
before update or delete on public.habit_completion_events
for each row execute function hexis_private.prevent_client_event_mutation();

create trigger habit_schedule_exceptions_guard
before insert or update of user_id, habit_id, local_date
on public.habit_schedule_exceptions
for each row execute function hexis_private.validate_schedule_exception();

create trigger metric_entries_bounds_guard
before insert or update of metric_id, user_id, value on public.metric_entries
for each row execute function hexis_private.validate_metric_entry();

create trigger profiles_updated_at
before update on public.profiles
for each row execute function hexis_private.set_updated_at();

create trigger plans_updated_at
before update on public.plans
for each row execute function hexis_private.set_updated_at();

create trigger habits_updated_at
before update on public.habits
for each row execute function hexis_private.set_updated_at();

create trigger habit_schedule_exceptions_updated_at
before update on public.habit_schedule_exceptions
for each row execute function hexis_private.set_updated_at();

create trigger transformation_metrics_updated_at
before update on public.transformation_metrics
for each row execute function hexis_private.set_updated_at();

create trigger metric_entries_updated_at
before update on public.metric_entries
for each row execute function hexis_private.set_updated_at();

create trigger weekly_reviews_updated_at
before update on public.weekly_reviews
for each row execute function hexis_private.set_updated_at();

create view public.habit_daily_evidence
with (security_invoker = true, security_barrier = true)
as
select
  recorded.id as recorded_event_id,
  recorded.user_id,
  recorded.habit_id,
  recorded.local_date,
  recorded.occurred_at,
  recorded.timezone,
  recorded.completion_level,
  recorded.source,
  recorded.created_at as recorded_at
from public.habit_completion_events recorded
where recorded.event_type = 'recorded'
  and not exists (
    select 1
    from public.habit_completion_events retracted
    where retracted.user_id = recorded.user_id
      and retracted.event_type = 'retracted'
      and retracted.supersedes_event_id = recorded.id
  );

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.habits enable row level security;
alter table public.habit_completion_events enable row level security;
alter table public.habit_schedule_exceptions enable row level security;
alter table public.transformation_metrics enable row level security;
alter table public.metric_entries enable row level security;
alter table public.weekly_reviews enable row level security;

alter table public.profiles force row level security;
alter table public.plans force row level security;
alter table public.habits force row level security;
alter table public.habit_completion_events force row level security;
alter table public.habit_schedule_exceptions force row level security;
alter table public.transformation_metrics force row level security;
alter table public.metric_entries force row level security;
alter table public.weekly_reviews force row level security;

drop policy if exists hexis_habits_select_own on public.habits;
drop policy if exists hexis_habits_insert_own on public.habits;
drop policy if exists hexis_habits_update_own on public.habits;
drop policy if exists hexis_habits_delete_own on public.habits;

create policy hexis_profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy hexis_profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);
create policy hexis_profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy hexis_profiles_delete_own on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);

create policy hexis_plans_select_own on public.plans
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_plans_insert_own on public.plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_plans_update_own on public.plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy hexis_habits_select_own on public.habits
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_habits_insert_own on public.habits
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_habits_update_own on public.habits
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy hexis_completion_events_select_own
  on public.habit_completion_events
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_completion_events_insert_own
  on public.habit_completion_events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy hexis_schedule_exceptions_select_own
  on public.habit_schedule_exceptions
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);
create policy hexis_schedule_exceptions_insert_own
  on public.habit_schedule_exceptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_schedule_exceptions_update_own
  on public.habit_schedule_exceptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy hexis_schedule_exceptions_delete_own
  on public.habit_schedule_exceptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy hexis_metrics_select_own on public.transformation_metrics
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_metrics_insert_own on public.transformation_metrics
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_metrics_update_own on public.transformation_metrics
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy hexis_metric_entries_select_own on public.metric_entries
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);
create policy hexis_metric_entries_insert_own on public.metric_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_metric_entries_update_own on public.metric_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy hexis_metric_entries_delete_own on public.metric_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy hexis_weekly_reviews_select_own on public.weekly_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_weekly_reviews_insert_own on public.weekly_reviews
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_weekly_reviews_update_own on public.weekly_reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Start from deny-by-default. Column grants keep ownership and immutable audit
-- fields out of direct client updates while security-invoker RPCs still run
-- with the authenticated caller's privileges and RLS context.
revoke all on table
  public.profiles,
  public.plans,
  public.habits,
  public.habit_completion_events,
  public.habit_schedule_exceptions,
  public.transformation_metrics,
  public.metric_entries,
  public.weekly_reviews,
  public.habit_daily_evidence
from public, anon, authenticated;

grant select on table
  public.profiles,
  public.plans,
  public.habits,
  public.habit_completion_events,
  public.habit_schedule_exceptions,
  public.transformation_metrics,
  public.metric_entries,
  public.weekly_reviews,
  public.habit_daily_evidence
to authenticated;

grant insert (id, display_name, focus_domain, timezone, locale, unit_system)
  on public.profiles to authenticated;
grant update (display_name, focus_domain, timezone, locale, unit_system)
  on public.profiles to authenticated;
grant delete on public.profiles to authenticated;

grant insert (
  user_id, habit_id, local_date, occurred_at, timezone, event_type,
  completion_level, source, client_operation_id, supersedes_event_id
) on public.habit_completion_events to authenticated;

-- Trusted server operations retain a path for account export/deletion and
-- future maintenance. RLS is bypassed by Supabase's service_role, never by
-- the publishable client key.
grant all on table
  public.profiles,
  public.plans,
  public.habits,
  public.habit_completion_events,
  public.habit_schedule_exceptions,
  public.transformation_metrics,
  public.metric_entries,
  public.weekly_reviews,
  public.habit_daily_evidence
to service_role;

create function public.create_initial_plan(
  p_identity_statement text,
  p_outcome_statement text,
  p_why_statement text,
  p_timezone text,
  p_habits jsonb,
  p_client_operation_id uuid,
  p_starts_on date default null,
  p_ends_on date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  operation_fingerprint text;
  starts_on_value date;
  existing_plan public.plans%rowtype;
  created_plan public.plans%rowtype;
  habit_spec jsonb;
  habit_index integer;
  habit_name text;
  minimum_action_value text;
  cue_type_value text;
  cue_value_value jsonb;
  weekdays_value smallint[];
  reminder_time_value time;
  position_value smallint;
  habit_id_value uuid;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  perform hexis_private.assert_timezone(p_timezone);

  if char_length(btrim(p_identity_statement)) not between 3 and 240
    or char_length(btrim(p_outcome_statement)) not between 3 and 240
    or char_length(btrim(p_why_statement)) not between 3 and 500
  then
    raise exception using
      errcode = 'HX422',
      message = 'plan statements do not satisfy length requirements';
  end if;

  if p_client_operation_id is null then
    raise exception using errcode = 'HX422', message = 'client_operation_id is required';
  end if;

  if p_habits is null
    or jsonb_typeof(p_habits) <> 'array'
    or jsonb_array_length(p_habits) not between 1 and 3
  then
    raise exception using
      errcode = 'HX422',
      message = 'habits must be an array containing one to three items';
  end if;

  if p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on then
    raise exception using errcode = 'HX422', message = 'ends_on precedes starts_on';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'identity_statement', btrim(p_identity_statement),
      'outcome_statement', btrim(p_outcome_statement),
      'why_statement', btrim(p_why_statement),
      'timezone', p_timezone,
      'habits', p_habits,
      'starts_on', p_starts_on,
      'ends_on', p_ends_on
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hexis:plan:' || caller_id::text, 0)
  );

  select *
    into existing_plan
  from public.plans
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_plan.request_fingerprint <> operation_fingerprint then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different plan payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'plan', to_jsonb(existing_plan),
      'habits', coalesce(
        (
          select jsonb_agg(to_jsonb(habit_row) order by habit_row.position)
          from public.habits habit_row
          where habit_row.plan_id = existing_plan.id
            and habit_row.user_id = caller_id
            and habit_row.model_version = 2
        ),
        '[]'::jsonb
      ),
      'idempotent', true
    );
  end if;

  if exists (
    select 1 from public.plans
    where user_id = caller_id and status = 'active'
  ) then
    raise exception using
      errcode = 'HX409',
      message = 'an active plan already exists';
  end if;

  starts_on_value := coalesce(
    p_starts_on,
    (pg_catalog.timezone(p_timezone, pg_catalog.clock_timestamp()))::date
  );

  if p_ends_on is not null and p_ends_on < starts_on_value then
    raise exception using errcode = 'HX422', message = 'ends_on precedes starts_on';
  end if;

  insert into public.profiles (id, timezone)
  values (caller_id, p_timezone)
  on conflict (id) do update
    set timezone = excluded.timezone;

  insert into public.plans (
    user_id,
    identity_statement,
    outcome_statement,
    why_statement,
    timezone,
    starts_on,
    ends_on,
    client_operation_id,
    request_fingerprint
  )
  values (
    caller_id,
    btrim(p_identity_statement),
    btrim(p_outcome_statement),
    btrim(p_why_statement),
    p_timezone,
    starts_on_value,
    p_ends_on,
    p_client_operation_id,
    operation_fingerprint
  )
  returning * into created_plan;

  for habit_spec, habit_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_habits) with ordinality
  loop
    if jsonb_typeof(habit_spec) <> 'object'
      or habit_spec - array[
        'name', 'minimum_action', 'cue_type', 'cue_value',
        'scheduled_weekdays', 'reminder_time', 'position'
      ] <> '{}'::jsonb
    then
      raise exception using
        errcode = 'HX422',
        message = format('habit %s has an invalid shape', habit_index);
    end if;

    habit_name := btrim(habit_spec ->> 'name');
    minimum_action_value := btrim(habit_spec ->> 'minimum_action');
    cue_type_value := coalesce(habit_spec ->> 'cue_type', 'none');
    cue_value_value := coalesce(habit_spec -> 'cue_value', '{}'::jsonb);

    if char_length(habit_name) not between 1 and 80
      or char_length(minimum_action_value) not between 1 and 160
    then
      raise exception using
        errcode = 'HX422',
        message = format('habit %s has invalid name or minimum_action', habit_index);
    end if;

    if jsonb_typeof(coalesce(habit_spec -> 'scheduled_weekdays', '[]'::jsonb)) <> 'array' then
      raise exception using
        errcode = 'HX422',
        message = format('habit %s scheduled_weekdays must be an array', habit_index);
    end if;

    begin
      select array_agg(day_value::smallint order by day_ordinality)
        into weekdays_value
      from jsonb_array_elements_text(habit_spec -> 'scheduled_weekdays')
        with ordinality as day_item(day_value, day_ordinality);

      reminder_time_value := case
        when habit_spec ? 'reminder_time'
          and habit_spec ->> 'reminder_time' is not null
        then (habit_spec ->> 'reminder_time')::time
        else null
      end;

      position_value := coalesce(
        (habit_spec ->> 'position')::smallint,
        (habit_index - 1)::smallint
      );
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using
          errcode = 'HX422',
          message = format('habit %s contains an invalid schedule value', habit_index);
    end;

    if weekdays_value is null then
      raise exception using
        errcode = 'HX422',
        message = format('habit %s scheduled_weekdays cannot be empty', habit_index);
    end if;

    habit_id_value := gen_random_uuid();

    insert into public.habits (
      id,
      user_id,
      plan_id,
      lineage_id,
      name,
      minimum_action,
      cue_type,
      cue_value,
      scheduled_weekdays,
      reminder_time,
      timezone,
      position,
      starts_on,
      ends_on
    )
    values (
      habit_id_value,
      caller_id,
      created_plan.id,
      habit_id_value,
      habit_name,
      minimum_action_value,
      cue_type_value,
      cue_value_value,
      weekdays_value,
      reminder_time_value,
      p_timezone,
      position_value,
      starts_on_value,
      p_ends_on
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'plan', to_jsonb(created_plan),
    'habits', (
      select jsonb_agg(to_jsonb(habit_row) order by habit_row.position)
      from public.habits habit_row
      where habit_row.plan_id = created_plan.id
        and habit_row.user_id = caller_id
        and habit_row.model_version = 2
    ),
    'idempotent', false
  );
end
$$;

create function public.record_habit_completion(
  p_habit_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_client_operation_id uuid,
  p_completion_level text default 'full',
  p_source text default 'manual'
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing_event public.habit_completion_events%rowtype;
  created_event public.habit_completion_events%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_habit_id is null or p_local_date is null or p_occurred_at is null
    or p_client_operation_id is null
    or p_completion_level not in ('minimum', 'full')
    or p_source not in ('manual', 'offline_sync')
  then
    raise exception using errcode = 'HX422', message = 'invalid completion payload';
  end if;

  perform hexis_private.assert_timezone(p_timezone);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:completion-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:event:' || caller_id::text || ':' || p_habit_id::text || ':' || p_local_date::text,
      0
    )
  );

  select *
    into existing_event
  from public.habit_completion_events
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_event.event_type <> 'recorded'
      or existing_event.habit_id <> p_habit_id
      or existing_event.local_date <> p_local_date
      or existing_event.occurred_at <> p_occurred_at
      or existing_event.timezone <> p_timezone
      or existing_event.completion_level <> p_completion_level
      or existing_event.source <> p_source
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different completion payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'event', to_jsonb(existing_event),
      'idempotent', true
    );
  end if;

  if not exists (
    select 1
    from public.habits
    where id = p_habit_id
      and user_id = caller_id
      and model_version = 2
  ) then
    raise exception using
      errcode = 'HX403',
      message = 'habit is unavailable for this user';
  end if;

  insert into public.habit_completion_events (
    user_id,
    habit_id,
    local_date,
    occurred_at,
    timezone,
    event_type,
    completion_level,
    source,
    client_operation_id
  )
  values (
    caller_id,
    p_habit_id,
    p_local_date,
    p_occurred_at,
    p_timezone,
    'recorded',
    p_completion_level,
    p_source,
    p_client_operation_id
  )
  returning * into created_event;

  return pg_catalog.jsonb_build_object(
    'event', to_jsonb(created_event),
    'idempotent', false
  );
end
$$;

create function public.retract_habit_completion(
  p_habit_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_client_operation_id uuid,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing_event public.habit_completion_events%rowtype;
  active_event public.habit_completion_events%rowtype;
  created_event public.habit_completion_events%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_habit_id is null or p_local_date is null or p_occurred_at is null
    or p_client_operation_id is null
    or p_source not in ('manual', 'offline_sync')
  then
    raise exception using errcode = 'HX422', message = 'invalid retraction payload';
  end if;

  perform hexis_private.assert_timezone(p_timezone);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:completion-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:event:' || caller_id::text || ':' || p_habit_id::text || ':' || p_local_date::text,
      0
    )
  );

  select *
    into existing_event
  from public.habit_completion_events
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_event.event_type <> 'retracted'
      or existing_event.habit_id <> p_habit_id
      or existing_event.local_date <> p_local_date
      or existing_event.occurred_at <> p_occurred_at
      or existing_event.timezone <> p_timezone
      or existing_event.source <> p_source
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different retraction payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'event', to_jsonb(existing_event),
      'idempotent', true
    );
  end if;

  select recorded.*
    into active_event
  from public.habit_completion_events recorded
  where recorded.user_id = caller_id
    and recorded.habit_id = p_habit_id
    and recorded.local_date = p_local_date
    and recorded.event_type = 'recorded'
    and not exists (
      select 1
      from public.habit_completion_events retracted
      where retracted.user_id = recorded.user_id
        and retracted.event_type = 'retracted'
        and retracted.supersedes_event_id = recorded.id
  )
  order by recorded.created_at desc
  limit 1;

  if not found then
    raise exception using
      errcode = 'HX409',
      message = 'no active evidence exists for habit and local_date';
  end if;

  insert into public.habit_completion_events (
    user_id,
    habit_id,
    local_date,
    occurred_at,
    timezone,
    event_type,
    completion_level,
    source,
    client_operation_id,
    supersedes_event_id
  )
  values (
    caller_id,
    p_habit_id,
    p_local_date,
    p_occurred_at,
    p_timezone,
    'retracted',
    null,
    p_source,
    p_client_operation_id,
    active_event.id
  )
  returning * into created_event;

  return pg_catalog.jsonb_build_object(
    'event', to_jsonb(created_event),
    'idempotent', false
  );
end
$$;

create function public.complete_weekly_review(
  p_plan_id uuid,
  p_week_start date,
  p_reflection text,
  p_decision text,
  p_client_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  operation_fingerprint text;
  existing_review public.weekly_reviews%rowtype;
  created_review public.weekly_reviews%rowtype;
  plan_row public.plans%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_plan_id is null or p_week_start is null or p_client_operation_id is null
    or char_length(btrim(p_reflection)) not between 1 and 1000
    or p_decision not in ('keep', 'reduce', 'increase', 'replace')
    or extract(isodow from p_week_start) <> 1
  then
    raise exception using errcode = 'HX422', message = 'invalid weekly review payload';
  end if;

  select * into plan_row
  from public.plans
  where id = p_plan_id and user_id = caller_id;

  if not found then
    raise exception using errcode = 'HX403', message = 'plan is unavailable for this user';
  end if;

  if p_week_start + 6 >= (
      pg_catalog.timezone(plan_row.timezone, pg_catalog.clock_timestamp())
    )::date
    or p_week_start + 6 < plan_row.starts_on
    or (plan_row.ends_on is not null and p_week_start > plan_row.ends_on)
  then
    raise exception using
      errcode = 'HX422',
      message = 'weekly review must cover a closed week overlapping the plan';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'week_start', p_week_start,
      'reflection', btrim(p_reflection),
      'decision', p_decision
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:review-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:review:' || caller_id::text || ':' || p_plan_id::text || ':' || p_week_start::text,
      0
    )
  );

  select *
    into existing_review
  from public.weekly_reviews
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_review.request_fingerprint <> operation_fingerprint then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different review payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'review', to_jsonb(existing_review),
      'idempotent', true
    );
  end if;

  select *
    into existing_review
  from public.weekly_reviews
  where user_id = caller_id
    and plan_id = p_plan_id
    and week_start = p_week_start;

  if found then
    if existing_review.request_fingerprint <> operation_fingerprint then
      raise exception using
        errcode = 'HX409',
        message = 'weekly review already exists with different content';
    end if;

    return pg_catalog.jsonb_build_object(
      'review', to_jsonb(existing_review),
      'idempotent', true
    );
  end if;

  insert into public.weekly_reviews (
    user_id,
    plan_id,
    week_start,
    reflection,
    decision,
    client_operation_id,
    request_fingerprint
  )
  values (
    caller_id,
    p_plan_id,
    p_week_start,
    btrim(p_reflection),
    p_decision,
    p_client_operation_id,
    operation_fingerprint
  )
  returning * into created_review;

  return pg_catalog.jsonb_build_object(
    'review', to_jsonb(created_review),
    'idempotent', false
  );
end
$$;

revoke all on function public.create_initial_plan(
  text, text, text, text, jsonb, uuid, date, date
) from public, anon;
revoke all on function public.record_habit_completion(
  uuid, date, timestamptz, text, uuid, text, text
) from public, anon;
revoke all on function public.retract_habit_completion(
  uuid, date, timestamptz, text, uuid, text
) from public, anon;
revoke all on function public.complete_weekly_review(
  uuid, date, text, text, uuid
) from public, anon;

grant execute on function public.create_initial_plan(
  text, text, text, text, jsonb, uuid, date, date
) to authenticated, service_role;
grant execute on function public.record_habit_completion(
  uuid, date, timestamptz, text, uuid, text, text
) to authenticated, service_role;
grant execute on function public.retract_habit_completion(
  uuid, date, timestamptz, text, uuid, text
) to authenticated, service_role;
grant execute on function public.complete_weekly_review(
  uuid, date, text, text, uuid
) to authenticated, service_role;

revoke all on all functions in schema hexis_private
  from public, anon, authenticated;

-- The completion RPCs are SECURITY INVOKER and call this side-effect-free
-- validator. No private tables or mutating helpers are granted.
grant usage on schema hexis_private to authenticated, service_role;
grant execute on function hexis_private.assert_timezone(text)
  to authenticated, service_role;

comment on table public.habit_completion_events is
  'Append-only evidence ledger. A user retracts evidence by appending a retracted event.';
comment on view public.habit_daily_evidence is
  'Current non-retracted completion evidence; security_invoker preserves base-table RLS.';
comment on column public.plans.timezone is
  'IANA timezone frozen for the plan cycle; profile changes do not rewrite it.';
comment on column public.habits.model_version is
  '1 = preserved legacy row; 2 = target plan/schedule contract.';
comment on table public.habit_schedule_exceptions is
  'rest/skip dates are excluded from scheduled evidence; tombstoned rows are hidden by RLS and an uncompleted scheduled date without an active exception remains missed.';
comment on column public.plans.request_fingerprint is
  'Non-cryptographic operation fingerprint used only to detect idempotency-key payload reuse.';
comment on column public.weekly_reviews.request_fingerprint is
  'Non-cryptographic operation fingerprint used only to detect idempotency-key payload reuse.';
comment on column public.metric_entries.deleted_at is
  'Authenticated deletion is a server-controlled tombstone; ordinary RLS reads hide tombstoned entries.';

commit;
