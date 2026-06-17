-- ============================================================
-- Issue #137: fn_report_progress RPC
-- Atomic self-report progress handler for custom_self_reported
-- challenges. Locks the participant row, validates challenge type
-- and status, updates progress, awards points on completion
-- (platform challenges only), and bumps user_challenge_state
-- completions_this_period when a custom challenge completes.
--
-- Returns jsonb: { ok, new_progress?, completed?, error? }
-- Error codes: unauthenticated, invalid_value, not_found,
-- not_active, not_self_reported
-- ============================================================

create or replace function public.fn_report_progress(
  p_challenge_id uuid,
  p_value integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant record;
  v_challenge record;
  v_new_progress integer;
  v_completed boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  if p_value <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  -- Lock the participant row to prevent the double-click double-completion race.
  select * into v_participant
  from public.challenge_participants
  where user_id = v_user_id and challenge_id = p_challenge_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_participant.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if v_challenge.challenge_type != 'custom_self_reported' then
    return jsonb_build_object('ok', false, 'error', 'not_self_reported');
  end if;

  v_new_progress := least(v_participant.current_progress + p_value, v_participant.target_value);
  v_completed := v_new_progress >= v_participant.target_value;

  if v_completed then
    update public.challenge_participants
    set current_progress = v_new_progress,
        status = 'completed',
        completed_at = now()
    where id = v_participant.id;

    -- Award points only for platform challenges (trainer challenges have 0 points).
    if v_challenge.source = 'platform' and v_challenge.points > 0 then
      update public.profiles
      set leaderboard_points = leaderboard_points + v_challenge.points,
          leaderboard_points_updated_at = now()
      where id = v_user_id;
    end if;

    -- Bump completions_this_period for platform custom challenges only.
    -- The #133 trigger gates the same bump on source='platform'; trainer
    -- challenges must NOT touch this counter because it drives the
    -- platform-discovery pool limits (MAX_COMPLETIONS per cadence).
    -- Frequency/streak challenges flow through the #133 trigger instead.
    if v_challenge.source = 'platform'
       and v_challenge.cadence in ('daily', 'weekly', 'monthly') then
      update public.user_challenge_state
      set completions_this_period = completions_this_period + 1
      where user_id = v_user_id and cadence = v_challenge.cadence;
    end if;
  else
    update public.challenge_participants
    set current_progress = v_new_progress
    where id = v_participant.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'new_progress', v_new_progress,
    'completed', v_completed
  );
end;
$$;

-- Restrict execution to authenticated users (matches fn_pick_challenge convention).
-- The function's own auth.uid() guard returns 'unauthenticated' if reached anonymously,
-- but we revoke PUBLIC explicitly so the function surface isn't exposed to anon.
revoke execute on function public.fn_report_progress(uuid, integer) from public;
grant execute on function public.fn_report_progress(uuid, integer) to authenticated;
