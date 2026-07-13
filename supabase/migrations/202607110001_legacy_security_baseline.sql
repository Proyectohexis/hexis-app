begin;

create extension if not exists pgcrypto;

-- This creates the minimum contract for a fresh development database. If a
-- legacy table already exists, its shape is intentionally not rewritten here.
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  completed boolean not null default false,
  completed_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric(6, 2) not null check (weight > 0 and weight <= 500),
  notes text check (notes is null or char_length(notes) <= 500),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text,
  current_streak integer not null default 0 check (current_streak >= 0),
  last_completed date,
  updated_at timestamptz not null default now()
);

-- Never silently combine our ownership policies with unknown permissive
-- policies. Inventory and replace those policies in a reviewed migration.
do $$
declare
  unexpected_policies text;
begin
  select string_agg(format('%I.%I:%I', schemaname, tablename, policyname), ', ')
    into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('habits', 'progress', 'streaks')
    and policyname not in (
      'hexis_habits_select_own',
      'hexis_habits_insert_own',
      'hexis_habits_update_own',
      'hexis_habits_delete_own',
      'hexis_progress_select_own',
      'hexis_progress_insert_own',
      'hexis_progress_update_own',
      'hexis_progress_delete_own',
      'hexis_streaks_select_own',
      'hexis_streaks_insert_own',
      'hexis_streaks_update_own',
      'hexis_streaks_delete_own'
    );

  if unexpected_policies is not null then
    raise exception 'Políticas legacy inesperadas; inventariar antes de continuar: %', unexpected_policies;
  end if;
end
$$;

create index if not exists habits_user_id_idx on public.habits (user_id);
create index if not exists progress_user_id_date_idx on public.progress (user_id, date desc);

alter table public.habits enable row level security;
alter table public.progress enable row level security;
alter table public.streaks enable row level security;

alter table public.habits force row level security;
alter table public.progress force row level security;
alter table public.streaks force row level security;

revoke all on table public.habits, public.progress, public.streaks from public, anon;
grant select, insert, update, delete on table public.habits, public.progress, public.streaks to authenticated;

drop policy if exists hexis_habits_select_own on public.habits;
drop policy if exists hexis_habits_insert_own on public.habits;
drop policy if exists hexis_habits_update_own on public.habits;
drop policy if exists hexis_habits_delete_own on public.habits;

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
create policy hexis_habits_delete_own on public.habits
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists hexis_progress_select_own on public.progress;
drop policy if exists hexis_progress_insert_own on public.progress;
drop policy if exists hexis_progress_update_own on public.progress;
drop policy if exists hexis_progress_delete_own on public.progress;

create policy hexis_progress_select_own on public.progress
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_progress_insert_own on public.progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_progress_update_own on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy hexis_progress_delete_own on public.progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists hexis_streaks_select_own on public.streaks;
drop policy if exists hexis_streaks_insert_own on public.streaks;
drop policy if exists hexis_streaks_update_own on public.streaks;
drop policy if exists hexis_streaks_delete_own on public.streaks;

create policy hexis_streaks_select_own on public.streaks
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hexis_streaks_insert_own on public.streaks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hexis_streaks_update_own on public.streaks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy hexis_streaks_delete_own on public.streaks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
