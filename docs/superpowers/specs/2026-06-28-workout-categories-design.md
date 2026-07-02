# Issue #148 — Workout Categories Design

## Goal

Add an optional `category` column to `public.workout_logs` so that future challenges (#133 progress trigger, #136 discovery service category filter) can filter user activity by workout type. Single idempotent migration plus matching TypeScript types. No backfill, no UI changes, no write-path changes.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Column nullability | `text` nullable, no default | Existing rows and rows from clients that don't yet set a category remain NULL. NULL means "uncategorized" — semantically distinct from `'other'`. The challenge progress trigger (#133) skips NULL when computing category-filtered progress, matching user intent. |
| Enum vs CHECK | CHECK constraint with fixed value list | Matches existing project pattern (challenge tables use CHECK, not PG enums — see `20260601120000_challenges_core_tables.sql`). Cheaper to extend later: adding a value is a `DROP CONSTRAINT` + `ADD CONSTRAINT`, no ALTER TYPE rebuild. |
| Category list | `strength`, `cardio`, `flexibility`, `hiit`, `sports`, `other` | Per issue spec. Six values cover the common workout types. `other` is the catch-all so a UI dropdown always has a valid pick. |
| Backfill | None | Per issue spec. Old rows keep NULL. Category-filtered challenges naturally exclude pre-category logs, which is the correct behavior (we don't know what category they were). |
| Index | Partial `(user_id, category) WHERE category IS NOT NULL` | The category filter is always per-user. Partial index keeps size proportional to categorized rows only — old NULL rows don't pay an index-write cost. |
| Idempotency | `DO $$ ... EXCEPTION WHEN duplicate_column / duplicate_object` blocks + `CREATE INDEX IF NOT EXISTS` | Matches PR #150 / #129 (`20260602120000_challenges_leaderboard.sql`) pattern. Safe to re-run on a partially-applied state. |
| Migration timestamp | `20260628150000` | After all existing migrations (latest is `20260608120000_challenges_pick_rpc.sql`). 14-digit format per project convention. |
| RLS | Unchanged | Existing `workout_logs` row-level policies (`user_id = auth.uid()` for read/write) automatically cover the new column. No new policy needed. |
| `save_workout` RPC update | Out of scope | Write path stays unchanged. New logs land with `category = NULL`. Wiring up a category picker in the workout-completion screen is a follow-up issue. |
| TypeScript layer | `WorkoutCategory` type alias + optional `category` field on `WorkoutLog` interface | Type the field at the boundary so #133 and #136 consumers get autocomplete. Optional and nullable so existing call sites that construct `WorkoutLog` partials don't break. |

## SQL Migration

`supabase/migrations/20260628150000_workout_categories.sql`

```sql
-- Issue #148 — add category column to workout_logs for category-filtered challenges (#133, #136).
-- Idempotent: safe to re-run on partially applied state.

do $$ begin
  alter table public.workout_logs add column category text;
exception
  when duplicate_column then null;
end $$;

do $$ begin
  alter table public.workout_logs
    add constraint workout_logs_category_check
    check (category is null or category in (
      'strength', 'cardio', 'flexibility', 'hiit', 'sports', 'other'
    ));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_workout_logs_category
  on public.workout_logs (user_id, category)
  where category is not null;
```

## TypeScript Additions

`src/types/index.ts` — added next to the existing `WorkoutLog` interface (line ~36):

```typescript
export type WorkoutCategory =
  | 'strength'
  | 'cardio'
  | 'flexibility'
  | 'hiit'
  | 'sports'
  | 'other';

export interface WorkoutLog {
  id: string;
  workoutId: string;
  date: string;
  startTime: string;
  endTime?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  completed: boolean;
  category?: WorkoutCategory | null; // added
}
```

The `category?: WorkoutCategory | null` shape (both optional via `?` and nullable via `| null`) lets existing construction sites continue to omit the field, and lets DB rows carrying `category: null` map straight through `as WorkoutLog` without a runtime transform.

## Affected Files

**New**
- `supabase/migrations/20260628150000_workout_categories.sql`
- `docs/superpowers/specs/2026-06-28-workout-categories-design.md` (this file)

**Modified**
- `src/types/index.ts` — `WorkoutCategory` type + field on `WorkoutLog`

## Acceptance Criteria

- [ ] Migration applies cleanly to a fresh DB and is a no-op on a DB where it has already run
- [ ] `\d+ public.workout_logs` shows a nullable `category` column with the CHECK constraint covering all six values
- [ ] Insert with any of the six valid values succeeds; insert with `'invalid'` fails with `workout_logs_category_check`; insert with `null` succeeds
- [ ] Index `idx_workout_logs_category` is partial (`WHERE category IS NOT NULL`)
- [ ] `npx tsc --noEmit` clean
- [ ] `npx eslint .` clean
- [ ] All existing tests still pass (no behavioral change)

## Out of Scope

- Updating the `save_workout` RPC to accept a `category` parameter — separate ticket once a UI picker exists.
- Backfilling existing logs (e.g., heuristic from `workout_name`) — could be a follow-up if product wants old data categorized; today it's NULL.
- i18n strings for category display labels — UI concern, not type-layer.
- Heuristic auto-categorization at write time — also UI/UX concern.
- A category dropdown in the workout-completion screen — separate UI issue.

## References

- Issue #148 — Gamification: Add workout categories to workout_logs
- `supabase/migrations/20260601120000_challenges_core_tables.sql` — CHECK-constraint pattern
- `supabase/migrations/20260602120000_challenges_leaderboard.sql` — DO $$ ... EXCEPTION idempotency pattern (PR #129/#150)
- `Documentation/quality_standards.md` (memory) — migration conventions (14-digit timestamp, idempotency, indexes for filtered queries)
