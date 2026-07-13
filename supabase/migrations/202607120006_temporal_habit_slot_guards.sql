begin;

-- Habit lifecycle operations close versions immediately while their date range
-- remains effective through D. A new version also remains effective through
-- the plan end. Slot ownership must therefore be evaluated by overlap with the
-- full proposed range, never from the raw lifecycle status or a single day.
do $migration$
declare
  source_definition text;
  patched_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_habit(uuid,text,text,smallint[],text,uuid,date,text,jsonb,time,smallint)'::regprocedure
  ) into source_definition;

  patched_definition := pg_catalog.replace(
    source_definition,
    E'        and model_version = 2\n        and status = ''active''\n        and position = candidate',
    E'        and model_version = 2\n        and (plan_row.ends_on is null or starts_on <= plan_row.ends_on)\n        and (ends_on is null or ends_on >= effective_on_value)\n        and position = candidate'
  );

  if patched_definition = source_definition then
    raise exception 'create_habit automatic slot guard could not be patched';
  end if;

  source_definition := patched_definition;
  patched_definition := pg_catalog.replace(
    source_definition,
    E'      and model_version = 2\n      and status = ''active''\n      and position = position_value',
    E'      and model_version = 2\n      and (plan_row.ends_on is null or starts_on <= plan_row.ends_on)\n      and (ends_on is null or ends_on >= effective_on_value)\n      and position = position_value'
  );

  if patched_definition = source_definition then
    raise exception 'create_habit explicit slot guard could not be patched';
  end if;

  execute patched_definition;

  select pg_catalog.pg_get_functiondef(
    'public.replace_habit_configuration(uuid,text,text,smallint[],text,date,uuid,text,jsonb,time,smallint)'::regprocedure
  ) into source_definition;

  patched_definition := pg_catalog.replace(
    source_definition,
    E'  position_value := coalesce(p_position, previous_habit.position);\n\n  update public.habits',
    E'  position_value := coalesce(p_position, previous_habit.position);\n\n  if exists (\n    select 1\n    from public.habits occupied_habit\n    where occupied_habit.plan_id = previous_habit.plan_id\n      and occupied_habit.model_version = 2\n      and occupied_habit.lineage_id <> previous_habit.lineage_id\n      and occupied_habit.position = position_value\n      and (\n        plan_row.ends_on is null\n        or occupied_habit.starts_on <= plan_row.ends_on\n      )\n      and (\n        occupied_habit.ends_on is null\n        or occupied_habit.ends_on >= p_effective_on\n      )\n  ) then\n    raise exception using\n      errcode = ''HX409'',\n      message = ''the habit slot overlaps the proposed version range'';\n  end if;\n\n  update public.habits'
  );

  if patched_definition = source_definition then
    raise exception 'replace_habit_configuration slot guard could not be patched';
  end if;

  execute patched_definition;

  select pg_catalog.pg_get_functiondef(
    'public.set_habit_status(uuid,text,date,uuid)'::regprocedure
  ) into source_definition;

  patched_definition := pg_catalog.replace(
    source_definition,
    E'        and model_version = 2\n        and status = ''active''\n        and position = previous_habit.position',
    E'        and model_version = 2\n        and (plan_row.ends_on is null or starts_on <= plan_row.ends_on)\n        and (ends_on is null or ends_on >= effective_on_value)\n        and position = previous_habit.position'
  );

  if patched_definition = source_definition then
    raise exception 'set_habit_status preferred slot guard could not be patched';
  end if;

  source_definition := patched_definition;
  patched_definition := pg_catalog.replace(
    source_definition,
    E'          and model_version = 2\n          and status = ''active''\n          and position = candidate',
    E'          and model_version = 2\n          and (plan_row.ends_on is null or starts_on <= plan_row.ends_on)\n          and (ends_on is null or ends_on >= effective_on_value)\n          and position = candidate'
  );

  if patched_definition = source_definition then
    raise exception 'set_habit_status fallback slot guard could not be patched';
  end if;

  execute patched_definition;
end
$migration$;

comment on function public.create_habit(
  uuid, text, text, smallint[], text, uuid, date, text, jsonb, time, smallint
) is 'Creates a habit only in a slot whose version range does not overlap the proposed range.';

comment on function public.replace_habit_configuration(
  uuid, text, text, smallint[], text, date, uuid, text, jsonb, time, smallint
) is 'Closes the current habit version and creates a dated replacement that cannot overlap another lineage in its slot.';

comment on function public.set_habit_status(uuid, text, date, uuid) is
  'Transitions habit status; reactivation selects a slot whose version ranges do not overlap the proposed range.';

commit;
