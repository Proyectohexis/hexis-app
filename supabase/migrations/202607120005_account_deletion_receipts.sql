begin;

-- Short-lived, server-only receipts let a mobile client safely retry an
-- account deletion when the first HTTP response is lost. They intentionally
-- survive the auth.users cascade for 24 hours, contain no email/content and
-- are never exposed to authenticated or anonymous clients.
create table hexis_private.account_deletion_receipts (
  user_id uuid not null,
  operation_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  started_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz not null
    default (pg_catalog.clock_timestamp() + interval '24 hours'),
  primary key (user_id, operation_id),
  check (
    (status = 'pending' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

revoke all on table hexis_private.account_deletion_receipts
  from public, anon, authenticated;

create function public.get_account_deletion_receipt(
  p_user_id uuid,
  p_operation_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  receipt_status text;
begin
  if p_user_id is null or p_operation_id is null then
    raise exception using errcode = 'HX422', message = 'receipt identifiers are required';
  end if;

  delete from hexis_private.account_deletion_receipts
  where expires_at <= pg_catalog.clock_timestamp();

  select status
    into receipt_status
  from hexis_private.account_deletion_receipts
  where user_id = p_user_id
    and operation_id = p_operation_id;

  return receipt_status;
end
$$;

create function public.begin_account_deletion_receipt(
  p_user_id uuid,
  p_operation_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  receipt_status text;
begin
  if p_user_id is null or p_operation_id is null then
    raise exception using errcode = 'HX422', message = 'receipt identifiers are required';
  end if;

  delete from hexis_private.account_deletion_receipts
  where expires_at <= pg_catalog.clock_timestamp();

  insert into hexis_private.account_deletion_receipts (
    user_id,
    operation_id
  ) values (
    p_user_id,
    p_operation_id
  )
  on conflict (user_id, operation_id) do nothing;

  select status
    into receipt_status
  from hexis_private.account_deletion_receipts
  where user_id = p_user_id
    and operation_id = p_operation_id;

  return receipt_status;
end
$$;

create function public.complete_account_deletion_receipt(
  p_user_id uuid,
  p_operation_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_operation_id is null then
    raise exception using errcode = 'HX422', message = 'receipt identifiers are required';
  end if;

  insert into hexis_private.account_deletion_receipts (
    user_id,
    operation_id,
    status,
    completed_at,
    expires_at
  ) values (
    p_user_id,
    p_operation_id,
    'completed',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + interval '24 hours'
  )
  on conflict (user_id, operation_id) do update
    set status = 'completed',
        completed_at = pg_catalog.clock_timestamp(),
        expires_at = pg_catalog.clock_timestamp() + interval '24 hours';

  return 'completed'::text;
end
$$;

create function public.clear_pending_account_deletion_receipt(
  p_user_id uuid,
  p_operation_id uuid
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from hexis_private.account_deletion_receipts
  where user_id = p_user_id
    and operation_id = p_operation_id
    and status = 'pending';
$$;

revoke all on function public.get_account_deletion_receipt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.begin_account_deletion_receipt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_account_deletion_receipt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.clear_pending_account_deletion_receipt(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_account_deletion_receipt(uuid, uuid)
  to service_role;
grant execute on function public.begin_account_deletion_receipt(uuid, uuid)
  to service_role;
grant execute on function public.complete_account_deletion_receipt(uuid, uuid)
  to service_role;
grant execute on function public.clear_pending_account_deletion_receipt(uuid, uuid)
  to service_role;

comment on table hexis_private.account_deletion_receipts is
  'Short-lived idempotency receipts for reconciling lost account-deletion responses; no email or user content.';

commit;
