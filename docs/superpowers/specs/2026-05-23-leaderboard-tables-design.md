# Issue #129 — Leaderboard Tables, Columns & Indexes Design

## Goal

Create the leaderboard infrastructure (snapshot cache + monthly history archive), add required columns to existing `profiles` and `workout_logs` tables, and create all performance indexes for the challenge system. Single idempotent Supabase migration.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Idempotency for ALTER TABLE | DO blocks with EXCEPTION WHEN duplicate_column | Matches project convention from #128; safe on fresh and existing databases |
| `gym_date` source timestamp | `created_at` | Per Aleksandar's issue spec; INSERT time is always available and consistent |
| `leaderboard_snapshot` without `created_at` | Uses `refreshed_at` instead | Table is truncated and rebuilt every 30min; creation time is meaningless |
| RLS policies | Enabled but not created | Deferred to #130, same as #128 |
| Partial index on challenge_participants | WHERE status = 'active' | Hot path — almost all queries filter on active status |

## Tables

### 1. `leaderboard_snapshot` — Cached Top 100

Refreshed every 30 minutes by pg_cron. The entire table is truncated and rebuilt by `refresh_leaderboard_snapshot()` (Issue #135).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL FK -> `profiles` ON DELETE CASCADE |
| `rank` | integer | NOT NULL |
| `points` | integer | NOT NULL |
| `user_name` | text | NOT NULL — denormalized from profiles.name |
| `refreshed_at` | timestamptz | NOT NULL |

RLS: enabled, no policies.

### 2. `leaderboard_history` — Monthly Archives

Stores each user's final rank and points at month end. One row per user per month. Populated by `reset_monthly_challenges()` (Issue #134).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL FK -> `profiles` ON DELETE CASCADE |
| `month` | date | NOT NULL — 1st of the month (e.g., '2026-06-01') |
| `final_rank` | integer | NOT NULL |
| `final_points` | integer | NOT NULL |
| `user_name` | text | NOT NULL — denormalized for display without JOINs |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

- UNIQUE(user_id, month) — one entry per user per month
- Retention: 12 months, cleaned up by `reset_monthly_challenges()` in #134

RLS: enabled, no policies.

## Columns on Existing Tables

### `profiles` — Two new columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `leaderboard_points` | integer | 0 | Accumulated points from platform challenges |
| `leaderboard_points_updated_at` | timestamptz | now() | Tiebreaker — earlier update = higher rank among tied scores |

### `workout_logs` — One generated column

| Column | Type | Expression | Purpose |
|--------|------|------------|---------|
| `gym_date` | date | `GENERATED ALWAYS AS ((date_trunc('day', created_at AT TIME ZONE 'Europe/Sofia' - INTERVAL '4 hours'))::date) STORED` | 4AM Sofia day boundary for streak calculation |

How `gym_date` works:
- Converts `created_at` to Sofia local time
- Subtracts 4 hours (so 4AM becomes midnight)
- Truncates to date
- Result: workouts from 4:00AM today to 3:59AM tomorrow all map to today's date
- Computed once on INSERT, never recalculated
- Indexed for fast streak lookups

## Indexes (6)

| Index | Table | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| `idx_workout_logs_gym_date` | workout_logs | (user_id, gym_date) | Standard | Streak queries |
| `idx_profiles_leaderboard_points` | profiles | (leaderboard_points DESC) | Standard | Leaderboard ranking |
| `idx_challenge_participants_active` | challenge_participants | (user_id, status) WHERE status = 'active' | Partial | Hot path — active challenge lookups |
| `idx_challenge_participants_challenge` | challenge_participants | (challenge_id, status) | Standard | Challenge detail / participant list |
| `idx_challenges_status` | challenges | (status, cadence) | Standard | Period reset queries |
| `idx_user_challenge_state` | user_challenge_state | (user_id, cadence) | Standard | Discovery state lookups |

## What This Migration Does NOT Include

- **RLS policies** — Issue #130
- **`refresh_leaderboard_snapshot()` function** — Issue #135
- **`reset_monthly_challenges()` function** — Issue #134
- **Progress tracking trigger** — Issue #133
- **pg_cron job scheduling** — Issue #135

## Migration Conventions

- File: `supabase/migrations/20260602120000_challenges_leaderboard.sql`
- All statements idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, ALTER wrapped in DO blocks)
- Follows existing project patterns from `supabase/migrations/`
- Depends on #128 (core challenge tables must exist for indexes)
