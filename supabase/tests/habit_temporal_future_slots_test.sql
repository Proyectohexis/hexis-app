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
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'hexis-future-slots@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

create temporary table hexis_future_state (
  key text primary key,
  value uuid not null
);
grant select, insert, update on table pg_temp.hexis_future_state to authenticated;

set local role authenticated;
do $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    true
  );
end
$$;

insert into pg_temp.hexis_future_state (key, value)
select
  'plan',
  (created.result -> 'plan' ->> 'id')::uuid
from (
  select public.create_initial_plan(
    'Soy consistente con mis compromisos',
    'Proteger la agenda futura',
    'Evitar versiones temporales solapadas',
    'UTC',
    '[
      {"name":"Raiz cero","minimum_action":"Accion raiz","scheduled_weekdays":[0,1,2,3,4,5,6],"position":0}
    ]'::jsonb,
    'b0000000-0000-4000-8000-000000000001',
    '2030-02-01'::date,
    null
  ) as result
) created;

insert into pg_temp.hexis_future_state (key, value)
select 'root_0', id
from public.habits
where plan_id = (select value from pg_temp.hexis_future_state where key = 'plan')
  and position = 0;

insert into pg_temp.hexis_future_state (key, value)
select
  'future_1',
  (
    public.create_habit(
      (select value from pg_temp.hexis_future_state where key = 'plan'),
      'Futuro uno',
      'Accion futura uno',
      array[0, 1, 2, 3, 4, 5, 6]::smallint[],
      'UTC',
      'b0000000-0000-4000-8000-000000000002',
      '2030-02-03'::date,
      'none',
      '{}'::jsonb,
      null::time,
      1::smallint
    ) -> 'habit' ->> 'id'
  )::uuid;

select extensions.is(
  (
    select starts_on
    from public.habits
    where id = (select value from pg_temp.hexis_future_state where key = 'future_1')
  ),
  '2030-02-03'::date,
  'a future habit can be scheduled in a slot with no overlapping range'
);

-- Raw status changes immediately, but this version remains effective on D+2.
-- The overlap guards must use its dates even though the partial active index no
-- longer sees it.
select public.set_habit_status(
  (select value from pg_temp.hexis_future_state where key = 'future_1'),
  'paused',
  '2030-02-04'::date,
  'b0000000-0000-4000-8000-000000000009'
);

select extensions.throws_ok(
  format(
    $sql$select public.replace_habit_configuration(%L::uuid,'Raiz movida','Accion raiz',array[0,1,2,3,4,5,6]::smallint[],'UTC','2030-02-02'::date,'b0000000-0000-4000-8000-000000000003'::uuid,'none','{}'::jsonb,null,1::smallint)$sql$,
    (select value from pg_temp.hexis_future_state where key = 'root_0')
  ),
  'HX409',
  null,
  'replacement from D plus 1 rejects a slot reserved by another lineage from D plus 2'
);

select public.set_habit_status(
  (select value from pg_temp.hexis_future_state where key = 'root_0'),
  'paused',
  '2030-02-02'::date,
  'b0000000-0000-4000-8000-000000000004'
);

select public.create_habit(
  (select value from pg_temp.hexis_future_state where key = 'plan'),
  'Futuro cero',
  'Accion futura cero',
  array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  'UTC',
  'b0000000-0000-4000-8000-000000000005',
  '2030-02-03'::date,
  'none',
  '{}'::jsonb,
  null::time,
  0::smallint
);

select public.create_habit(
  (select value from pg_temp.hexis_future_state where key = 'plan'),
  'Futuro dos',
  'Accion futura dos',
  array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  'UTC',
  'b0000000-0000-4000-8000-000000000006',
  '2030-02-03'::date,
  'none',
  '{}'::jsonb,
  null::time,
  2::smallint
);

select extensions.is(
  (
    select count(*)::bigint
    from public.habits
    where plan_id = (select value from pg_temp.hexis_future_state where key = 'plan')
      and starts_on <= '2030-02-03'::date
      and (ends_on is null or ends_on >= '2030-02-03'::date)
  ),
  3::bigint,
  'three future slots are reserved from D plus 2'
);

select extensions.throws_ok(
  format(
    $sql$select public.create_habit(%L::uuid,'Intruso cero','Accion intrusa',array[0,1,2,3,4,5,6]::smallint[],'UTC','b0000000-0000-4000-8000-000000000007'::uuid,'2030-02-02'::date,'none','{}'::jsonb,null,0::smallint)$sql$,
    (select value from pg_temp.hexis_future_state where key = 'plan')
  ),
  'HX409',
  null,
  'create from D plus 1 rejects a slot already reserved from D plus 2'
);

select extensions.throws_ok(
  format(
    $sql$select public.set_habit_status(%L::uuid,'active','2030-02-02'::date,'b0000000-0000-4000-8000-000000000008'::uuid)$sql$,
    (select value from pg_temp.hexis_future_state where key = 'root_0')
  ),
  'HX409',
  null,
  'reactivation from D plus 1 rejects all slots already reserved from D plus 2'
);

select * from extensions.finish();
rollback;
