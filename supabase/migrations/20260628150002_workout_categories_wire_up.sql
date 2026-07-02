-- Issue #148 follow-up: wire the workout_logs.category column into the
-- write path and the challenge progress trigger, closing the "column
-- present but unreachable" gap surfaced during PR #164 review.
--
--   [F1a] save_workout(): add p_category text default null. Backwards
--         compatible — existing callers that don't pass p_category get
--         NULL category, matching current behavior. The BEFORE INSERT
--         trigger from 20260628150001 normalizes case/whitespace, and
--         the CHECK constraint from 20260628150000 validates the value.
--
--   [F1b] fn_workout_log_challenge_progress(): replace the "skip when
--         category is set" placeholder (comment at
--         20260605120000_challenges_progress_trigger.sql:92-96 explicitly
--         calls out #148 as the follow-up) with the real filter:
--
--             if v_participant.category is not null
--                and new.category is distinct from v_participant.category then
--               continue;
--             end if;
--
--         `is distinct from` handles NULL correctly on both sides:
--         - workout has category 'strength', challenge wants 'strength' → match
--         - workout has category NULL,       challenge wants 'strength' → skip
--         - workout has category 'cardio',   challenge wants 'strength' → skip
--         - challenge has no category filter (category IS NULL)         → pass through
--         The outer `v_participant.category is not null` guard preserves
--         behavior for uncategorized challenges (they still match every
--         workout regardless of category), consistent with the semantics
--         suggested by the original placeholder comment.
--
-- Both objects are `create or replace`, so this migration is idempotent
-- by construction.

-- ─── [F1a] save_workout with p_category ────────────────────────────────

create or replace function public.save_workout(
  p_user_id uuid,
  p_workout_id text,
  p_workout_name text,
  p_duration_seconds integer,
  p_notes text default null,
  p_exercises jsonb default '[]'::jsonb,
  p_category text default null
)
returns uuid as $$
declare
  v_workout_log_id uuid;
  v_exercise_log_id uuid;
  v_exercise jsonb;
  v_set jsonb;
begin
  insert into public.workout_logs (
    user_id, workout_id, workout_name, duration_seconds, completed, end_time, notes, category
  ) values (
    p_user_id, p_workout_id, p_workout_name, p_duration_seconds, true, now(), p_notes, p_category
  )
  returning id into v_workout_log_id;

  for v_exercise in select * from jsonb_array_elements(p_exercises)
  loop
    insert into public.exercise_logs (
      workout_log_id, exercise_id, exercise_name, order_index
    ) values (
      v_workout_log_id,
      v_exercise->>'exerciseId',
      v_exercise->>'exerciseName',
      (v_exercise->>'orderIndex')::integer
    )
    returning id into v_exercise_log_id;

    for v_set in select * from jsonb_array_elements(v_exercise->'sets')
    loop
      insert into public.set_logs (
        exercise_log_id, set_number, weight, reps, completed
      ) values (
        v_exercise_log_id,
        (v_set->>'setNumber')::integer,
        (v_set->>'weight')::real,
        (v_set->>'reps')::integer,
        (v_set->>'completed')::boolean
      );
    end loop;
  end loop;

  return v_workout_log_id;
end;
$$ language plpgsql security definer;

-- ─── [F1b] progress trigger — real category filter ─────────────────────

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

      if v_completions is not null and v_completions >= v_max_completions then
        continue;
      end if;
    end if;

    -- Category filter: match this workout's category against the
    -- challenge's category filter (issue #148). Uses IS DISTINCT FROM so
    -- a NULL workout category never matches a categorized challenge, and
    -- an uncategorized challenge (v_participant.category IS NULL) still
    -- matches every workout. Replaces the pre-#148 placeholder that
    -- skipped every categorized challenge unconditionally.
    if v_participant.category is not null
       and new.category is distinct from v_participant.category then
      continue;
    end if;

    if v_participant.challenge_type in ('frequency', 'custom_auto') then
      v_new_progress := v_participant.current_progress + 1;
    elsif v_participant.challenge_type = 'streak' then
      v_new_progress := public.calculate_streak(
        new.user_id, v_participant.challenge_id
      );
    else
      continue;
    end if;

    update public.challenge_participants
    set current_progress = v_new_progress,
        longest_streak   = greatest(longest_streak, v_new_progress)
    where id = v_participant.participant_id;

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
