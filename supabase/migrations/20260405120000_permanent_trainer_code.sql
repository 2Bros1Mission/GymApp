-- Issue #81: Replace one-time invite codes with permanent trainer codes
--
-- Each trainer gets a unique 6-char code on signup. Clients enter this code
-- to connect. The code never expires and can be reused by multiple clients.

-- 1. Add trainer_code column to profiles
alter table public.profiles
  add column trainer_code text unique;

-- 2. Helper: generate a random 6-char code (same charset as the app)
create or replace function public.generate_trainer_code()
returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return code;
end;
$$ language plpgsql;

-- 3. Backfill codes for existing trainers
do $$
declare
  r record;
  new_code text;
begin
  for r in select id from public.profiles where role = 'trainer' and trainer_code is null loop
    loop
      new_code := public.generate_trainer_code();
      begin
        update public.profiles set trainer_code = new_code where id = r.id;
        exit; -- success, break retry loop
      exception when unique_violation then
        -- collision, retry with a new code
        null;
      end;
    end loop;
  end loop;
end;
$$;

-- 4. Update handle_new_user trigger to auto-assign code for trainers
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
  v_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'client');

  if v_role = 'trainer' then
    -- Generate unique code with collision retry
    loop
      v_code := public.generate_trainer_code();
      begin
        insert into public.profiles (id, name, email, role, trainer_code)
        values (
          new.id,
          coalesce(new.raw_user_meta_data->>'name', ''),
          new.email,
          v_role,
          v_code
        );
        exit; -- success
      exception when unique_violation then
        -- Code collision, retry (profile unique constraint on trainer_code)
        if exists (select 1 from public.profiles where id = new.id) then
          exit; -- Profile was created, just code collision on different profile — shouldn't happen
        end if;
        -- Otherwise retry with new code
      end;
    end loop;
  else
    insert into public.profiles (id, name, email, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', ''),
      new.email,
      v_role
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 5. Rewrite redeem_invite_code to use profiles.trainer_code
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
  select id, name, email into v_trainer
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
    'trainer_email', v_trainer.email,
    'connection_id', v_connection_id
  );
end;
$$ language plpgsql security definer;
