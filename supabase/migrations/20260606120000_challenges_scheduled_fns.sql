-- ============================================================
-- Issue #134: Reset, Expiry, and Leaderboard Snapshot Functions
--
-- Five SECURITY DEFINER functions that pg_cron will schedule
-- (#135). These are the background jobs that keep the challenge
-- system running:
--
--   reset_daily_challenges()       -- daily 04:00 Sofia
--   reset_weekly_challenges()      -- Monday 04:00 Sofia
--   reset_monthly_challenges()     -- 1st of month 04:00 Sofia
--   complete_expired_challenges()  -- hourly
--   refresh_leaderboard_snapshot() -- every 30 min
--
-- Schema cleanup bundled into this migration:
--   * Drop unused challenge_participants.rank column. The original
--     intent was per-trainer-challenge ranking; per business rule
--     trainer challenges award no rank and no points, so the
--     column is dead schema.
--   * Drop 'paused' from challenge_participants.status CHECK.
--     Real lifecycle is active -> completed | abandoned, never
--     paused. The earlier "resume paused weekly" behavior in the
--     issue spec is dropped accordingly.
--
-- All date math uses Europe/Sofia local time with a 4 AM day
-- boundary (matches the gym_date generated column from #129).
--
-- All reset functions are written so a second invocation within
-- the same period is a no-op (cron retry safety): they only
-- touch state where period_start lags the new period.
--
-- Ranking tiebreakers end with profiles.id to guarantee a
-- deterministic order even when leaderboard_points and
-- leaderboard_points_updated_at collide (notably right after a
-- monthly reset zeros everything in one statement).
--
-- Depends on: #128, #129, #133.
-- Blocks: #135.
-- ============================================================

-- 0. Schema cleanup --------------------------------------------

alter table public.challenge_participants
  drop column if exists rank;

alter table public.challenge_participants
  drop constraint if exists challenge_participants_status_check;

alter table public.challenge_participants
  add constraint challenge_participants_status_check
    check (status in ('active', 'completed', 'abandoned'));


-- 1. reset_daily_challenges() ----------------------------------
-- Zero progress on all active daily participants and reset the
-- per-user daily completion counter.
--
-- Idempotency: guarded against same-day retries via the
-- user_challenge_state.period_start marker. If any daily state
-- row already shows period_start = today, a previous run today
-- already happened and we bail out before zeroing participant
-- progress. This protects against a cron retry or manual
-- re-invocation wiping mid-day in-flight progress.

create or replace function public.reset_daily_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_period date := (
    date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
  )::date;
begin
  if exists (
    select 1 from public.user_challenge_state
    where cadence = 'daily' and period_start >= v_new_period
  ) then
    return;
  end if;

  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'daily' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = v_new_period
  where cadence = 'daily'
    and period_start < v_new_period;
end;
$$;


-- 2. reset_weekly_challenges() ---------------------------------
-- Same as daily, for weekly cadence. Same idempotency guard.

create or replace function public.reset_weekly_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_period date := (
    date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
  )::date;
begin
  if exists (
    select 1 from public.user_challenge_state
    where cadence = 'weekly' and period_start >= v_new_period
  ) then
    return;
  end if;

  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'weekly' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = v_new_period
  where cadence = 'weekly'
    and period_start < v_new_period;
end;
$$;


-- 3. reset_monthly_challenges() --------------------------------
-- Resets monthly cadence AND runs the leaderboard monthly cycle:
--   a) Compute the month being archived (the one that just
--      ended). On 2026-07-01 04:00 Sofia this evaluates to
--      2026-06-01.
--   b) If the archive for that month already exists, return
--      early. This guards the destructive UPDATE on profiles
--      against a cron retry / manual re-run.
--   c) Reset monthly challenge progress and the monthly
--      completion counter (period_start guard same as daily/weekly).
--   d) Archive the standings of the month that just ended.
--      Only users with leaderboard_points > 0 get a row.
--   e) Zero leaderboard_points for all users; refresh the
--      tiebreaker timestamp so the new month starts even.
--   f) Rebuild the leaderboard_snapshot. Doing it in-band keeps
--      the leaderboard from being empty for up to 30 minutes
--      between the monthly reset and the next refresh tick.
--
-- The archive guard relies on at least one user having scored
-- (otherwise the archive INSERT writes zero rows and the guard
-- can't trip on a retry). The day-1 guard above makes this moot
-- in practice: a retry after a zero-score month is harmless
-- because the destructive UPDATEs would be no-ops on already-zero
-- data.

create or replace function public.reset_monthly_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_period date := (
    date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
  )::date;
  v_archive_month date := date_trunc(
    'month',
    ((now() at time zone 'Europe/Sofia')::date - interval '1 day')
  )::date;
begin
  -- Safety guard: this function MUST only run on the 1st of
  -- the month. A manual mid-month invocation would archive the
  -- running month's mid-period standings as "final" and zero
  -- everyone's points, destroying real data. The cron in #135
  -- only fires on day 1, but defense-in-depth against manual /
  -- ad-hoc calls (the function is `security definer` and
  -- callable by any role with EXECUTE).
  if extract(day from (now() at time zone 'Europe/Sofia')::date) <> 1 then
    raise exception 'reset_monthly_challenges may only run on the 1st of the month (today Sofia: %)',
      (now() at time zone 'Europe/Sofia')::date;
  end if;

  -- Idempotency guard: if the previous month's archive already
  -- exists, the monthly cycle has already run for this period.
  -- Bail out before touching destructive state.
  if exists (
    select 1 from public.leaderboard_history where month = v_archive_month
  ) then
    return;
  end if;

  -- Reset monthly challenge progress + counter.
  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'monthly' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = v_new_period
  where cadence = 'monthly'
    and period_start < v_new_period;

  -- Archive standings for users who actually scored.
  -- user_name is captured at archive time (immutable history).
  insert into public.leaderboard_history (user_id, month, final_rank, final_points, user_name)
  select
    p.id,
    v_archive_month,
    row_number() over (
      order by p.leaderboard_points desc,
               p.leaderboard_points_updated_at asc,
               p.name asc,
               p.id asc
    ),
    p.leaderboard_points,
    p.name
  from public.profiles p
  where p.leaderboard_points > 0;

  -- Zero everyone's points and refresh the tiebreaker timestamp.
  update public.profiles
  set leaderboard_points = 0,
      leaderboard_points_updated_at = now();

  -- Rebuild the snapshot in-band so readers see the fresh
  -- (empty-because-everyone-is-zero) leaderboard immediately.
  perform public.refresh_leaderboard_snapshot();
end;
$$;


-- 4. complete_expired_challenges() -----------------------------
-- Finalize trainer challenges past their end_date. Platform
-- challenges don't expire. No rank assignment per business rule
-- (trainer challenges have no rank).
--
-- Date comparison uses Sofia local date (consistent with the
-- rest of the system); using server-TZ current_date here would
-- create a 1-3 hour expiry lag depending on host timezone.

create or replace function public.complete_expired_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
begin
  update public.challenge_participants
  set status = 'abandoned'
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where source = 'trainer'
        and status = 'active'
        and end_date is not null
        and end_date < v_today
    );

  update public.challenges
  set status = 'completed'
  where source = 'trainer'
    and status = 'active'
    and end_date is not null
    and end_date < v_today;
end;
$$;


-- 5. refresh_leaderboard_snapshot() ----------------------------
-- Rebuild the top-100 cache. Truncate-and-insert is fine because
-- the snapshot is purely derived state. TRUNCATE takes
-- ACCESS EXCLUSIVE which blocks readers until commit, so the
-- table is never observed empty by concurrent readers.
--
-- Tiebreaker chain ends with profiles.id for deterministic
-- ordering when points / updated_at / name all collide.

create or replace function public.refresh_leaderboard_snapshot()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  truncate public.leaderboard_snapshot;

  insert into public.leaderboard_snapshot (user_id, rank, points, user_name, refreshed_at)
  select
    p.id,
    row_number() over (
      order by p.leaderboard_points desc,
               p.leaderboard_points_updated_at asc,
               p.name asc,
               p.id asc
    ),
    p.leaderboard_points,
    p.name,
    now()
  from public.profiles p
  where p.leaderboard_points > 0
  order by p.leaderboard_points desc,
           p.leaderboard_points_updated_at asc,
           p.name asc,
           p.id asc
  limit 100;
end;
$$;
