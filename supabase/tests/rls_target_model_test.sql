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
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'hexis-user-a@example.test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'hexis-user-b@example.test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

create temporary table hexis_test_state (
  key text primary key,
  value uuid not null
);
grant select, insert, update on table pg_temp.hexis_test_state to authenticated;

create temporary table hexis_test_clock (
  local_date date not null,
  occurred_at timestamptz not null
);
insert into pg_temp.hexis_test_clock (local_date, occurred_at)
select
  (pg_catalog.timezone('America/Panama', captured_at))::date,
  captured_at
from (select pg_catalog.clock_timestamp() as captured_at) captured;
grant select on table pg_temp.hexis_test_clock to authenticated;

set local role authenticated;
do $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
  );
end
$$;

insert into pg_temp.hexis_test_state (key, value)
select
  'plan',
  (result -> 'plan' ->> 'id')::uuid
from (
  select public.create_initial_plan(
    'Soy una persona que cumple compromisos',
    'Completar mi ciclo de disciplina',
    'Construir evidencia sostenible',
    'America/Panama',
    '[{"name":"Caminar","minimum_action":"Caminar 10 minutos","scheduled_weekdays":[0,1,2,3,4,5,6]}]'::jsonb,
    '10000000-0000-4000-8000-000000000001',
    '2020-07-13'::date,
    null
  ) as result
) created;

insert into pg_temp.hexis_test_state (key, value)
select 'root_habit', id
from public.habits
where plan_id = (select value from pg_temp.hexis_test_state where key = 'plan')
  and position = 0
  and status = 'active';

select extensions.ok(
  (
    public.create_initial_plan(
      'Soy una persona que cumple compromisos',
      'Completar mi ciclo de disciplina',
      'Construir evidencia sostenible',
      'America/Panama',
      '[{"name":"Caminar","minimum_action":"Caminar 10 minutos","scheduled_weekdays":[0,1,2,3,4,5,6]}]'::jsonb,
      '10000000-0000-4000-8000-000000000001',
      '2020-07-13'::date,
      null
    ) ->> 'idempotent'
  )::boolean,
  'create_initial_plan is idempotent'
);

select extensions.is(
  (select count(*)::bigint from public.plans),
  1::bigint,
  'user A sees one owned plan'
);

select extensions.is(
  (select timezone from public.plans limit 1),
  'America/Panama'::text,
  'plan freezes its IANA timezone'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'habit_1',
  (public.create_habit(
    (select value from pg_temp.hexis_test_state where key = 'plan'),
    'Leer',
    'Leer dos páginas',
    array[0, 1, 2, 3, 4, 5, 6]::smallint[],
    'America/Panama',
    '10000000-0000-4000-8000-000000000002',
    '2026-07-13'::date
  ) -> 'habit' ->> 'id')::uuid;

select extensions.ok(
  (
    public.create_habit(
      (select value from pg_temp.hexis_test_state where key = 'plan'),
      'Leer',
      'Leer dos páginas',
      array[0, 1, 2, 3, 4, 5, 6]::smallint[],
      'America/Panama',
      '10000000-0000-4000-8000-000000000002',
      '2026-07-13'::date
    ) ->> 'idempotent'
  )::boolean,
  'create_habit is idempotent'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'habit_2',
  (public.create_habit(
    (select value from pg_temp.hexis_test_state where key = 'plan'),
    'Preparar',
    'Preparar ropa de entrenamiento',
    array[0, 1, 2, 3, 4, 5, 6]::smallint[],
    'America/Panama',
    '10000000-0000-4000-8000-000000000003',
    '2026-07-13'::date
  ) -> 'habit' ->> 'id')::uuid;

select extensions.throws_ok(
  format(
    $sql$select public.replace_habit_configuration(%L::uuid,'Leer mejor','Leer tres páginas',array[0,1,2,3,4,5,6]::smallint[],'America/Panama','2026-07-13'::date,'10000000-0000-4000-8000-000000000009'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'habit_1')
  ),
  'HX422',
  null,
  'a replacement cannot overlap the first day of its previous version'
);

select extensions.throws_ok(
  format(
    $sql$select public.set_habit_status(%L::uuid,'paused','2026-07-13'::date,'10000000-0000-4000-8000-000000000010'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'habit_2')
  ),
  'HX422',
  null,
  'a pause cannot close a habit on the same day its version begins'
);

select extensions.throws_ok(
  format(
    $sql$select public.create_habit(%L::uuid,'Cuarto','Acción',array[0]::smallint[],'America/Panama','10000000-0000-4000-8000-000000000004'::uuid,'2026-07-13'::date)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'plan')
  ),
  'HX409',
  null,
  'a fourth active habit is rejected'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'record_event',
  (public.record_habit_completion(
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    '2020-07-13'::date,
    '2020-07-13 08:00:00-05'::timestamptz,
    'America/Panama',
    '20000000-0000-4000-8000-000000000001',
    'minimum',
    'manual'
  ) -> 'event' ->> 'id')::uuid;

select extensions.throws_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,'2020-07-14'::date,'2020-07-13 08:00:00-05'::timestamptz,'Pacific/Kiritimati','20000000-0000-4000-8000-000000000099'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit')
  ),
  'HX422',
  null,
  'completion timezone cannot differ from the frozen habit timezone'
);

select extensions.throws_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,%L::date,%L::timestamptz,'America/Panama','20000000-0000-4000-8000-000000000097'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    (select local_date + 1 from pg_temp.hexis_test_clock),
    (select occurred_at + interval '1 day' from pg_temp.hexis_test_clock)
  ),
  'HX422',
  null,
  'completion evidence cannot be assigned to a future local date'
);

select extensions.throws_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,%L::date,%L::timestamptz,'America/Panama','20000000-0000-4000-8000-000000000096'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    (
      select (
        pg_catalog.timezone(
          'America/Panama',
          occurred_at + interval '1 hour'
        )
      )::date
      from pg_temp.hexis_test_clock
    ),
    (select occurred_at + interval '1 hour' from pg_temp.hexis_test_clock)
  ),
  'HX422',
  null,
  'completion evidence rejects timestamps beyond the five minute clock-skew allowance'
);

select extensions.ok(
  (
    public.record_habit_completion(
      (select value from pg_temp.hexis_test_state where key = 'root_habit'),
      '2020-07-13'::date,
      '2020-07-13 08:00:00-05'::timestamptz,
      'America/Panama',
      '20000000-0000-4000-8000-000000000001',
      'minimum',
      'manual'
    ) ->> 'idempotent'
  )::boolean,
  'record_habit_completion is idempotent'
);

select extensions.is(
  (select count(*)::bigint from public.habit_daily_evidence),
  1::bigint,
  'security-invoker view exposes active owned evidence'
);

select extensions.throws_ok(
  format(
    $sql$update public.habit_completion_events set source='offline_sync' where id=%L::uuid$sql$,
    (select value from pg_temp.hexis_test_state where key = 'record_event')
  ),
  '42501',
  null,
  'authenticated users cannot update append-only events'
);

select extensions.throws_ok(
  format(
    $sql$insert into public.habit_completion_events(user_id,habit_id,local_date,occurred_at,timezone,event_type,completion_level,source,client_operation_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',%L::uuid,'2020-07-14'::date,'2020-07-14 08:00:00-05'::timestamptz,'America/Panama','recorded','full','integration','20000000-0000-4000-8000-000000000098'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit')
  ),
  'HX403',
  null,
  'authenticated clients cannot forge integration source'
);

select extensions.ok(
  not (
    public.retract_habit_completion(
      (select value from pg_temp.hexis_test_state where key = 'root_habit'),
      '2020-07-13'::date,
      '2020-07-14 08:00:00-05'::timestamptz,
      'America/Panama',
      '20000000-0000-4000-8000-000000000002',
      'manual'
    ) ->> 'idempotent'
  )::boolean,
  'retraction appends a new event'
);

select extensions.is(
  (select count(*)::bigint from public.habit_daily_evidence),
  0::bigint,
  'retracted evidence leaves the current evidence view'
);

select extensions.throws_ok(
  format(
    $sql$select public.set_habit_schedule_exception(%L::uuid,'2021-07-12'::date,'rest',null,'30000000-0000-4000-8000-000000000009'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit')
  ),
  'HX422',
  null,
  'schedule exceptions cannot erase missed opportunities retroactively'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'exception',
  (public.set_habit_schedule_exception(
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    (select local_date from pg_temp.hexis_test_clock),
    'rest',
    'Descanso planificado',
    '30000000-0000-4000-8000-000000000001'
  ) -> 'exception' ->> 'id')::uuid;

select extensions.throws_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,%L::date,%L::timestamptz,'America/Panama','20000000-0000-4000-8000-000000000003'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    (select local_date from pg_temp.hexis_test_clock),
    (select occurred_at from pg_temp.hexis_test_clock)
  ),
  'HX409',
  null,
  'active rest exception blocks evidence for that date'
);

select extensions.ok(
  (
    public.remove_habit_schedule_exception(
      (select value from pg_temp.hexis_test_state where key = 'exception'),
      '30000000-0000-4000-8000-000000000002'
    ) -> 'exception' ->> 'deleted_at'
  ) is not null,
  'schedule exception removal is a tombstone'
);

select extensions.is(
  (select count(*)::bigint from public.habit_schedule_exceptions),
  0::bigint,
  'RLS hides tombstoned schedule exceptions'
);

select extensions.lives_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,%L::date,%L::timestamptz,'America/Panama','20000000-0000-4000-8000-000000000004'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    (select local_date from pg_temp.hexis_test_clock),
    (select occurred_at from pg_temp.hexis_test_clock)
  ),
  'evidence can be recorded after removing the exception'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'replacement_habit',
  (public.replace_habit_configuration(
    (select value from pg_temp.hexis_test_state where key = 'root_habit'),
    'Caminar con intención',
    'Caminar 12 minutos',
    array[0, 1, 2, 3, 4, 5, 6]::smallint[],
    'America/Panama',
    (select local_date + 1 from pg_temp.hexis_test_clock),
    '10000000-0000-4000-8000-000000000005'
  ) -> 'habit' ->> 'id')::uuid;

select extensions.is(
  (
    select lineage_id
    from public.habits
    where id = (select value from pg_temp.hexis_test_state where key = 'replacement_habit')
  ),
  (select value from pg_temp.hexis_test_state where key = 'root_habit'),
  'replacement preserves the habit lineage'
);

select extensions.is(
  (
    public.set_habit_status(
      (select value from pg_temp.hexis_test_state where key = 'replacement_habit'),
      'paused',
      (select local_date + 2 from pg_temp.hexis_test_clock),
      '10000000-0000-4000-8000-000000000006'
    ) -> 'habit' ->> 'status'
  ),
  'paused'::text,
  'pause closes the active habit version'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'reactivated_habit',
  (public.set_habit_status(
    (select value from pg_temp.hexis_test_state where key = 'replacement_habit'),
    'active',
    (select local_date + 2 from pg_temp.hexis_test_clock),
    '10000000-0000-4000-8000-000000000007'
  ) -> 'habit' ->> 'id')::uuid;

select extensions.is(
  (
    select version_number
    from public.habits
    where id = (select value from pg_temp.hexis_test_state where key = 'reactivated_habit')
  ),
  3,
  'reactivation creates the next version rather than rewriting history'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'metric',
  (public.create_transformation_metric(
    (select value from pg_temp.hexis_test_state where key = 'plan'),
    'weight',
    'Peso',
    'kg',
    '40000000-0000-4000-8000-000000000001'
  ) -> 'metric' ->> 'id')::uuid;

select extensions.throws_ok(
  format(
    $sql$select public.create_transformation_metric(%L::uuid,'custom','Otra','pts','40000000-0000-4000-8000-000000000002'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'plan')
  ),
  'HX409',
  null,
  'MVP allows only one active metric per plan'
);

insert into pg_temp.hexis_test_state (key, value)
select
  'metric_entry',
  (public.record_metric_entry(
    (select value from pg_temp.hexis_test_state where key = 'metric'),
    80.5,
    '2026-07-13'::date,
    '2026-07-13 07:00:00-05'::timestamptz,
    'Medición inicial',
    '50000000-0000-4000-8000-000000000001'
  ) -> 'entry' ->> 'id')::uuid;

select extensions.ok(
  (
    public.record_metric_entry(
      (select value from pg_temp.hexis_test_state where key = 'metric'),
      80.5,
      '2026-07-13'::date,
      '2026-07-13 07:00:00-05'::timestamptz,
      'Medición inicial',
      '50000000-0000-4000-8000-000000000001'
    ) ->> 'idempotent'
  )::boolean,
  'record_metric_entry is idempotent'
);

select extensions.is(
  (
    public.update_metric_entry(
      (select value from pg_temp.hexis_test_state where key = 'metric_entry'),
      80.2,
      '2026-07-13'::date,
      'Corregida',
      '50000000-0000-4000-8000-000000000002'
    ) -> 'entry' ->> 'value'
  )::numeric,
  80.2::numeric,
  'metric entry update is transactional'
);

select extensions.ok(
  (
    public.delete_metric_entry(
      (select value from pg_temp.hexis_test_state where key = 'metric_entry'),
      '50000000-0000-4000-8000-000000000003'
    ) -> 'entry' ->> 'deleted_at'
  ) is not null,
  'metric entry deletion is a tombstone'
);

select extensions.is(
  (select count(*)::bigint from public.metric_entries),
  0::bigint,
  'ordinary RLS reads hide deleted metric entries'
);

select extensions.is(
  public.export_current_account() ->> 'format',
  'hexis-account-export'::text,
  'account export has a stable machine-readable format'
);

select extensions.is(
  public.export_current_account() #>> '{account,id}',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::text,
  'account export is bound to auth.uid'
);

select extensions.is(
  pg_catalog.jsonb_array_length(
    public.export_current_account() #> '{data,metric_entries}'
  ),
  1,
  'account export includes the owned metric tombstone'
);

select extensions.ok(
  public.export_current_account()::text not like '%client_operation_id%'
  and public.export_current_account()::text not like '%request_fingerprint%',
  'account export excludes internal idempotency fields by explicit allowlist'
);

select extensions.ok(
  not (
    public.complete_weekly_review(
      (select value from pg_temp.hexis_test_state where key = 'plan'),
      '2026-06-29'::date,
      'Sostuve lo esencial.',
      'keep',
      '60000000-0000-4000-8000-000000000001'
    ) ->> 'idempotent'
  )::boolean,
  'weekly review is created once'
);

select extensions.ok(
  (
    public.complete_weekly_review(
      (select value from pg_temp.hexis_test_state where key = 'plan'),
      '2026-06-29'::date,
      'Sostuve lo esencial.',
      'keep',
      '60000000-0000-4000-8000-000000000001'
    ) ->> 'idempotent'
  )::boolean,
  'weekly review retry returns the existing review'
);

select extensions.throws_ok(
  format(
    $sql$select public.complete_weekly_review(%L::uuid,'2999-01-04'::date,'Futuro','keep','60000000-0000-4000-8000-000000000098'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'plan')
  ),
  'HX422',
  null,
  'weekly reviews cannot be created before their week is closed'
);

select extensions.throws_ok(
  $sql$insert into public.weekly_reviews(user_id,plan_id,week_start,reflection,decision,client_operation_id,request_fingerprint) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select value from pg_temp.hexis_test_state where key='plan'),'2026-07-20','Bypass','keep','60000000-0000-4000-8000-000000000099','00000000000000000000000000000000')$sql$,
  '42501',
  null,
  'authenticated clients cannot bypass weekly review RPC inserts'
);

select extensions.throws_ok(
  $sql$update public.weekly_reviews set reflection='Bypass'$sql$,
  '42501',
  null,
  'authenticated clients cannot desynchronize weekly review fingerprints'
);

reset role;
set local role authenticated;
do $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    true
  );
end
$$;

select extensions.is(
  (select count(*)::bigint from public.plans),
  0::bigint,
  'user B cannot read user A plans'
);

select extensions.is(
  (select count(*)::bigint from public.habits),
  0::bigint,
  'user B cannot read user A habit versions'
);

select extensions.is(
  (select count(*)::bigint from public.habit_daily_evidence),
  0::bigint,
  'user B cannot read user A evidence view'
);

select extensions.is(
  (select count(*)::bigint from public.transformation_metrics),
  0::bigint,
  'user B cannot read user A transformation metric'
);

select extensions.is(
  pg_catalog.jsonb_array_length(
    public.export_current_account() #> '{data,plans}'
  ),
  0,
  'user B export cannot include user A plans'
);

select extensions.throws_ok(
  format(
    $sql$select public.record_habit_completion(%L::uuid,'2026-07-15'::date,'2026-07-15 08:00:00-05'::timestamptz,'America/Panama','20000000-0000-4000-8000-000000000099'::uuid,'full','manual')$sql$,
    (select value from pg_temp.hexis_test_state where key = 'reactivated_habit')
  ),
  'HX403',
  null,
  'user B cannot mutate user A habit through an RPC'
);

select extensions.throws_ok(
  format(
    $sql$select public.create_transformation_metric(%L::uuid,'custom','Ajena','pts','40000000-0000-4000-8000-000000000099'::uuid)$sql$,
    (select value from pg_temp.hexis_test_state where key = 'plan')
  ),
  'HX403',
  null,
  'user B cannot attach a metric to user A plan'
);

select extensions.throws_ok(
  $sql$insert into public.plans(user_id,identity_statement,outcome_statement,why_statement,timezone,starts_on,client_operation_id,request_fingerprint) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tres','Tres','Tres','UTC',current_date,'70000000-0000-4000-8000-000000000001','00000000000000000000000000000000')$sql$,
  '42501',
  null,
  'direct plan inserts are not granted to authenticated clients'
);

reset role;
set local role anon;
do $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
end
$$;

select extensions.throws_ok(
  'select count(*) from public.plans',
  '42501',
  null,
  'anon has no table read privilege'
);

select extensions.throws_ok(
  $sql$select public.complete_weekly_review('00000000-0000-0000-0000-000000000000'::uuid,current_date,'No','keep','80000000-0000-4000-8000-000000000001'::uuid)$sql$,
  '42501',
  null,
  'anon cannot execute authenticated RPCs'
);

select extensions.throws_ok(
  'select public.export_current_account()',
  '42501',
  null,
  'anon cannot export account data'
);

reset role;

set local role authenticated;
select extensions.throws_ok(
  $sql$select public.begin_account_deletion_receipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'90000000-0000-4000-8000-000000000001'::uuid)$sql$,
  '42501',
  null,
  'authenticated clients cannot access account deletion receipts'
);

reset role;
set local role service_role;

select extensions.is(
  public.begin_account_deletion_receipt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '90000000-0000-4000-8000-000000000001'::uuid
  ),
  'pending'::text,
  'service role can begin an account deletion receipt'
);

select extensions.is(
  public.complete_account_deletion_receipt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '90000000-0000-4000-8000-000000000001'::uuid
  ),
  'completed'::text,
  'service role can complete an account deletion receipt'
);

select extensions.is(
  public.get_account_deletion_receipt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '90000000-0000-4000-8000-000000000001'::uuid
  ),
  'completed'::text,
  'completed receipt can be reconciled'
);

reset role;

select extensions.ok(
  exists (
    select 1 from public.metric_entries
    where id = (select value from pg_temp.hexis_test_state where key = 'metric_entry')
      and deleted_at is not null
  ),
  'trusted maintenance context can observe metric tombstones'
);

delete from auth.users
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role service_role;

select extensions.is(
  public.get_account_deletion_receipt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '90000000-0000-4000-8000-000000000001'::uuid
  ),
  'completed'::text,
  'short-lived deletion receipt survives the user cascade for reconciliation'
);

reset role;

select extensions.ok(
  not exists (
    select 1 from public.plans
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )
  and not exists (
    select 1 from public.habits
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )
  and not exists (
    select 1 from public.habit_completion_events
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )
  and not exists (
    select 1 from public.metric_entries
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'trusted account deletion cascades through target user data'
);

select * from extensions.finish();
rollback;
