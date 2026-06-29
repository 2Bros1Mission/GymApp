-- ============================================================
-- Issue #137 follow-up: fn_report_progress hardening
--
-- Two fixes addressing PR #160 security review:
--
-- S1: Three-valued-logic bypass. `p_value <= 0 or p_value > 100000`
-- evaluates to NULL when p_value is NULL (e.g. client sent JSON null
-- because JSON.stringify(NaN)==='null' per ECMA-262 §25.5.2), and
-- `if NULL then` is treated as false → guard skipped, lock taken,
-- and the failed UPDATE surfaces as opaque 'unknown' to the client.
-- Add an explicit `is null` arm.
--
-- S2: Integer overflow. `current_progress + p_value` is plain integer
-- addition; with target_value up to INT_MAX (no upper CHECK), high
-- current_progress can overflow before least() clamps. Cast the
-- addition to bigint and let least() clamp back down — target_value
-- is still integer so the clamped result fits in the column.
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

  -- S1: explicit NULL check. Without `is null`, a NULL p_value (sent as
  -- JSON null by clients passing NaN/Infinity/undefined) bypasses the
  -- numeric guards via three-valued logic and is only caught by the
  -- current_progress NOT NULL column constraint downstream — too late.
  -- Upper bound (100000) guards downstream integer math; an order of
  -- magnitude above any realistic per-call target value.
  if p_value is null or p_value <= 0 or p_value > 100000 then
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

  -- Defensive: FK with on-delete-cascade should make this unreachable, but
  -- without this guard a missing row produces NULL fields that fall through
  -- the type check (NULL != 'custom_self_reported' is NULL, which is falsy)
  -- and the function would silently update with NULL values.
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_challenge.challenge_type != 'custom_self_reported' then
    return jsonb_build_object('ok', false, 'error', 'not_self_reported');
  end if;

  -- S2: cast to bigint inside the addition to avoid integer-overflow on
  -- `current_progress + p_value` when current_progress is near INT_MAX
  -- (possible because the column has no upper CHECK and target_value can
  -- be up to INT_MAX). least() clamps back to target_value, which is
  -- itself an integer, so the result still fits in the column.
  v_new_progress := least(
    (v_participant.current_progress::bigint + p_value),
    v_participant.target_value::bigint
  )::integer;
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

-- Re-assert the privilege grants. `create or replace` preserves prior
-- grants but stating them explicitly survives any future signature change.
revoke execute on function public.fn_report_progress(uuid, integer) from public;
grant execute on function public.fn_report_progress(uuid, integer) to authenticated;
