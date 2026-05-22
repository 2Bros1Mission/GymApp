-- ============================================================
-- Issue #128: Core Challenge Tables
-- Creates the 5 foundational tables for the gamification system.
-- RLS is enabled on all tables; policies are added in Issue #130.
-- Indexes are added in Issue #129.
-- ============================================================

-- 1. challenge_templates — Platform challenge library
-- Each concept has 3 difficulty variants grouped by template_group.
create table if not exists public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_bg text,
  description text,
  description_bg text,
  challenge_type text not null check (challenge_type in ('frequency', 'streak', 'custom_auto', 'custom_self_reported')),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  target_value integer not null check (target_value > 0),
  points integer not null check (points >= 0),
  category text,
  template_group text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.challenge_templates enable row level security;

-- 2. challenges — Active challenge instances
-- Created from a platform template (discovery pick) or by a trainer.
-- Display data is denormalized from the template so template edits
-- don't affect active challenges.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.challenge_templates(id) on delete set null,
  creator_id uuid references public.profiles(id) on delete cascade,
  source text not null check (source in ('platform', 'trainer')),
  title text not null,
  title_bg text,
  description text,
  description_bg text,
  challenge_type text not null check (challenge_type in ('frequency', 'streak', 'custom_auto', 'custom_self_reported')),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly', 'one_time')),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  target_value integer not null check (target_value > 0),
  points integer not null default 0 check (points >= 0),
  category text,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  created_at timestamptz not null default now(),

  -- Cross-column integrity constraints
  constraint challenges_platform_needs_template
    check (source = 'trainer' or template_id is not null),
  constraint challenges_trainer_needs_creator
    check (source = 'platform' or creator_id is not null),
  constraint challenges_trainer_zero_points
    check (source = 'platform' or points = 0),
  constraint challenges_date_sanity
    check (end_date is null or end_date > start_date),
  constraint challenges_one_time_trainer_only
    check (cadence != 'one_time' or source = 'trainer')
);

alter table public.challenges enable row level security;

-- 3. challenge_participants — Enrollment + cached progress
-- One row per user per challenge. Progress is cached here and
-- updated by the workout_logs trigger (Issue #133).
create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  current_progress integer not null default 0,
  longest_streak integer not null default 0,
  target_value integer not null,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'abandoned')),
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  rank integer,
  source text not null check (source in ('discovery', 'trainer_assigned')),
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

alter table public.challenge_participants enable row level security;

-- 4. user_challenge_state — Discovery/completion tracking per user per cadence
-- Tracks completions this period, cooldown timer, and recent picks
-- for anti-repetition. No 'one_time' cadence — trainer challenges
-- don't participate in discovery.
create table if not exists public.user_challenge_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  completions_this_period integer not null default 0,
  period_start date not null,
  last_pick_at timestamptz,
  recent_template_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, cadence)
);

alter table public.user_challenge_state enable row level security;

-- 5. trainer_challenge_templates — Saved trainer blocks
-- Trainers save block configurations for reuse. Separate from
-- challenge_templates because trainer blocks have different columns
-- (no difficulty, no points, no template_group).
-- 'custom' here maps to 'custom_self_reported' when instantiated
-- as a challenges row.
create table if not exists public.trainer_challenge_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  challenge_type text not null check (challenge_type in ('frequency', 'streak', 'custom')),
  target_value integer not null check (target_value > 0),
  category text,
  description text,
  created_at timestamptz not null default now()
);

alter table public.trainer_challenge_templates enable row level security;
