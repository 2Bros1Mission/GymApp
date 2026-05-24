-- ============================================================
-- Issue #129: Leaderboard Tables, Columns & Indexes
-- Creates leaderboard infrastructure, adds columns to profiles
-- and workout_logs, and creates performance indexes.
-- RLS is enabled on new tables; policies are added in Issue #130.
-- Depends on Issue #128 (core challenge tables).
-- ============================================================

-- 1. leaderboard_snapshot — Cached top 100 for fast reads
-- Truncated and rebuilt every 30 min by refresh_leaderboard_snapshot() (Issue #135).
create table if not exists public.leaderboard_snapshot (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles on delete cascade,
  rank integer not null check (rank > 0),
  points integer not null,
  user_name text not null,
  refreshed_at timestamptz not null default now()
);

alter table public.leaderboard_snapshot enable row level security;

-- 2. leaderboard_history — Monthly archives
-- Stores each user's final rank and points at month end.
-- Populated by reset_monthly_challenges() (Issue #134).
-- Retention: 12 months, cleaned up in #134.
create table if not exists public.leaderboard_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles on delete cascade,
  month date not null check (extract(day from month) = 1),
  final_rank integer not null check (final_rank > 0),
  final_points integer not null,
  user_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.leaderboard_history enable row level security;

-- 3. Add leaderboard columns to profiles
-- leaderboard_points: accumulated from platform challenge completions
-- leaderboard_points_updated_at: tiebreaker (earlier update = higher rank)
do $$ begin
  alter table public.profiles
    add column leaderboard_points integer not null default 0;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table public.profiles
    add column leaderboard_points_updated_at timestamptz not null default now();
exception when duplicate_column then null;
end $$;

-- 4. Add gym_date generated column to workout_logs
-- 4AM Sofia day boundary: workouts from 4:00AM today to 3:59AM tomorrow
-- map to today's date. Stored on write; stable because created_at is immutable.
-- Example: 2026-06-15 03:30 Sofia time → gym_date = 2026-06-14
do $$ begin
  alter table public.workout_logs
    add column gym_date date generated always as (
      (date_trunc('day', (created_at at time zone 'Europe/Sofia') - interval '4 hours'))::date
    ) stored;
exception when duplicate_column then null;
end $$;

-- 5. Performance indexes for the challenge system
-- Streak queries on gym_date
create index if not exists idx_workout_logs_gym_date
  on public.workout_logs (user_id, gym_date);

-- Leaderboard ranking
create index if not exists idx_profiles_leaderboard_points
  on public.profiles (leaderboard_points desc, leaderboard_points_updated_at asc);

-- Active challenge lookups (partial index — hot path)
create index if not exists idx_challenge_participants_active
  on public.challenge_participants (user_id, status)
  where status = 'active';

-- Challenge detail / participant list
create index if not exists idx_challenge_participants_challenge
  on public.challenge_participants (challenge_id, status);

-- Period reset queries
create index if not exists idx_challenges_status
  on public.challenges (status, cadence);

-- Discovery state lookups
create index if not exists idx_user_challenge_state
  on public.user_challenge_state (user_id, cadence);
