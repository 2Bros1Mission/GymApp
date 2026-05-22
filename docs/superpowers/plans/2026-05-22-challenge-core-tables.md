# Issue #128 — Core Challenge Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the 5 foundational database tables for the gamification system as a single idempotent Supabase migration.

**Architecture:** A single SQL migration file creates `challenge_templates`, `challenges`, `challenge_participants`, `user_challenge_state`, and `trainer_challenge_templates` with CHECK constraints, cross-column integrity constraints, CASCADE FKs, and RLS enabled (no policies). Tables are created in dependency order so FKs resolve.

**Tech Stack:** PostgreSQL (Supabase), SQL migration

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260601120000_challenges_core_tables.sql` | All 5 tables + constraints + RLS enable |

---

### Task 1: Create the feature branch

**Files:**
- None (git only)

- [ ] **Step 1: Create branch from master**

```bash
git checkout master
git pull origin master
git checkout -b feat/128-challenge-core-tables
```

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: `On branch feat/128-challenge-core-tables`, nothing to commit.

---

### Task 2: Write the migration — challenge_templates table

**Files:**
- Create: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Create the migration file with header and challenge_templates table**

```sql
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
```

- [ ] **Step 2: Verify the file exists and SQL is syntactically valid**

Run from the project root:

```bash
cat supabase/migrations/20260601120000_challenges_core_tables.sql
```

Expected: The SQL above is printed without errors.

---

### Task 3: Add challenges table

**Files:**
- Modify: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Append the challenges table to the migration file**

Add after the `challenge_templates` block:

```sql
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
    check (end_date is null or end_date > start_date)
);

alter table public.challenges enable row level security;
```

---

### Task 4: Add challenge_participants table

**Files:**
- Modify: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Append the challenge_participants table**

Add after the `challenges` block:

```sql
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
```

---

### Task 5: Add user_challenge_state table

**Files:**
- Modify: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Append the user_challenge_state table**

Add after the `challenge_participants` block:

```sql
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
  recent_template_ids uuid[] default '{}',
  unique (user_id, cadence)
);

alter table public.user_challenge_state enable row level security;
```

---

### Task 6: Add trainer_challenge_templates table

**Files:**
- Modify: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Append the trainer_challenge_templates table**

Add after the `user_challenge_state` block:

```sql
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
```

---

### Task 7: Validate the migration runs cleanly

**Files:**
- Read: `supabase/migrations/20260601120000_challenges_core_tables.sql`

- [ ] **Step 1: Verify the complete migration file**

Read the full file and confirm:
1. All 5 tables present in dependency order (challenge_templates → challenges → challenge_participants → user_challenge_state → trainer_challenge_templates)
2. All CHECK constraints use correct enum values
3. All FKs reference correct tables with correct ON DELETE behavior
4. All 5 tables have RLS enabled
5. Cross-column constraints on `challenges` are present (4 constraints)
6. UNIQUE constraints on `challenge_participants(challenge_id, user_id)` and `user_challenge_state(user_id, cadence)` are present
7. No freeze token columns anywhere

- [ ] **Step 2: Run TypeScript compilation to verify no app breakage**

```bash
npx tsc --noEmit
```

Expected: No new errors (migration is SQL-only, shouldn't affect TS).

- [ ] **Step 3: Run ESLint**

```bash
npx eslint . --max-warnings=0
```

Expected: No new errors.

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/20260601120000_challenges_core_tables.sql
git commit -m "feat(db): add 5 core challenge tables (Issue #128)

Create challenge_templates, challenges, challenge_participants,
user_challenge_state, and trainer_challenge_templates with CHECK
constraints, cross-column integrity, CASCADE FKs, and RLS enabled.
No policies (Issue #130). No indexes (Issue #129)."
```

---

### Task 8: Push and open PR

**Files:**
- None (git only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/128-challenge-core-tables
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat(db): add core challenge tables (#128)" \
  --body "$(cat <<'EOF'
## Summary
- Create 5 foundational gamification tables in a single idempotent migration
- `challenge_templates` — platform challenge library (3 difficulties per concept)
- `challenges` — active instances (from template or trainer-created)
- `challenge_participants` — enrollment + cached progress
- `user_challenge_state` — per-cadence discovery/completion tracking
- `trainer_challenge_templates` — saved trainer blocks
- Cross-column CHECK constraints enforce data integrity (trainer=0 points, platform needs template, etc.)
- RLS enabled on all tables (policies in #130, indexes in #129)

## Test plan
- [ ] Migration runs without errors on `supabase db reset`
- [ ] All 5 tables exist with correct column types and defaults
- [ ] CHECK constraints reject invalid enum values
- [ ] Cross-column constraints prevent invalid states (trainer with points, platform without template)
- [ ] UNIQUE constraints prevent duplicate enrollment and duplicate state rows
- [ ] Foreign keys cascade correctly on delete
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint .` — 0 errors

Closes #128

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify CI passes**

```bash
gh pr checks
```

Expected: All checks pass (Supabase Preview, Vercel, CI).
