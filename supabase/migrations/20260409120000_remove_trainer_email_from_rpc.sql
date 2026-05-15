-- Remove trainer email from redeem_invite_code response for client privacy

create or replace function public.redeem_invite_code(p_code text)
returns jsonb as $$
declare
  v_trainer record;
  v_client_id uuid;
  v_client_role text;
  v_connection_id uuid;
begin
  v_client_id := auth.uid();

  -- Only clients can redeem
  select role into v_client_role from public.profiles where id = v_client_id;
  if v_client_role != 'client' then
    return jsonb_build_object('success', false, 'error', 'only_clients');
  end if;

  -- Look up trainer by permanent code
  select id, name into v_trainer
  from public.profiles
  where trainer_code = upper(p_code)
    and role = 'trainer';

  if v_trainer.id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  -- Check for existing connection
  if exists (
    select 1 from public.trainer_clients
    where trainer_id = v_trainer.id
      and client_id = v_client_id
      and status in ('active', 'pending')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_connected');
  end if;

  -- Create pending connection
  insert into public.trainer_clients (trainer_id, client_id, status, client_confirmed)
  values (v_trainer.id, v_client_id, 'pending', false)
  on conflict (trainer_id, client_id)
  do update set status = 'pending', client_confirmed = false, connected_at = now()
  returning id into v_connection_id;

  return jsonb_build_object(
    'success', true,
    'trainer_id', v_trainer.id,
    'trainer_name', v_trainer.name,
    'connection_id', v_connection_id
  );
end;
$$ language plpgsql security definer;
