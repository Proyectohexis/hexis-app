begin;

-- Idempotency receipts live outside the exposed Data API schema. They do not
-- contain identity statements, habit names or free-text reasons.
create table hexis_private.habit_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_operation_id uuid not null,
  operation_type text not null
    check (operation_type in ('create', 'replace', 'set_status')),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result_habit_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_operation_id),
  constraint habit_operation_receipts_result_fk
    foreign key (result_habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade
);

create table hexis_private.schedule_exception_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_operation_id uuid not null,
  operation_type text not null check (operation_type in ('set', 'remove')),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result_exception_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_operation_id),
  constraint schedule_exception_operation_receipts_result_fk
    foreign key (result_exception_id, user_id)
    references public.habit_schedule_exceptions (id, user_id)
    on delete cascade
);

revoke all on table
  hexis_private.habit_operation_receipts,
  hexis_private.schedule_exception_operation_receipts
from public, anon, authenticated, service_role;

create function hexis_private.assert_habit_configuration(
  p_name text,
  p_minimum_action text,
  p_scheduled_weekdays smallint[],
  p_timezone text,
  p_cue_type text,
  p_cue_value jsonb,
  p_reminder_time time,
  p_position smallint
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  distinct_weekday_count integer;
begin
  perform hexis_private.assert_timezone(p_timezone);

  if char_length(btrim(p_name)) not between 1 and 80
    or char_length(btrim(p_minimum_action)) not between 1 and 160
  then
    raise exception using
      errcode = 'HX422',
      message = 'habit name or minimum_action is invalid';
  end if;

  if p_scheduled_weekdays is null
    or cardinality(p_scheduled_weekdays) not between 1 and 7
    or not (
      p_scheduled_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
  then
    raise exception using
      errcode = 'HX422',
      message = 'scheduled_weekdays must contain unique values from 0 through 6';
  end if;

  distinct_weekday_count :=
    (case when p_scheduled_weekdays @> array[0]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[1]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[2]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[3]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[4]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[5]::smallint[] then 1 else 0 end)
    + (case when p_scheduled_weekdays @> array[6]::smallint[] then 1 else 0 end);

  if cardinality(p_scheduled_weekdays) <> distinct_weekday_count then
    raise exception using
      errcode = 'HX422',
      message = 'scheduled_weekdays cannot contain duplicates';
  end if;

  if p_cue_type not in ('time', 'event', 'location', 'none')
    or p_cue_value is null
    or jsonb_typeof(p_cue_value) <> 'object'
    or octet_length(p_cue_value::text) > 1000
    or (p_cue_type = 'none' and p_cue_value <> '{}'::jsonb)
    or (p_cue_type = 'time' and p_reminder_time is null)
    or (
      p_cue_type in ('event', 'location')
      and (
        not (p_cue_value ? 'description')
        or char_length(btrim(p_cue_value ->> 'description')) not between 1 and 160
      )
    )
  then
    raise exception using errcode = 'HX422', message = 'habit cue is invalid';
  end if;

  if p_position is not null and p_position not between 0 and 2 then
    raise exception using errcode = 'HX422', message = 'position must be 0, 1 or 2';
  end if;
end
$$;

create function public.create_habit(
  p_plan_id uuid,
  p_name text,
  p_minimum_action text,
  p_scheduled_weekdays smallint[],
  p_timezone text,
  p_client_operation_id uuid,
  p_effective_on date default null,
  p_cue_type text default 'none',
  p_cue_value jsonb default '{}'::jsonb,
  p_reminder_time time default null,
  p_position smallint default null
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
  receipt_row hexis_private.habit_operation_receipts%rowtype;
  plan_row public.plans%rowtype;
  result_habit public.habits%rowtype;
  habit_id_value uuid;
  effective_on_value date;
  position_value smallint;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_plan_id is null or p_client_operation_id is null then
    raise exception using errcode = 'HX422', message = 'plan_id and client_operation_id are required';
  end if;

  perform hexis_private.assert_habit_configuration(
    p_name,
    p_minimum_action,
    p_scheduled_weekdays,
    p_timezone,
    p_cue_type,
    p_cue_value,
    p_reminder_time,
    p_position
  );

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'name', btrim(p_name),
      'minimum_action', btrim(p_minimum_action),
      'scheduled_weekdays', to_jsonb(p_scheduled_weekdays),
      'timezone', p_timezone,
      'effective_on', p_effective_on,
      'cue_type', p_cue_type,
      'cue_value', p_cue_value,
      'reminder_time', p_reminder_time,
      'position', p_position
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:habit-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select *
    into receipt_row
  from hexis_private.habit_operation_receipts
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'create'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different habit operation';
    end if;

    select * into result_habit
    from public.habits
    where id = receipt_row.result_habit_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'habit', to_jsonb(result_habit),
      'idempotent', true
    );
  end if;

  select *
    into plan_row
  from public.plans
  where id = p_plan_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'HX403', message = 'active plan is unavailable for this user';
  end if;

  effective_on_value := coalesce(
    p_effective_on,
    (pg_catalog.timezone(p_timezone, pg_catalog.clock_timestamp()))::date
  );

  if effective_on_value < plan_row.starts_on
    or (plan_row.ends_on is not null and effective_on_value > plan_row.ends_on)
  then
    raise exception using errcode = 'HX422', message = 'effective_on is outside the plan range';
  end if;

  if p_position is null then
    select candidate::smallint
      into position_value
    from pg_catalog.generate_series(0, 2) candidate
    where not exists (
      select 1
      from public.habits
      where plan_id = p_plan_id
        and model_version = 2
        and status = 'active'
        and position = candidate
    )
    order by candidate
    limit 1;
  else
    position_value := p_position;
  end if;

  if position_value is null or exists (
    select 1 from public.habits
    where plan_id = p_plan_id
      and model_version = 2
      and status = 'active'
      and position = position_value
  ) then
    raise exception using errcode = 'HX409', message = 'the plan already has three active habit slots';
  end if;

  habit_id_value := gen_random_uuid();

  insert into public.habits (
    id,
    user_id,
    plan_id,
    lineage_id,
    replaces_habit_id,
    version_number,
    name,
    minimum_action,
    cue_type,
    cue_value,
    scheduled_weekdays,
    reminder_time,
    timezone,
    status,
    position,
    starts_on,
    ends_on
  )
  values (
    habit_id_value,
    caller_id,
    p_plan_id,
    habit_id_value,
    null,
    1,
    btrim(p_name),
    btrim(p_minimum_action),
    p_cue_type,
    p_cue_value,
    p_scheduled_weekdays,
    p_reminder_time,
    p_timezone,
    'active',
    position_value,
    effective_on_value,
    plan_row.ends_on
  )
  returning * into result_habit;

  insert into hexis_private.habit_operation_receipts (
    user_id,
    client_operation_id,
    operation_type,
    request_fingerprint,
    result_habit_id
  )
  values (
    caller_id,
    p_client_operation_id,
    'create',
    operation_fingerprint,
    result_habit.id
  );

  return pg_catalog.jsonb_build_object(
    'habit', to_jsonb(result_habit),
    'idempotent', false
  );
end
$$;

create function public.replace_habit_configuration(
  p_habit_id uuid,
  p_name text,
  p_minimum_action text,
  p_scheduled_weekdays smallint[],
  p_timezone text,
  p_effective_on date,
  p_client_operation_id uuid,
  p_cue_type text default 'none',
  p_cue_value jsonb default '{}'::jsonb,
  p_reminder_time time default null,
  p_position smallint default null
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
  receipt_row hexis_private.habit_operation_receipts%rowtype;
  previous_habit public.habits%rowtype;
  plan_row public.plans%rowtype;
  result_habit public.habits%rowtype;
  habit_id_value uuid;
  position_value smallint;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_habit_id is null or p_effective_on is null or p_client_operation_id is null then
    raise exception using
      errcode = 'HX422',
      message = 'habit_id, effective_on and client_operation_id are required';
  end if;

  perform hexis_private.assert_habit_configuration(
    p_name,
    p_minimum_action,
    p_scheduled_weekdays,
    p_timezone,
    p_cue_type,
    p_cue_value,
    p_reminder_time,
    p_position
  );

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'habit_id', p_habit_id,
      'name', btrim(p_name),
      'minimum_action', btrim(p_minimum_action),
      'scheduled_weekdays', to_jsonb(p_scheduled_weekdays),
      'timezone', p_timezone,
      'effective_on', p_effective_on,
      'cue_type', p_cue_type,
      'cue_value', p_cue_value,
      'reminder_time', p_reminder_time,
      'position', p_position
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:habit-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.habit_operation_receipts
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'replace'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different habit operation';
    end if;

    select * into result_habit from public.habits
    where id = receipt_row.result_habit_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'habit', to_jsonb(result_habit),
      'idempotent', true
    );
  end if;

  select * into previous_habit
  from public.habits
  where id = p_habit_id
    and user_id = caller_id
    and model_version = 2
  for update;

  if not found or previous_habit.status <> 'active' then
    raise exception using errcode = 'HX403', message = 'active habit is unavailable for this user';
  end if;

  select * into plan_row
  from public.plans
  where id = previous_habit.plan_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'HX409', message = 'habit plan is not active';
  end if;

  if exists (
    select 1 from public.habits
    where replaces_habit_id = previous_habit.id
  ) then
    raise exception using errcode = 'HX409', message = 'habit is not the latest lineage version';
  end if;

  if p_effective_on <= previous_habit.starts_on
    or (plan_row.ends_on is not null and p_effective_on > plan_row.ends_on)
  then
    raise exception using errcode = 'HX422', message = 'effective_on is outside the habit range';
  end if;

  if exists (
    select 1 from public.habit_completion_events
    where user_id = caller_id
      and habit_id = previous_habit.id
      and local_date >= p_effective_on
  ) or exists (
    select 1 from public.habit_schedule_exceptions
    where user_id = caller_id
      and habit_id = previous_habit.id
      and local_date >= p_effective_on
      and deleted_at is null
  ) then
    raise exception using
      errcode = 'HX409',
      message = 'configuration cannot be replaced across existing history';
  end if;

  position_value := coalesce(p_position, previous_habit.position);

  update public.habits
  set status = 'archived',
      ends_on = case
        when p_effective_on > starts_on then p_effective_on - 1
        else starts_on
      end
  where id = previous_habit.id;

  habit_id_value := gen_random_uuid();

  insert into public.habits (
    id,
    user_id,
    plan_id,
    lineage_id,
    replaces_habit_id,
    version_number,
    name,
    minimum_action,
    cue_type,
    cue_value,
    scheduled_weekdays,
    reminder_time,
    timezone,
    status,
    position,
    starts_on,
    ends_on
  )
  values (
    habit_id_value,
    caller_id,
    previous_habit.plan_id,
    previous_habit.lineage_id,
    previous_habit.id,
    previous_habit.version_number + 1,
    btrim(p_name),
    btrim(p_minimum_action),
    p_cue_type,
    p_cue_value,
    p_scheduled_weekdays,
    p_reminder_time,
    p_timezone,
    'active',
    position_value,
    p_effective_on,
    plan_row.ends_on
  )
  returning * into result_habit;

  insert into hexis_private.habit_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_habit_id
  ) values (
    caller_id, p_client_operation_id, 'replace',
    operation_fingerprint, result_habit.id
  );

  return pg_catalog.jsonb_build_object(
    'habit', to_jsonb(result_habit),
    'idempotent', false
  );
end
$$;

create function public.set_habit_status(
  p_habit_id uuid,
  p_status text,
  p_effective_on date,
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
  receipt_row hexis_private.habit_operation_receipts%rowtype;
  previous_habit public.habits%rowtype;
  plan_row public.plans%rowtype;
  result_habit public.habits%rowtype;
  habit_id_value uuid;
  effective_on_value date;
  position_value smallint;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_habit_id is null or p_client_operation_id is null
    or p_status not in ('active', 'paused', 'archived')
  then
    raise exception using errcode = 'HX422', message = 'invalid habit status payload';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'habit_id', p_habit_id,
      'status', p_status,
      'effective_on', p_effective_on
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:habit-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.habit_operation_receipts
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'set_status'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different habit operation';
    end if;

    select * into result_habit from public.habits
    where id = receipt_row.result_habit_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'habit', to_jsonb(result_habit),
      'idempotent', true
    );
  end if;

  select * into previous_habit
  from public.habits
  where id = p_habit_id
    and user_id = caller_id
    and model_version = 2
  for update;

  if not found then
    raise exception using errcode = 'HX403', message = 'habit is unavailable for this user';
  end if;

  if exists (
    select 1 from public.habits
    where replaces_habit_id = previous_habit.id
  ) then
    raise exception using errcode = 'HX409', message = 'habit is not the latest lineage version';
  end if;

  select * into plan_row
  from public.plans
  where id = previous_habit.plan_id and user_id = caller_id
  for update;

  if not found then
    raise exception using errcode = 'HX409', message = 'habit plan is unavailable';
  end if;

  effective_on_value := coalesce(
    p_effective_on,
    (pg_catalog.timezone(previous_habit.timezone, pg_catalog.clock_timestamp()))::date
  );

  if p_status = previous_habit.status then
    result_habit := previous_habit;
  elsif p_status in ('paused', 'archived') and previous_habit.status = 'active' then
    if effective_on_value <= previous_habit.starts_on then
      raise exception using errcode = 'HX422', message = 'effective_on must follow habit start';
    end if;

    if exists (
      select 1 from public.habit_completion_events
      where user_id = caller_id
        and habit_id = previous_habit.id
        and local_date >= effective_on_value
    ) or exists (
      select 1 from public.habit_schedule_exceptions
      where user_id = caller_id
        and habit_id = previous_habit.id
        and local_date >= effective_on_value
        and deleted_at is null
    ) then
      raise exception using
        errcode = 'HX409',
        message = 'habit cannot be closed across existing history';
    end if;

    update public.habits
    set status = p_status,
        ends_on = case
          when effective_on_value > starts_on then effective_on_value - 1
          else starts_on
        end
    where id = previous_habit.id
    returning * into result_habit;
  elsif p_status = 'archived' and previous_habit.status = 'paused' then
    update public.habits
    set status = 'archived'
    where id = previous_habit.id
    returning * into result_habit;
  elsif p_status = 'active' and previous_habit.status in ('paused', 'archived') then
    if plan_row.status <> 'active' then
      raise exception using errcode = 'HX409', message = 'habit plan is not active';
    end if;

    if previous_habit.ends_on is not null and effective_on_value <= previous_habit.ends_on then
      raise exception using
        errcode = 'HX422',
        message = 'reactivation must begin after the closed version';
    end if;

    if plan_row.ends_on is not null and effective_on_value > plan_row.ends_on then
      raise exception using errcode = 'HX422', message = 'effective_on exceeds plan end';
    end if;

    if not exists (
      select 1 from public.habits
      where plan_id = previous_habit.plan_id
        and model_version = 2
        and status = 'active'
        and position = previous_habit.position
    ) then
      position_value := previous_habit.position;
    else
      select candidate::smallint into position_value
      from pg_catalog.generate_series(0, 2) candidate
      where not exists (
        select 1 from public.habits
        where plan_id = previous_habit.plan_id
          and model_version = 2
          and status = 'active'
          and position = candidate
      )
      order by candidate
      limit 1;
    end if;

    if position_value is null then
      raise exception using errcode = 'HX409', message = 'the plan already has three active habit slots';
    end if;

    habit_id_value := gen_random_uuid();

    insert into public.habits (
      id, user_id, plan_id, lineage_id, replaces_habit_id,
      version_number, name, minimum_action, cue_type, cue_value,
      scheduled_weekdays, reminder_time, timezone, status, position,
      starts_on, ends_on
    ) values (
      habit_id_value, caller_id, previous_habit.plan_id,
      previous_habit.lineage_id, previous_habit.id,
      previous_habit.version_number + 1, previous_habit.name,
      previous_habit.minimum_action, previous_habit.cue_type,
      previous_habit.cue_value, previous_habit.scheduled_weekdays,
      previous_habit.reminder_time, previous_habit.timezone, 'active',
      position_value, effective_on_value, plan_row.ends_on
    )
    returning * into result_habit;
  else
    raise exception using errcode = 'HX422', message = 'habit status transition is not allowed';
  end if;

  insert into hexis_private.habit_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_habit_id
  ) values (
    caller_id, p_client_operation_id, 'set_status',
    operation_fingerprint, result_habit.id
  );

  return pg_catalog.jsonb_build_object(
    'habit', to_jsonb(result_habit),
    'idempotent', false
  );
end
$$;

create function public.set_habit_schedule_exception(
  p_habit_id uuid,
  p_local_date date,
  p_kind text,
  p_reason text,
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
  receipt_row hexis_private.schedule_exception_operation_receipts%rowtype;
  habit_row public.habits%rowtype;
  result_exception public.habit_schedule_exceptions%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_habit_id is null or p_local_date is null or p_client_operation_id is null
    or p_kind not in ('rest', 'skip')
    or (p_reason is not null and char_length(btrim(p_reason)) not between 1 and 240)
  then
    raise exception using errcode = 'HX422', message = 'invalid schedule exception payload';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'habit_id', p_habit_id,
      'local_date', p_local_date,
      'kind', p_kind,
      'reason', case when p_reason is null then null else btrim(p_reason) end
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:exception-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.schedule_exception_operation_receipts
  where user_id = caller_id and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'set'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different exception operation';
    end if;

    select * into result_exception
    from public.habit_schedule_exceptions
    where id = receipt_row.result_exception_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'exception', to_jsonb(result_exception),
      'idempotent', true
    );
  end if;

  select * into habit_row
  from public.habits
  where id = p_habit_id and user_id = caller_id and model_version = 2;

  if not found then
    raise exception using errcode = 'HX403', message = 'habit is unavailable for this user';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:event:' || caller_id::text || ':' || p_habit_id::text || ':' || p_local_date::text,
      0
    )
  );

  if p_local_date < habit_row.starts_on
    or (habit_row.ends_on is not null and p_local_date > habit_row.ends_on)
    or not (
      extract(dow from p_local_date)::smallint = any(habit_row.scheduled_weekdays)
    )
  then
    raise exception using errcode = 'HX422', message = 'exception date is outside the habit schedule';
  end if;

  if p_local_date < (
    pg_catalog.timezone(habit_row.timezone, pg_catalog.clock_timestamp())
  )::date then
    raise exception using
      errcode = 'HX422',
      message = 'schedule exceptions cannot be created retroactively';
  end if;

  if exists (
    select 1
    from public.habit_completion_events recorded
    where recorded.user_id = caller_id
      and recorded.habit_id = p_habit_id
      and recorded.local_date = p_local_date
      and recorded.event_type = 'recorded'
      and not exists (
        select 1 from public.habit_completion_events retracted
        where retracted.user_id = recorded.user_id
          and retracted.event_type = 'retracted'
          and retracted.supersedes_event_id = recorded.id
      )
  ) then
    raise exception using errcode = 'HX409', message = 'active evidence exists for the exception date';
  end if;

  select * into result_exception
  from public.habit_schedule_exceptions
  where user_id = caller_id
    and habit_id = p_habit_id
    and local_date = p_local_date
  for update;

  if found then
    update public.habit_schedule_exceptions
    set kind = p_kind,
        reason = case when p_reason is null then null else btrim(p_reason) end,
        deleted_at = null
    where id = result_exception.id
    returning * into result_exception;
  else
    insert into public.habit_schedule_exceptions (
      user_id, habit_id, local_date, kind, reason, client_operation_id
    ) values (
      caller_id, p_habit_id, p_local_date, p_kind,
      case when p_reason is null then null else btrim(p_reason) end,
      p_client_operation_id
    )
    returning * into result_exception;
  end if;

  insert into hexis_private.schedule_exception_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_exception_id
  ) values (
    caller_id, p_client_operation_id, 'set',
    operation_fingerprint, result_exception.id
  );

  return pg_catalog.jsonb_build_object(
    'exception', to_jsonb(result_exception),
    'idempotent', false
  );
end
$$;

create function public.remove_habit_schedule_exception(
  p_exception_id uuid,
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
  receipt_row hexis_private.schedule_exception_operation_receipts%rowtype;
  result_exception public.habit_schedule_exceptions%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_exception_id is null or p_client_operation_id is null then
    raise exception using errcode = 'HX422', message = 'exception_id and client_operation_id are required';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object('exception_id', p_exception_id)::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:exception-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.schedule_exception_operation_receipts
  where user_id = caller_id and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'remove'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different exception operation';
    end if;

    select * into result_exception
    from public.habit_schedule_exceptions
    where id = receipt_row.result_exception_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'exception', to_jsonb(result_exception),
      'idempotent', true
    );
  end if;

  select * into result_exception
  from public.habit_schedule_exceptions
  where id = p_exception_id and user_id = caller_id
  for update;

  if not found then
    raise exception using errcode = 'HX403', message = 'schedule exception is unavailable for this user';
  end if;

  if result_exception.deleted_at is null then
    update public.habit_schedule_exceptions
    set deleted_at = pg_catalog.clock_timestamp()
    where id = result_exception.id
    returning * into result_exception;
  end if;

  insert into hexis_private.schedule_exception_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_exception_id
  ) values (
    caller_id, p_client_operation_id, 'remove',
    operation_fingerprint, result_exception.id
  );

  return pg_catalog.jsonb_build_object(
    'exception', to_jsonb(result_exception),
    'idempotent', false
  );
end
$$;

revoke all on function public.create_habit(
  uuid, text, text, smallint[], text, uuid, date, text, jsonb, time, smallint
) from public, anon;
revoke all on function public.replace_habit_configuration(
  uuid, text, text, smallint[], text, date, uuid, text, jsonb, time, smallint
) from public, anon;
revoke all on function public.set_habit_status(uuid, text, date, uuid)
  from public, anon;
revoke all on function public.set_habit_schedule_exception(
  uuid, date, text, text, uuid
) from public, anon;
revoke all on function public.remove_habit_schedule_exception(uuid, uuid)
  from public, anon;

grant execute on function public.create_habit(
  uuid, text, text, smallint[], text, uuid, date, text, jsonb, time, smallint
) to authenticated, service_role;
grant execute on function public.replace_habit_configuration(
  uuid, text, text, smallint[], text, date, uuid, text, jsonb, time, smallint
) to authenticated, service_role;
grant execute on function public.set_habit_status(uuid, text, date, uuid)
  to authenticated, service_role;
grant execute on function public.set_habit_schedule_exception(
  uuid, date, text, text, uuid
) to authenticated, service_role;
grant execute on function public.remove_habit_schedule_exception(uuid, uuid)
  to authenticated, service_role;

revoke all on function hexis_private.assert_habit_configuration(
  text, text, smallint[], text, text, jsonb, time, smallint
) from public, anon, authenticated, service_role;

comment on table hexis_private.habit_operation_receipts is
  'Minimal operation ledger for durable idempotency; no habit text is duplicated.';
comment on function public.replace_habit_configuration(
  uuid, text, text, smallint[], text, date, uuid, text, jsonb, time, smallint
) is 'Closes the current habit version and creates a new version without rewriting historical schedule.';

commit;
