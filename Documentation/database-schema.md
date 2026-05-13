# GymApp Database Schema

## Overview

GymApp uses **Supabase** (hosted PostgreSQL) with **Row Level Security (RLS)** enforced on all tables. The schema lives in `supabase/schema.sql` as the source of truth.

**Current state:** 5 tables supporting workout logging and body metrics.
**Planned:** 7 additional tables for trainer features (see Planned Schema section).

---

## Current Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    profiles ||--o{ workout_logs : "logs workouts"
    profiles ||--o{ body_metrics : "tracks weight"
    workout_logs ||--o{ exercise_logs : "contains"
    exercise_logs ||--o{ set_logs : "contains"

    profiles {
        uuid id PK "references auth.users"
        text name "NOT NULL"
        text email "NOT NULL"
        text role "client | trainer"
        text language "bg | en"
        real weight "nullable"
        real height "nullable"
        text goal "nullable, constrained"
        text avatar_url "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    workout_logs {
        uuid id PK
        uuid user_id FK "references profiles"
        text workout_id "NOT NULL"
        text workout_name "NOT NULL"
        date date "default current_date"
        timestamptz start_time
        timestamptz end_time "nullable"
        integer duration_seconds "nullable"
        boolean completed "default false"
        text notes "nullable"
        timestamptz created_at
    }

    exercise_logs {
        uuid id PK
        uuid workout_log_id FK "references workout_logs"
        text exercise_id "NOT NULL"
        text exercise_name "NOT NULL"
        integer order_index "NOT NULL"
        timestamptz created_at
    }

    set_logs {
        uuid id PK
        uuid exercise_log_id FK "references exercise_logs"
        integer set_number "NOT NULL"
        real weight "default 0"
        integer reps "default 0"
        boolean completed "default false"
        timestamptz created_at
    }

    body_metrics {
        uuid id PK
        uuid user_id FK "references profiles"
        date date "default current_date"
        real weight "nullable"
        text notes "nullable"
        timestamptz created_at
    }
```

---

### Table Details

#### `profiles`

Extends Supabase `auth.users`. Created automatically on signup via trigger.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, FK → auth.users ON DELETE CASCADE |
| `name` | text | NOT NULL |
| `email` | text | NOT NULL |
| `role` | text | NOT NULL, default `'client'`, CHECK (`client`, `trainer`) |
| `language` | text | NOT NULL, default `'bg'`, CHECK (`bg`, `en`) |
| `weight` | real | nullable |
| `height` | real | nullable |
| `goal` | text | nullable, CHECK (`lose_weight`, `build_muscle`, `get_stronger`, `stay_healthy`, `improve_endurance`) |
| `avatar_url` | text | nullable |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| `updated_at` | timestamptz | NOT NULL, default `now()` |

#### `workout_logs`

Each completed (or in-progress) workout session.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → profiles ON DELETE CASCADE, NOT NULL |
| `workout_id` | text | NOT NULL |
| `workout_name` | text | NOT NULL |
| `date` | date | NOT NULL, default `current_date` |
| `start_time` | timestamptz | NOT NULL, default `now()` |
| `end_time` | timestamptz | nullable |
| `duration_seconds` | integer | nullable |
| `completed` | boolean | NOT NULL, default `false` |
| `notes` | text | nullable |
| `created_at` | timestamptz | NOT NULL, default `now()` |

#### `exercise_logs`

Each exercise performed within a workout session.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `workout_log_id` | uuid | FK → workout_logs ON DELETE CASCADE, NOT NULL |
| `exercise_id` | text | NOT NULL |
| `exercise_name` | text | NOT NULL |
| `order_index` | integer | NOT NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

#### `set_logs`

Individual sets within an exercise.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `exercise_log_id` | uuid | FK → exercise_logs ON DELETE CASCADE, NOT NULL |
| `set_number` | integer | NOT NULL |
| `weight` | real | NOT NULL, default `0` |
| `reps` | integer | NOT NULL, default `0` |
| `completed` | boolean | NOT NULL, default `false` |
| `created_at` | timestamptz | NOT NULL, default `now()` |

#### `body_metrics`

Daily body measurements (one entry per user per day).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → profiles ON DELETE CASCADE, NOT NULL |
| `date` | date | NOT NULL, default `current_date` |
| `weight` | real | nullable |
| `notes` | text | nullable |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| | | UNIQUE (`user_id`, `date`) |

---

### Indexes

| Index | Table | Columns |
|-------|-------|---------|
| `idx_workout_logs_user` | workout_logs | `(user_id, date DESC)` |
| `idx_exercise_logs_workout` | exercise_logs | `(workout_log_id)` |
| `idx_set_logs_exercise` | set_logs | `(exercise_log_id)` |
| `idx_body_metrics_user` | body_metrics | `(user_id, date DESC)` |

---

### Row Level Security Policies

All tables have RLS enabled. Users can only access their own data.

#### `profiles`

| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |
| Users can insert own profile | INSERT | `auth.uid() = id` |

#### `workout_logs`

| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own workout logs | SELECT | `auth.uid() = user_id` |
| Users can insert own workout logs | INSERT | `auth.uid() = user_id` |
| Users can update own workout logs | UPDATE | `auth.uid() = user_id` |

#### `exercise_logs`

| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own exercise logs | SELECT | via JOIN to workout_logs where `user_id = auth.uid()` |
| Users can insert own exercise logs | INSERT | via JOIN to workout_logs where `user_id = auth.uid()` |

#### `set_logs`

| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own set logs | SELECT | via JOIN through exercise_logs → workout_logs where `user_id = auth.uid()` |
| Users can insert own set logs | INSERT | via JOIN through exercise_logs → workout_logs where `user_id = auth.uid()` |

#### `body_metrics`

| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own metrics | SELECT | `auth.uid() = user_id` |
| Users can insert own metrics | INSERT | `auth.uid() = user_id` |
| Users can update own metrics | UPDATE | `auth.uid() = user_id` |

---

### Trigger

#### `handle_new_user()`

Automatically creates a `profiles` row when a user signs up via Supabase Auth.

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

The function reads from `raw_user_meta_data`:
- `name` → `profiles.name` (falls back to empty string)
- `role` → `profiles.role` (falls back to `'client'`)
- `email` → from `auth.users.email`

---

## Planned Schema (Phase 3: Trainer Core)

These tables will be added to support trainer features (issues #16-23). See `docs/plans/2026-05-13-trainer-core.md` for the full migration.

### Planned Entity Relationship Diagram

```mermaid
erDiagram
    profiles ||--o{ trainer_clients : "trains (as trainer)"
    profiles ||--o{ trainer_clients : "trained by (as client)"
    profiles ||--o{ trainer_invites : "creates invites"
    profiles ||--o{ workout_templates : "creates templates"
    profiles ||--o{ workout_assignments : "assigns (as trainer)"
    profiles ||--o{ workout_assignments : "receives (as client)"
    profiles ||--o{ program_followers : "follows programs"
    profiles ||--o{ workout_feedback : "gives feedback"
    profiles ||--o{ client_goals : "sets goals (as trainer)"
    profiles ||--o{ client_goals : "has goals (as client)"
    workout_templates ||--o{ workout_assignments : "assigned via"
    workout_templates ||--o{ program_followers : "followed by"
    workout_logs ||--o{ workout_feedback : "receives feedback"
    workout_logs ||--o{ workout_assignments : "completes"

    trainer_clients {
        uuid id PK
        uuid trainer_id FK "references profiles"
        uuid client_id FK "references profiles"
        text status "pending | active | rejected"
        timestamptz invited_at
        timestamptz connected_at "nullable"
    }

    trainer_invites {
        uuid id PK
        uuid trainer_id FK "references profiles"
        text code "UNIQUE, NOT NULL"
        timestamptz expires_at "default now + 7 days"
        uuid used_by FK "nullable, references profiles"
        timestamptz used_at "nullable"
        timestamptz created_at
    }

    workout_templates {
        uuid id PK
        uuid creator_id FK "references profiles"
        text name "NOT NULL"
        text name_bg "nullable"
        text description "nullable"
        text description_bg "nullable"
        text difficulty "beginner | intermediate | advanced"
        integer duration_minutes "nullable"
        text_array muscle_groups "default empty"
        jsonb exercises "NOT NULL, default []"
        boolean is_public "default false"
        timestamptz created_at
        timestamptz updated_at
    }

    workout_assignments {
        uuid id PK
        uuid trainer_id FK "references profiles"
        uuid client_id FK "references profiles"
        uuid template_id FK "references workout_templates"
        timestamptz assigned_at
        date due_date "nullable"
        text status "pending | completed | skipped"
        timestamptz completed_at "nullable"
        uuid workout_log_id FK "nullable, references workout_logs"
    }

    program_followers {
        uuid id PK
        uuid template_id FK "references workout_templates"
        uuid user_id FK "references profiles"
        timestamptz followed_at
    }

    workout_feedback {
        uuid id PK
        uuid workout_log_id FK "references workout_logs"
        uuid trainer_id FK "references profiles"
        text message "NOT NULL"
        timestamptz created_at
    }

    client_goals {
        uuid id PK
        uuid client_id FK "references profiles"
        uuid trainer_id FK "references profiles"
        text type "weight_target | lift_target | frequency | custom"
        text title "NOT NULL"
        real target_value "nullable"
        real current_value "default 0"
        text unit "nullable"
        date deadline "nullable"
        text status "active | achieved | abandoned"
        timestamptz created_at
    }
```

---

### Planned Table Summary

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `trainer_clients` | Trainer-client connections | UNIQUE(trainer_id, client_id) |
| `trainer_invites` | Invite codes for linking | trainer_id, used_by |
| `workout_templates` | Reusable workout blueprints | creator_id, exercises as JSONB |
| `workout_assignments` | Assigned workouts to clients | trainer_id, client_id, template_id |
| `program_followers` | Public program subscriptions | UNIQUE(template_id, user_id) |
| `workout_feedback` | Trainer notes on workouts | workout_log_id, trainer_id |
| `client_goals` | Goals set by trainer for client | client_id, trainer_id |

---

### Planned RLS Strategy

The trainer tables introduce cross-user data access. Key principles:

1. **Trainers read connected clients' data** — workout_logs, exercise_logs, set_logs, body_metrics become readable by the trainer via JOIN to `trainer_clients` where `status = 'active'`
2. **Trainers write to their own resources** — templates, assignments, feedback, goals are scoped to `trainer_id = auth.uid()`
3. **Clients read their own assignments/feedback/goals** — scoped to `client_id = auth.uid()`
4. **Public templates readable by all authenticated users** — `is_public = true`
5. **Invite codes readable by anyone** (to validate), writable only by the trainer who created them

### Cross-Table Access Patterns

```
Trainer reads client workout data:
  workout_logs → WHERE user_id IN (
    SELECT client_id FROM trainer_clients 
    WHERE trainer_id = auth.uid() AND status = 'active'
  )

Trainer writes feedback:
  workout_feedback → INSERT WHERE trainer_id = auth.uid() 
    AND workout_log_id belongs to an active client

Client reads assignments:
  workout_assignments → SELECT WHERE client_id = auth.uid()
```
