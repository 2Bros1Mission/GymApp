# Issue #128 — Core Challenge Database Tables Design

## Goal

Create the 5 foundational database tables for the gamification system as a single Supabase migration. These tables store platform challenge templates, active challenge instances, participant progress, user discovery state, and trainer saved blocks.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Freeze tokens | Not included | Design doc explicitly excludes them: "Streak freeze / skip day — Not implementing" |
| Trainer cadence | `one_time` (4th value) | Reset functions filter by cadence; `one_time` naturally excludes trainer challenges without special-casing |
| Trainer challenge_type | 3 values (`frequency`, `streak`, `custom`) | Trainers can't create `custom_auto`; `custom` always maps to `custom_self_reported` when instantiated |
| Cross-column constraints | Yes, at DB level | Prevents invalid states (e.g., trainer challenge with points > 0, platform challenge without template_id) |
| Branch strategy | Fresh from `master` | Old PR #124 has incompatible schema from the previous design |
| RLS policies | Enabled but not created | Policies are a separate issue (#130) |

## Tables

### 1. `challenge_templates` — Platform Challenge Library

Pre-designed challenge concepts. Each concept generates 3 difficulty variants grouped by `template_group`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `title_bg` | text | nullable |
| `description` | text | nullable |
| `description_bg` | text | nullable |
| `challenge_type` | text | NOT NULL, CHECK IN (`frequency`, `streak`, `custom_auto`, `custom_self_reported`) |
| `cadence` | text | NOT NULL, CHECK IN (`daily`, `weekly`, `monthly`) |
| `difficulty` | text | NOT NULL, CHECK IN (`easy`, `medium`, `hard`) |
| `target_value` | integer | NOT NULL, CHECK > 0 |
| `points` | integer | NOT NULL, CHECK >= 0 |
| `category` | text | nullable — workout category filter |
| `template_group` | text | NOT NULL — groups 3 difficulty variants together |
| `active` | boolean | NOT NULL, DEFAULT true |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

RLS: enabled, no policies.

### 2. `challenges` — Active Challenge Instances

Created from a platform template (via discovery pick) or by a trainer. Carries all display data denormalized from the template so template edits don't affect active challenges.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `template_id` | uuid | nullable FK -> `challenge_templates` ON DELETE SET NULL |
| `creator_id` | uuid | nullable FK -> `profiles` ON DELETE CASCADE |
| `source` | text | NOT NULL, CHECK IN (`platform`, `trainer`) |
| `title` | text | NOT NULL |
| `title_bg` | text | nullable |
| `description` | text | nullable |
| `description_bg` | text | nullable |
| `challenge_type` | text | NOT NULL, CHECK IN (`frequency`, `streak`, `custom_auto`, `custom_self_reported`) |
| `cadence` | text | NOT NULL, CHECK IN (`daily`, `weekly`, `monthly`, `one_time`) |
| `difficulty` | text | nullable, CHECK IN (`easy`, `medium`, `hard`) |
| `target_value` | integer | NOT NULL, CHECK > 0 |
| `points` | integer | NOT NULL, DEFAULT 0, CHECK >= 0 |
| `category` | text | nullable |
| `start_date` | date | NOT NULL |
| `end_date` | date | nullable (platform challenges don't expire) |
| `status` | text | NOT NULL, DEFAULT `active`, CHECK IN (`active`, `completed`, `expired`) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

Cross-column constraints:
- `CHECK (source = 'trainer' OR template_id IS NOT NULL)` — platform challenges must reference a template
- `CHECK (source = 'platform' OR creator_id IS NOT NULL)` — trainer challenges must have a creator
- `CHECK (source = 'platform' OR points = 0)` — trainer challenges award zero points
- `CHECK (end_date IS NULL OR end_date > start_date)` — date sanity

FK behavior:
- `template_id` uses `ON DELETE SET NULL` — if a template is deactivated/deleted, the active challenge persists
- `creator_id` uses `ON DELETE CASCADE` — if a trainer is deleted, their challenges are removed

RLS: enabled, no policies.

### 3. `challenge_participants` — Enrollment + Progress

One row per user per challenge. Progress is cached here and updated by the progress-tracking trigger (#133).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `challenge_id` | uuid | NOT NULL FK -> `challenges` ON DELETE CASCADE |
| `user_id` | uuid | NOT NULL FK -> `profiles` ON DELETE CASCADE |
| `current_progress` | integer | NOT NULL, DEFAULT 0 |
| `longest_streak` | integer | NOT NULL, DEFAULT 0 |
| `target_value` | integer | NOT NULL — copied from challenge, allows per-client customization |
| `status` | text | NOT NULL, DEFAULT `active`, CHECK IN (`active`, `completed`, `paused`, `abandoned`) |
| `joined_at` | timestamptz | NOT NULL, DEFAULT now() |
| `completed_at` | timestamptz | nullable — set when current_progress >= target_value |
| `rank` | integer | nullable — set on challenge completion |
| `source` | text | NOT NULL, CHECK IN (`discovery`, `trainer_assigned`) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

- UNIQUE(challenge_id, user_id) — prevents duplicate enrollment

RLS: enabled, no policies.

### 4. `user_challenge_state` — Discovery/Completion Tracking

Per-user per-cadence state. Tracks how many challenges the user has completed this period, when they last picked (for 1h cooldown), and recent picks (for anti-repetition).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL FK -> `profiles` ON DELETE CASCADE |
| `cadence` | text | NOT NULL, CHECK IN (`daily`, `weekly`, `monthly`) |
| `completions_this_period` | integer | NOT NULL, DEFAULT 0 |
| `period_start` | date | NOT NULL |
| `last_pick_at` | timestamptz | nullable |
| `recent_template_ids` | uuid[] | DEFAULT '{}' — last 10 picked template IDs for anti-repetition |

- UNIQUE(user_id, cadence) — one state row per user per cadence
- No `one_time` cadence — trainer challenges don't participate in discovery

RLS: enabled, no policies.

### 5. `trainer_challenge_templates` — Saved Trainer Blocks

Trainers save block configurations for reuse. Separate from `challenge_templates` because trainer blocks have different columns (no difficulty, no points, no template_group).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `trainer_id` | uuid | NOT NULL FK -> `profiles` ON DELETE CASCADE |
| `title` | text | NOT NULL |
| `challenge_type` | text | NOT NULL, CHECK IN (`frequency`, `streak`, `custom`) |
| `target_value` | integer | NOT NULL, CHECK > 0 |
| `category` | text | nullable |
| `description` | text | nullable |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |

- `custom` here maps to `custom_self_reported` when instantiated as a `challenges` row

RLS: enabled, no policies.

## What This Migration Does NOT Include

- **RLS policies** — Issue #130
- **Indexes** — Issue #129
- **Leaderboard tables** — Issue #129
- **Profile/workout_logs column additions** — Issue #129
- **Postgres functions/triggers** — Issues #132-#135
- **Freeze tokens** — Explicitly excluded by design doc
- **Rewards tables** — Deferred to v2

## Migration Conventions

- File: `supabase/migrations/20260601120000_challenges_core_tables.sql`
- All statements idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP ... IF EXISTS`)
- Follows existing project patterns from `supabase/migrations/`
