begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select extensions.no_plan();

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'authenticated',
  'authenticated',
  'hexis-temporal-slots@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

create temporary table hexis_temporal_state (
  key text primary key,
  value uuid not null
);
grant select, insert, update on table pg_temp.hexis_temporal_state to authenticated;

set local role authenticated;
do $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    true
  );
end
$$;

insert into pg_temp.hexis_temporal_state (key, value)
select
  'plan',
  (created.result -> 'plan' ->> 'id')::uuid
from (
  select public.create_initial_plan(
    'Soy consistente cada dia',
    'Sostener tres compromisos',
    'Construir evidencia temporal correcta',
    'UTC',
    '[
      {"name":"Habito cero","minimum_action":"Accion cero","scheduled_weekdays":[0,1,2,3,4,5,6],"position":0},
      {"name":"Habito uno","minimum_action":"Accion uno","scheduled_weekdays":[0,1,2,3,4,5,6],"position":1}
    ]'::jsonb,
    'a0000000-0000-4000-8000-000000000001',
    '2030-01-01'::date,
    null
  ) as result
) created;

insert into pg_temp.hexis_temporal_state (key, value)
select 'root_0', id
from public.habits
where plan_id = (select value from pg_temp.hexis_temporal_state where key = 'plan')
  and position = 0;

insert into pg_temp.hexis_temporal_state (key, value)
select 'root_1', id
from public.habits
where plan_id = (select value from pg_temp.hexis_temporal_state where key = 'plan')
  and position = 1;

select extensions.throws_ok(
  format(
    $sql$select public.replace_habit_configuration(%L::uuid,'Habito cero movido','Accion cero',array[0,1,2,3,4,5,6]::smallint[],'UTC','2030-01-02'::date,'a0000000-0000-4000-8000-000000000002'::uuid,'none','{}'::jsonb,null,1::smallint)$sql$,
    (select value from pg_temp.hexis_temporal_state where key = 'root_0')
  ),
  'HX409',
  null,
  'replacement cannot move into another lineage slot occupied on D plus 1'
);

select public.set_habit_status(
  (select value from pg_temp.hexis_temporal_state where key = 'root_0'),
  'paused',
  '2030-01-02'::date,
  'a0000000-0000-4000-8000-000000000003'
);

select public.set_habit_status(
  (select value from pg_temp.hexis_temporal_state where key = 'root_1'),
  'paused',
  '2030-01-02'::date,
  'a0000000-0000-4000-8000-000000000004'
);

select extensions.is(
  (
    select count(*)::bigint
    from public.habits
    where plan_id = (select value from pg_temp.hexis_temporal_state where key = 'plan')
      and starts_on <= '2030-01-01'::date
      and (ends_on is null or ends_on >= '2030-01-01'::date)
  ),
  2::bigint,
  'paused D plus 1 versions remain queryable and effective through D'
);

select extensions.throws_ok(
  format(
    $sql$select public.create_habit(%L::uuid,'Solapado','Accion',array[0,1,2,3,4,5,6]::smallint[],'UTC','a0000000-0000-4000-8000-000000000005'::uuid,'2030-01-01'::date,'none','{}'::jsonb,null,0::smallint)$sql$,
    (select value from pg_temp.hexis_temporal_state where key = 'plan')
  ),
  'HX409',
  null,
  'create_habit rejects the same slot on D while its paused version still ends on D'
);

insert into pg_temp.hexis_temporal_state (key, value)
select
  'new_0',
  (
    public.create_habit(
      (select value from pg_temp.hexis_temporal_state where key = 'plan'),
      'Nuevo cero',
      'Accion nueva cero',
      array[0, 1, 2, 3, 4, 5, 6]::smallint[],
      'UTC',
      'a0000000-0000-4000-8000-000000000006',
      '2030-01-02'::date,
      'none',
      '{}'::jsonb,
      null::time,
      0::smallint
    ) -> 'habit' ->> 'id'
  )::uuid;

select extensions.is(
  (
    select position
    from public.habits
    where id = (select value from pg_temp.hexis_temporal_state where key = 'new_0')
  ),
  0::smallint,
  'the same slot becomes available on D plus 1 after the previous range ends on D'
);

insert into pg_temp.hexis_temporal_state (key, value)
select
  'reactivated_1',
  (
    public.set_habit_status(
      (select value from pg_temp.hexis_temporal_state where key = 'root_1'),
      'active',
      '2030-01-02'::date,
      'a0000000-0000-4000-8000-000000000007'
    ) -> 'habit' ->> 'id'
  )::uuid;

select extensions.is(
  (
    select position
    from public.habits
    where id = (select value from pg_temp.hexis_temporal_state where key = 'reactivated_1')
  ),
  1::smallint,
  'reactivation reuses its position when that slot is free on effective_on'
);

select public.create_habit(
  (select value from pg_temp.hexis_temporal_state where key = 'plan'),
  'Nuevo dos',
  'Accion nueva dos',
  array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  'UTC',
  'a0000000-0000-4000-8000-000000000008',
  '2030-01-02'::date,
  'none',
  '{}'::jsonb,
  null::time,
  2::smallint
);

select extensions.is(
  (
    select count(*)::bigint
    from public.habits
    where plan_id = (select value from pg_temp.hexis_temporal_state where key = 'plan')
      and starts_on <= '2030-01-02'::date
      and (ends_on is null or ends_on >= '2030-01-02'::date)
  ),
  3::bigint,
  'exactly three dated habit versions can overlap on one day'
);

select extensions.throws_ok(
  format(
    $sql$select public.set_habit_status(%L::uuid,'active','2030-01-02'::date,'a0000000-0000-4000-8000-000000000009'::uuid)$sql$,
    (select value from pg_temp.hexis_temporal_state where key = 'root_0')
  ),
  'HX409',
  null,
  'reactivation rejects a fourth dated commitment when all three slots overlap'
);

select * from extensions.finish();
rollback;
