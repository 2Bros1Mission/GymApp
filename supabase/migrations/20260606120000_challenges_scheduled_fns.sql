-- ============================================================
-- Issue #134: Reset, Expiry, and Leaderboard Snapshot Functions
--
-- Five SECURITY DEFINER functions that pg_cron will schedule
-- (#135). These are the background jobs that keep the challenge
-- system running:
--
--   reset_daily_challenges()       -- daily 4:00 AM Sofia
--   reset_weekly_challenges()      -- Monday 4:00 AM Sofia
--   reset_monthly_challenges()     -- 1st of month 4:00 AM Sofia
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
-- per-user daily completion counter. period_start advances to the
-- new gym_date (4 AM Sofia boundary).

create or replace function public.reset_daily_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'daily' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = (
        date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
      )::date
  where cadence = 'daily';
end;
$$;


-- 2. reset_weekly_challenges() ---------------------------------
-- Same as daily, for weekly cadence. No paused -> active flip
-- (per business rule: paused is not a real lifecycle state).

create or replace function public.reset_weekly_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'weekly' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = (
        date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
      )::date
  where cadence = 'weekly';
end;
$$;


-- 3. reset_monthly_challenges() --------------------------------
-- Resets monthly cadence AND runs the leaderboard monthly cycle:
--   a) Archive the standings of the month that just ended into
--      leaderboard_history. The archive row's `month` column
--      reflects the previous month (e.g. cron fires 2026-07-01
--      4:00 AM Sofia -> archive labeled 2026-06-01).
--   b) Zero leaderboard_points for all users.
--   c) Truncate leaderboard_snapshot.
-- Only users with leaderboard_points > 0 are archived; users
-- who didn't score in the month leave no history row.

create or replace function public.reset_monthly_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_archive_month date;
begin
  -- a) Reset monthly challenge progress + counters.
  update public.challenge_participants
  set current_progress = 0
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where cadence = 'monthly' and status = 'active'
    );

  update public.user_challenge_state
  set completions_this_period = 0,
      period_start = (
        date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours')
      )::date
  where cadence = 'monthly';

  -- b) Compute the month being archived: previous month's first day,
  -- in Sofia time. On 2026-07-01 04:00 Sofia this evaluates to 2026-06-01.
  v_archive_month := date_trunc(
    'month',
    ((now() at time zone 'Europe/Sofia')::date - interval '1 day')
  )::date;

  -- c) Archive standings for users who actually scored.
  -- ON CONFLICT guard: re-running the same monthly reset is a no-op.
  insert into public.leaderboard_history (user_id, month, final_rank, final_points, user_name)
  select
    p.id,
    v_archive_month,
    row_number() over (
      order by p.leaderboard_points desc,
               p.leaderboard_points_updated_at asc,
               p.name asc
    ),
    p.leaderboard_points,
    p.name
  from public.profiles p
  where p.leaderboard_points > 0
  on conflict (user_id, month) do nothing;

  -- d) Zero everyone's points and refresh the tiebreaker timestamp
  -- so the next month starts on equal footing.
  update public.profiles
  set leaderboard_points = 0,
      leaderboard_points_updated_at = now();

  -- e) Clear the snapshot. refresh_leaderboard_snapshot() will
  -- rebuild it on its next cron tick.
  truncate public.leaderboard_snapshot;
end;
$$;


-- 4. complete_expired_challenges() -----------------------------
-- Finalize trainer challenges past their end_date. Platform
-- challenges don't expire (no end_date enforcement). No rank
-- assignment per business rule (trainer challenges have no rank).

create or replace function public.complete_expired_challenges()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Mark still-active participants of expired trainer challenges
  -- as abandoned. Already-completed participants keep their
  -- completed_at / status as recorded by the progress trigger.
  update public.challenge_participants
  set status = 'abandoned'
  where status = 'active'
    and challenge_id in (
      select id from public.challenges
      where source = 'trainer'
        and status = 'active'
        and end_date is not null
        and end_date < current_date
    );

  -- Close out the challenges themselves.
  update public.challenges
  set status = 'completed'
  where source = 'trainer'
    and status = 'active'
    and end_date is not null
    and end_date < current_date;
end;
$$;


-- 5. refresh_leaderboard_snapshot() ----------------------------
-- Rebuild the top-100 cache. Truncate-and-insert is fine here
-- because the snapshot is purely derived state.

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
               p.name asc
    ),
    p.leaderboard_points,
    p.name,
    now()
  from public.profiles p
  where p.leaderboard_points > 0
  order by p.leaderboard_points desc,
           p.leaderboard_points_updated_at asc,
           p.name asc
  limit 100;
end;
$$;
