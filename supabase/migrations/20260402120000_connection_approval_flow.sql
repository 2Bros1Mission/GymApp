-- Extend trainer_clients status to support pending/rejected states
alter table public.trainer_clients
  drop constraint trainer_clients_status_check;
alter table public.trainer_clients
  add constraint trainer_clients_status_check
  check (status in ('pending', 'active', 'rejected', 'removed'));

-- Track whether the client has confirmed the connection request
alter table public.trainer_clients
  add column client_confirmed boolean not null default false;

-- Existing active connections are already confirmed
update public.trainer_clients set client_confirmed = true where status = 'active';

-- Updated redeem_invite_code: creates pending connection, returns trainer info
create or replace function public.redeem_invite_code(p_code text)
returns jsonb as $$
declare
  v_invite record;
  v_client_id uuid;
  v_client_role text;
  v_trainer_name text;
  v_trainer_email text;
  v_connection_id uuid;
begin
  v_client_id := auth.uid();

  select role into v_client_role from public.profiles where id = v_client_id;
  if v_client_role != 'client' then
    return jsonb_build_object('success', false, 'error', 'only_clients');
  end if;

  select * into v_invite from public.trainer_invites
  where code = upper(p_code)
    and used = false
    and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if exists (
    select 1 from public.trainer_clients
    where trainer_id = v_invite.trainer_id
      and client_id = v_client_id
      and status in ('active', 'pending')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_connected');
  end if;

  -- Create pending connection
  insert into public.trainer_clients (trainer_id, client_id, status, client_confirmed)
  values (v_invite.trainer_id, v_client_id, 'pending', false)
  on conflict (trainer_id, client_id)
  do update set status = 'pending', client_confirmed = false, connected_at = now()
  returning id into v_connection_id;

  -- Mark invite as used
  update public.trainer_invites
  set used = true, used_by = v_client_id
  where id = v_invite.id;

  -- Get trainer info for client confirmation screen
  select name, email into v_trainer_name, v_trainer_email
  from public.profiles where id = v_invite.trainer_id;

  return jsonb_build_object(
    'success', true,
    'trainer_id', v_invite.trainer_id,
    'trainer_name', v_trainer_name,
    'trainer_email', v_trainer_email,
    'connection_id', v_connection_id
  );
end;
$$ language plpgsql security definer;

-- Client confirms they want to connect with this trainer
create or replace function public.confirm_connection(p_connection_id uuid)
returns jsonb as $$
begin
  update public.trainer_clients
  set client_confirmed = true
  where id = p_connection_id
    and client_id = auth.uid()
    and status = 'pending';

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;

-- Trainer approves a confirmed pending request
create or replace function public.approve_connection(p_connection_id uuid)
returns jsonb as $$
begin
  update public.trainer_clients
  set status = 'active'
  where id = p_connection_id
    and trainer_id = auth.uid()
    and status = 'pending'
    and client_confirmed = true;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;

-- Trainer rejects a pending request
create or replace function public.reject_connection(p_connection_id uuid)
returns jsonb as $$
begin
  update public.trainer_clients
  set status = 'rejected'
  where id = p_connection_id
    and trainer_id = auth.uid()
    and status = 'pending';

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;
