# Issue #129 — Leaderboard Tables & Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the leaderboard infrastructure (2 tables, 3 columns on existing tables, 6 indexes) as a single idempotent Supabase migration.

**Architecture:** A single SQL migration file creates `leaderboard_snapshot` and `leaderboard_history`, adds `leaderboard_points` and `leaderboard_points_updated_at` to `profiles`, adds a `gym_date` generated column to `workout_logs`, and creates 6 performance indexes across the challenge system tables. All statements are idempotent.

**Tech Stack:** PostgreSQL (Supabase), SQL migration

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260602120000_challenges_leaderboard.sql` | 2 tables + 3 columns on existing tables + 6 indexes + RLS enable |

---

### Task 1: Create the feature branch

**Files:**
- None (git only)

- [ ] **Step 1: Create branch from master**

```bash
git checkout master
git pull origin master
git checkout -b feat/129-leaderboard-tables
```

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: `On branch feat/129-leaderboard-tables`, nothing to commit.

---

### Task 2: Write the migration — leaderboard_snapshot table

**Files:**
- Create: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Create the migration file with header and leaderboard_snapshot table**

```sql
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
  rank integer not null,
  points integer not null,
  user_name text not null,
  refreshed_at timestamptz not null
);

alter table public.leaderboard_snapshot enable row level security;
```

- [ ] **Step 2: Verify the file exists**

```bash
cat supabase/migrations/20260602120000_challenges_leaderboard.sql
```

Expected: The SQL above is printed without errors.

---

### Task 3: Add leaderboard_history table

**Files:**
- Modify: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Append the leaderboard_history table to the migration file**

Add after the `leaderboard_snapshot` block:

```sql
-- 2. leaderboard_history — Monthly archives
-- Stores each user's final rank and points at month end.
-- Populated by reset_monthly_challenges() (Issue #134).
-- Retention: 12 months, cleaned up in #134.
create table if not exists public.leaderboard_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles on delete cascade,
  month date not null,
  final_rank integer not null,
  final_points integer not null,
  user_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.leaderboard_history enable row level security;
```

---

### Task 4: Add columns to profiles

**Files:**
- Modify: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Append the profiles ALTER TABLE statements**

Add after the `leaderboard_history` block:

```sql
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
```

---

### Task 5: Add gym_date generated column to workout_logs

**Files:**
- Modify: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Append the workout_logs ALTER TABLE statement**

Add after the profiles block:

```sql
-- 4. Add gym_date generated column to workout_logs
-- 4AM Sofia day boundary: workouts from 4:00AM today to 3:59AM tomorrow
-- map to today's date. Computed once on INSERT, never recalculated.
-- Example: 2026-06-15 03:30 Sofia time → gym_date = 2026-06-14
do $$ begin
  alter table public.workout_logs
    add column gym_date date generated always as (
      (date_trunc('day', created_at at time zone 'Europe/Sofia' - interval '4 hours'))::date
    ) stored;
exception when duplicate_column then null;
end $$;
```

---

### Task 6: Create all performance indexes

**Files:**
- Modify: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Append the 6 index statements**

Add after the workout_logs block:

```sql
-- 5. Performance indexes for the challenge system
-- Streak queries on gym_date
create index if not exists idx_workout_logs_gym_date
  on public.workout_logs (user_id, gym_date);

-- Leaderboard ranking
create index if not exists idx_profiles_leaderboard_points
  on public.profiles (leaderboard_points desc);

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
```

---

### Task 7: Validate the migration

**Files:**
- Read: `supabase/migrations/20260602120000_challenges_leaderboard.sql`

- [ ] **Step 1: Verify the complete migration file**

Read the full file and confirm:
1. Both tables present (`leaderboard_snapshot`, `leaderboard_history`)
2. Both tables have RLS enabled
3. UNIQUE constraint on `leaderboard_history(user_id, month)`
4. Three ALTER TABLE statements (2 for profiles, 1 for workout_logs) wrapped in DO blocks
5. `gym_date` generated column uses correct formula with `created_at`
6. All 6 indexes present with correct column lists
7. Partial index on `challenge_participants` has `WHERE status = 'active'`
8. All statements idempotent (`IF NOT EXISTS`, `EXCEPTION WHEN duplicate_column`)
9. FK references use `public.profiles on delete cascade` (matching schema.sql convention)

- [ ] **Step 2: Run TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No new errors (migration is SQL-only).

- [ ] **Step 3: Run ESLint**

```bash
npx eslint . --max-warnings=0
```

Expected: No new errors.

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/20260602120000_challenges_leaderboard.sql
git commit -m "feat(db): add leaderboard tables, columns and indexes (Issue #129)

Create leaderboard_snapshot and leaderboard_history tables, add
leaderboard_points and leaderboard_points_updated_at to profiles,
add gym_date generated column to workout_logs (4AM Sofia boundary),
and create 6 performance indexes across the challenge system.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Push and open PR

**Files:**
- None (git only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/129-leaderboard-tables
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat(db): add leaderboard tables and indexes (#129)" \
  --body "$(cat <<'EOF'
## Summary
- Create `leaderboard_snapshot` table (cached top 100, refreshed by pg_cron)
- Create `leaderboard_history` table (monthly archives with UNIQUE(user_id, month))
- Add `leaderboard_points` and `leaderboard_points_updated_at` columns to `profiles`
- Add `gym_date` generated column to `workout_logs` (4AM Sofia day boundary)
- Create 6 performance indexes including partial index on active challenge participants
- All statements idempotent; RLS enabled on new tables (policies in #130)

## Test plan
- [ ] Migration runs without errors after #128 migration
- [ ] `leaderboard_snapshot` and `leaderboard_history` tables exist with correct types
- [ ] `profiles.leaderboard_points` defaults to 0 for existing and new rows
- [ ] `workout_logs.gym_date` is automatically computed on INSERT
- [ ] 4AM boundary: workout at 03:30 Sofia time → gym_date = previous day
- [ ] 4AM boundary: workout at 04:30 Sofia time → gym_date = current day
- [ ] All 6 indexes created
- [ ] `leaderboard_history` UNIQUE(user_id, month) prevents duplicate entries
- [ ] Partial index on challenge_participants filters on status = 'active'
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint .` — 0 new errors

Closes #129

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify CI passes**

```bash
gh pr checks
```

Expected: All checks pass (Supabase Preview, Vercel, CI).
