begin;

create table hexis_private.metric_entry_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_operation_id uuid not null,
  operation_type text not null check (operation_type in ('update', 'delete')),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result_entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_operation_id),
  constraint metric_entry_operation_receipts_result_fk
    foreign key (result_entry_id, user_id)
    references public.metric_entries (id, user_id)
    on delete cascade
);

revoke all on table hexis_private.metric_entry_operation_receipts
  from public, anon, authenticated, service_role;

create function public.create_transformation_metric(
  p_plan_id uuid,
  p_kind text,
  p_label text,
  p_unit text,
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
  existing_metric public.transformation_metrics%rowtype;
  created_metric public.transformation_metrics%rowtype;
  min_value_value numeric(14, 4);
  max_value_value numeric(14, 4);
  normalized_unit text := lower(btrim(p_unit));
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_plan_id is null or p_client_operation_id is null
    or p_kind not in ('weight', 'circumference', 'custom')
    or char_length(btrim(p_label)) not between 1 and 80
    or char_length(btrim(p_unit)) not between 1 and 20
    or (p_kind = 'weight' and normalized_unit not in ('kg', 'lb'))
    or (p_kind = 'circumference' and normalized_unit not in ('cm', 'in'))
  then
    raise exception using errcode = 'HX422', message = 'invalid transformation metric payload';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'kind', p_kind,
      'label', btrim(p_label),
      'unit', normalized_unit
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:metric-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into existing_metric
  from public.transformation_metrics
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_metric.request_fingerprint <> operation_fingerprint then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different metric payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'metric', to_jsonb(existing_metric),
      'idempotent', true
    );
  end if;

  perform 1 from public.plans
  where id = p_plan_id and user_id = caller_id and status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'HX403', message = 'active plan is unavailable for this user';
  end if;

  if exists (
    select 1 from public.transformation_metrics
    where plan_id = p_plan_id and user_id = caller_id and status = 'active'
  ) then
    raise exception using errcode = 'HX409', message = 'the plan already has an active metric';
  end if;

  if p_kind = 'weight' and normalized_unit = 'kg' then
    min_value_value := 0.1;
    max_value_value := 500;
  elsif p_kind = 'weight' and normalized_unit = 'lb' then
    min_value_value := 0.1;
    max_value_value := 1100;
  elsif p_kind = 'circumference' and normalized_unit = 'cm' then
    min_value_value := 0.1;
    max_value_value := 1000;
  elsif p_kind = 'circumference' and normalized_unit = 'in' then
    min_value_value := 0.1;
    max_value_value := 400;
  else
    min_value_value := -1000000;
    max_value_value := 1000000;
  end if;

  insert into public.transformation_metrics (
    user_id,
    plan_id,
    kind,
    label,
    unit,
    min_value,
    max_value,
    status,
    client_operation_id,
    request_fingerprint
  ) values (
    caller_id,
    p_plan_id,
    p_kind,
    btrim(p_label),
    normalized_unit,
    min_value_value,
    max_value_value,
    'active',
    p_client_operation_id,
    operation_fingerprint
  )
  returning * into created_metric;

  return pg_catalog.jsonb_build_object(
    'metric', to_jsonb(created_metric),
    'idempotent', false
  );
end
$$;

create function public.record_metric_entry(
  p_metric_id uuid,
  p_value numeric,
  p_local_date date,
  p_recorded_at timestamptz,
  p_note text,
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
  existing_entry public.metric_entries%rowtype;
  created_entry public.metric_entries%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_metric_id is null or p_value is null or p_local_date is null
    or p_recorded_at is null or p_client_operation_id is null
    or (p_note is not null and char_length(p_note) > 500)
  then
    raise exception using errcode = 'HX422', message = 'invalid metric entry payload';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'metric_id', p_metric_id,
      'value', p_value,
      'local_date', p_local_date,
      'recorded_at', p_recorded_at,
      'note', p_note
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:metric-entry-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into existing_entry
  from public.metric_entries
  where user_id = caller_id
    and client_operation_id = p_client_operation_id;

  if found then
    if existing_entry.request_fingerprint <> operation_fingerprint then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different entry payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'entry', to_jsonb(existing_entry),
      'idempotent', true
    );
  end if;

  if not exists (
    select 1 from public.transformation_metrics
    where id = p_metric_id
      and user_id = caller_id
      and status = 'active'
  ) then
    raise exception using errcode = 'HX403', message = 'active metric is unavailable for this user';
  end if;

  insert into public.metric_entries (
    user_id,
    metric_id,
    value,
    local_date,
    recorded_at,
    note,
    client_operation_id,
    request_fingerprint
  ) values (
    caller_id,
    p_metric_id,
    p_value,
    p_local_date,
    p_recorded_at,
    p_note,
    p_client_operation_id,
    operation_fingerprint
  )
  returning * into created_entry;

  return pg_catalog.jsonb_build_object(
    'entry', to_jsonb(created_entry),
    'idempotent', false
  );
end
$$;

create function public.update_metric_entry(
  p_entry_id uuid,
  p_value numeric,
  p_local_date date,
  p_note text,
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
  receipt_row hexis_private.metric_entry_operation_receipts%rowtype;
  result_entry public.metric_entries%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_entry_id is null or p_value is null or p_local_date is null
    or p_client_operation_id is null
    or (p_note is not null and char_length(p_note) > 500)
  then
    raise exception using errcode = 'HX422', message = 'invalid metric entry update payload';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'value', p_value,
      'local_date', p_local_date,
      'note', p_note
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:metric-entry-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.metric_entry_operation_receipts
  where user_id = caller_id and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'update'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different entry operation';
    end if;

    select * into result_entry from public.metric_entries
    where id = receipt_row.result_entry_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'entry', to_jsonb(result_entry),
      'idempotent', true
    );
  end if;

  select * into result_entry
  from public.metric_entries
  where id = p_entry_id and user_id = caller_id
  for update;

  if not found or result_entry.deleted_at is not null then
    raise exception using errcode = 'HX403', message = 'metric entry is unavailable for this user';
  end if;

  update public.metric_entries
  set value = p_value,
      local_date = p_local_date,
      note = p_note
  where id = result_entry.id
  returning * into result_entry;

  insert into hexis_private.metric_entry_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_entry_id
  ) values (
    caller_id, p_client_operation_id, 'update',
    operation_fingerprint, result_entry.id
  );

  return pg_catalog.jsonb_build_object(
    'entry', to_jsonb(result_entry),
    'idempotent', false
  );
end
$$;

create function public.delete_metric_entry(
  p_entry_id uuid,
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
  receipt_row hexis_private.metric_entry_operation_receipts%rowtype;
  result_entry public.metric_entries%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = 'HX401', message = 'authentication required';
  end if;

  if p_entry_id is null or p_client_operation_id is null then
    raise exception using errcode = 'HX422', message = 'entry_id and client_operation_id are required';
  end if;

  operation_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object('entry_id', p_entry_id)::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hexis:metric-entry-operation:' || caller_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select * into receipt_row
  from hexis_private.metric_entry_operation_receipts
  where user_id = caller_id and client_operation_id = p_client_operation_id;

  if found then
    if receipt_row.operation_type <> 'delete'
      or receipt_row.request_fingerprint <> operation_fingerprint
    then
      raise exception using
        errcode = 'HX409',
        message = 'client_operation_id was reused with a different entry operation';
    end if;

    select * into result_entry from public.metric_entries
    where id = receipt_row.result_entry_id and user_id = caller_id;

    return pg_catalog.jsonb_build_object(
      'entry', to_jsonb(result_entry),
      'idempotent', true
    );
  end if;

  select * into result_entry
  from public.metric_entries
  where id = p_entry_id and user_id = caller_id
  for update;

  if not found then
    raise exception using errcode = 'HX403', message = 'metric entry is unavailable for this user';
  end if;

  if result_entry.deleted_at is null then
    update public.metric_entries
    set deleted_at = pg_catalog.clock_timestamp()
    where id = result_entry.id
    returning * into result_entry;
  end if;

  insert into hexis_private.metric_entry_operation_receipts (
    user_id, client_operation_id, operation_type,
    request_fingerprint, result_entry_id
  ) values (
    caller_id, p_client_operation_id, 'delete',
    operation_fingerprint, result_entry.id
  );

  return pg_catalog.jsonb_build_object(
    'entry', to_jsonb(result_entry),
    'idempotent', false
  );
end
$$;

revoke all on function public.create_transformation_metric(
  uuid, text, text, text, uuid
) from public, anon;
revoke all on function public.record_metric_entry(
  uuid, numeric, date, timestamptz, text, uuid
) from public, anon;
revoke all on function public.update_metric_entry(
  uuid, numeric, date, text, uuid
) from public, anon;
revoke all on function public.delete_metric_entry(uuid, uuid)
  from public, anon;

grant execute on function public.create_transformation_metric(
  uuid, text, text, text, uuid
) to authenticated, service_role;
grant execute on function public.record_metric_entry(
  uuid, numeric, date, timestamptz, text, uuid
) to authenticated, service_role;
grant execute on function public.update_metric_entry(
  uuid, numeric, date, text, uuid
) to authenticated, service_role;
grant execute on function public.delete_metric_entry(uuid, uuid)
  to authenticated, service_role;

comment on table hexis_private.metric_entry_operation_receipts is
  'Minimal update/delete idempotency ledger; metric values and notes are not duplicated.';
comment on function public.delete_metric_entry(uuid, uuid) is
  'Tombstones an owned metric entry. Ordinary authenticated reads hide deleted_at rows.';

commit;
