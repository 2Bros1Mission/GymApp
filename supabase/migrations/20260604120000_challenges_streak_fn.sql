-- ============================================================
-- Issue #132: Streak Calculation Function
-- Implements calculate_streak(p_user_id, p_challenge_id) using
-- gaps-and-islands algorithm on workout_logs.gym_date.
-- Called by the progress tracking trigger (#133) for streak challenges.
-- ============================================================

create or replace function public.calculate_streak(p_user_id uuid, p_challenge_id uuid)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_streak integer := 0;
  v_start_date date;
  v_today date;
begin
  select start_date into v_start_date
  from public.challenges where id = p_challenge_id;

  -- Today's gym_date (4AM Europe/Sofia boundary)
  v_today := (date_trunc('day', now() at time zone 'Europe/Sofia' - interval '4 hours'))::date;

  -- Gaps-and-islands: count consecutive days backwards from today
  with daily_workouts as (
    select distinct gym_date
    from public.workout_logs
    where user_id = p_user_id
      and gym_date >= v_start_date
      and gym_date <= v_today
  ),
  numbered as (
    select gym_date,
           gym_date - (row_number() over (order by gym_date desc))::int as island
    from daily_workouts
  )
  select count(*)::integer into v_streak
  from numbered
  where island = (
    select island from numbered where gym_date = v_today
  );

  -- If no workout today, streak is 0 (broken)
  if not exists (
    select 1 from public.workout_logs
    where user_id = p_user_id and gym_date = v_today
  ) then
    v_streak := 0;
  end if;

  return v_streak;
end;
$$;
