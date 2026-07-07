-- ============================================================
-- Issue #139 — trainer challenge RPCs
--
-- fn_create_trainer_challenge: atomic create of one trainer
-- challenge + N participant enrollments (ADR-005). Ownership is
-- derived from auth.uid(); every participant must be an ACTIVE
-- trainer_clients connection. All-or-nothing: any failure rolls
-- the challenge row back too. points is always stored as 0
-- (challenges_trainer_zero_points CHECK constraint).
--
-- fn_trainer_update_progress: guarded manual progress update for
-- custom_self_reported trainer challenges. p_value is the ABSOLUTE
-- new progress (idempotent on retry), clamped to target_value.
-- Completion sets status/completed_at but NEVER touches
-- profiles.leaderboard_points — the leaderboard is fed by platform
-- challenge completions only (see 20260602120000, #129 header).
--
-- search_path hardened with pg_temp per CVE-2018-1058, matching
-- every other SECURITY DEFINER function in the repo.
-- ============================================================

create or replace function public.fn_create_trainer_challenge(
  p_title text,
  p_title_bg text,
  p_description text,
  p_description_bg text,
  p_challenge_type text,
  p_target_value integer,
  p_start_date date,
  p_end_date date,
  p_difficulty text,
  p_category text,
  p_participants jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer uuid;
  v_challenge_id uuid;
  v_count integer;
  v_missing integer;
  v_bad_target integer;
begin
  v_trainer := auth.uid();

  if not exists (
    select 1 from public.profiles
    where id = v_trainer and role = 'trainer'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_trainer');
  end if;

  -- Null-safe validation (three-valued-logic-proof: every branch
  -- uses `is null or` so a NULL param cannot skip the guard).
  if p_title is null or char_length(trim(p_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_target_value is null or p_target_value <= 0 or p_target_value > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_start_date is null or p_end_date is null or p_end_date <= p_start_date then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_challenge_type is null or p_challenge_type not in
     ('frequency', 'streak', 'custom_auto', 'custom_self_reported') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_participants is null or jsonb_typeof(p_participants) != 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  v_count := jsonb_array_length(p_participants);
  if v_count < 1 or v_count > 50 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Every element must have a valid uuid userId; customTargetValue,
  -- when present, must be in (0, 100000].
  -- The `(e->>'userId')::uuid is null` cast is intentionally inside the
  -- guarded begin/exception block so a malformed (non-uuid) userId string
  -- raises an exception here and is caught, returning invalid_input instead
  -- of propagating a raw cast error to the caller.
  begin
    select count(*) into v_bad_target
    from jsonb_array_elements(p_participants) as e
    where (e->>'userId') is null or (e->>'userId')::uuid is null
       or (e ? 'customTargetValue') and (
            (e->>'customTargetValue')::integer <= 0
         or (e->>'customTargetValue')::integer > 100000
       );
  exception when others then
    -- non-uuid userId or non-integer customTargetValue
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end;
  if v_bad_target > 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Set-based connection check: every listed client must be an
  -- ACTIVE connection of this trainer. No per-client detail leaked.
  select count(*) into v_missing
  from jsonb_array_elements(p_participants) as e
  where not exists (
    select 1 from public.trainer_clients tc
    where tc.trainer_id = v_trainer
      and tc.client_id = (e->>'userId')::uuid
      and tc.status = 'active'
  );
  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'error', 'not_connected');
  end if;

  -- points is hard-zero for trainer challenges (challenges_trainer_zero_points CHECK); the leaderboard is platform-only.
  insert into public.challenges (
    source, creator_id, title, title_bg, description, description_bg,
    challenge_type, cadence, difficulty, target_value, points,
    category, status, start_date, end_date
  ) values (
    'trainer', v_trainer, trim(p_title), p_title_bg, p_description, p_description_bg,
    p_challenge_type, 'one_time', p_difficulty, p_target_value, 0,
    p_category, 'active', p_start_date, p_end_date
  ) returning id into v_challenge_id;

  insert into public.challenge_participants (
    challenge_id, user_id, source, status, current_progress,
    target_value, joined_at
  )
  select
    v_challenge_id,
    (e->>'userId')::uuid,
    'trainer_assigned',
    'active',
    0,
    coalesce((e->>'customTargetValue')::integer, p_target_value),
    now()
  from jsonb_array_elements(p_participants) as e;

  return jsonb_build_object('ok', true, 'challenge_id', v_challenge_id);
end;
$$;

revoke all on function public.fn_create_trainer_challenge(
  text, text, text, text, text, integer, date, date, text, text, jsonb
) from public;
grant execute on function public.fn_create_trainer_challenge(
  text, text, text, text, text, integer, date, date, text, text, jsonb
) to authenticated;

create or replace function public.fn_trainer_update_progress(
  p_challenge_id uuid,
  p_client_id uuid,
  p_value integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge record;
  v_participant record;
  v_new integer;
  v_completed boolean := false;
begin
  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Existence of others' challenges is not disclosed: wrong owner
  -- and wrong source both return not_found, not a permission error.
  if v_challenge.creator_id is distinct from auth.uid()
     or v_challenge.source != 'trainer' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_challenge.challenge_type != 'custom_self_reported' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if p_value is null or p_value <= 0 or p_value > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  select * into v_participant
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = p_client_id
    and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- p_value is the ABSOLUTE new progress (idempotent), clamped.
  v_new := least(p_value, v_participant.target_value);
  v_completed := v_new >= v_participant.target_value;

  update public.challenge_participants
  set current_progress = v_new,
      status = case when v_completed then 'completed' else status end,
      completed_at = case when v_completed then now() else completed_at end
  where id = v_participant.id;

  -- Deliberately NO profiles.leaderboard_points write here: trainer
  -- challenge points are display-only (spec, Design Decisions).

  return jsonb_build_object('ok', true, 'completed', v_completed);
end;
$$;

revoke all on function public.fn_trainer_update_progress(uuid, uuid, integer) from public;
grant execute on function public.fn_trainer_update_progress(uuid, uuid, integer) to authenticated;
