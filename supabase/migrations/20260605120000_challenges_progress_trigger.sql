-- ============================================================
-- Issue #133: Progress Tracking Trigger
-- AFTER INSERT trigger on workout_logs that updates active
-- challenge participant progress, recalculates streaks, marks
-- completions, and (for platform challenges only) increments
-- per-cadence completion counts and awards leaderboard points.
--
-- Depends on: #128 (tables), #129 (gym_date column, leaderboard
-- columns on profiles), #132 (calculate_streak function).
-- Blocks: #134 (resets reuse the same state tables).
--
-- Notes on deviations from the issue spec:
-- * SECURITY DEFINER + locked search_path: required because the
--   trigger writes to tables the inserting user has no UPDATE
--   right on per #130 RLS.
-- * Source pulled from the JOIN instead of re-queried.
-- * completions_this_period and points side-effects gated on
--   source = 'platform' (the freeze concept and points are
--   platform-discovery-only; trainer challenges have points = 0
--   by the challenges_trainer_zero_points constraint anyway).
-- * Category filter currently skips categorized challenges
--   because workout_logs.category does not exist yet (#148).
--   When #148 lands, replace the skip with a real
--   IS DISTINCT FROM match against NEW.category.
-- * FOR UPDATE OF cp on the cursor + completed_at IS NULL on
--   the completion UPDATE: defends against concurrent workout
--   inserts double-incrementing points / completions counters.
--   The row lock serializes per-participant updates; the
--   live completed_at re-check ensures side-effects fire once.
-- ============================================================

create or replace function public.fn_workout_log_challenge_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant record;
  v_new_progress integer;
  v_completions integer;
  v_max_completions integer;
begin
  -- Iterate over the user's active challenge participations.
  -- The JOIN pulls challenge metadata so we don't re-query
  -- challenges inside the loop. FOR UPDATE OF cp serializes
  -- concurrent workout-insert triggers for the same participant,
  -- so two simultaneous inserts can't both pass the completion
  -- check and double-credit points / completions_this_period.
  for v_participant in
    select
      cp.id              as participant_id,
      cp.challenge_id,
      cp.current_progress,
      cp.longest_streak,
      cp.target_value,
      c.challenge_type,
      c.cadence,
      c.category,
      c.source,
      c.points
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = new.user_id
      and cp.status = 'active'
    for update of cp
  loop
    -- Freeze check: platform challenges only. Trainer challenges
    -- and 'one_time' cadence are not part of discovery freeze, so
    -- they bypass this branch entirely.
    if v_participant.source = 'platform'
       and v_participant.cadence in ('daily', 'weekly', 'monthly') then

      v_max_completions := case v_participant.cadence
        when 'daily'   then 1
        when 'weekly'  then 5
        when 'monthly' then 10
      end;

      select completions_this_period
      into v_completions
      from public.user_challenge_state
      where user_id = new.user_id
        and cadence = v_participant.cadence;

      -- Missing state row → treat as 0 (not frozen).
      if v_completions is not null and v_completions >= v_max_completions then
        continue;
      end if;
    end if;

    -- Category filter: skip until #148 adds workout_logs.category.
    -- Future: if new.category is distinct from v_participant.category then continue; end if;
    if v_participant.category is not null then
      continue;
    end if;

    -- Compute new progress based on challenge type.
    if v_participant.challenge_type in ('frequency', 'custom_auto') then
      v_new_progress := v_participant.current_progress + 1;
    elsif v_participant.challenge_type = 'streak' then
      v_new_progress := public.calculate_streak(
        new.user_id, v_participant.challenge_id
      );
    else
      -- 'custom_self_reported' is updated by the service layer (#137).
      continue;
    end if;

    -- Persist progress and longest-streak high-water mark.
    update public.challenge_participants
    set current_progress = v_new_progress,
        longest_streak   = greatest(longest_streak, v_new_progress)
    where id = v_participant.participant_id;

    -- Completion. Re-checking completed_at IS NULL on the UPDATE
    -- itself (rather than reading the cursor snapshot) ensures
    -- the completion side-effects fire exactly once even when
    -- concurrent triggers race past the FOR UPDATE serialization.
    -- FOUND tells us whether the UPDATE actually flipped the row.
    if v_new_progress >= v_participant.target_value then

      update public.challenge_participants
      set completed_at = now(),
          status       = 'completed'
      where id = v_participant.participant_id
        and completed_at is null;

      if found and v_participant.source = 'platform' then
        update public.user_challenge_state
        set completions_this_period = completions_this_period + 1
        where user_id = new.user_id
          and cadence = v_participant.cadence;

        update public.profiles
        set leaderboard_points            = leaderboard_points + v_participant.points,
            leaderboard_points_updated_at = now()
        where id = new.user_id;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

-- CREATE OR REPLACE TRIGGER (Postgres 14+, idempotent without
-- a separate DROP TRIGGER IF EXISTS).
create or replace trigger trg_workout_log_challenge_progress
  after insert on public.workout_logs
  for each row
  execute function public.fn_workout_log_challenge_progress();
