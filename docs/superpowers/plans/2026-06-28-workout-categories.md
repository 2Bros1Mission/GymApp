# Workout Categories Implementation Plan (Issue #148)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an optional `category` column on `public.workout_logs` (nullable text + CHECK over six values + partial index) plus matching TypeScript types, behind a single idempotent migration.

**Architecture:** One SQL migration in `supabase/migrations/`, one TypeScript edit in `src/types/index.ts`. No service changes, no UI changes, no write-path changes. Supabase preview runs the migration automatically on the PR branch.

**Tech Stack:** PostgreSQL (Supabase), TypeScript. No new dependencies.

## Global Constraints

- Migration filename: `supabase/migrations/20260628150000_workout_categories.sql` — exact 14-digit timestamp + `_workout_categories.sql`. Per project convention.
- Migration MUST be idempotent: `DO $$ ... EXCEPTION WHEN duplicate_column / duplicate_object END $$;` blocks for ALTER TABLE; `CREATE INDEX IF NOT EXISTS` for the index.
- Column shape: `category text` (nullable, no default), CHECK constraint `workout_logs_category_check` allowing NULL or one of `'strength', 'cardio', 'flexibility', 'hiit', 'sports', 'other'`.
- Index: `idx_workout_logs_category` over `(user_id, category) WHERE category IS NOT NULL` — partial index, NULL rows excluded.
- TypeScript: `export type WorkoutCategory = 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'sports' | 'other';` (string literal union, not enum). Field on `WorkoutLog` interface: `category?: WorkoutCategory | null;` (both optional via `?` AND nullable via `| null`).
- `npx tsc --noEmit` must be clean. `npx eslint .` must be clean. Existing tests must still pass (no behavior change expected).
- No backfill, no `save_workout` RPC change, no i18n, no UI work. Strictly column + type.
- Node.js PATH workaround for every shell command:
  ```bash
  export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"
  ```
- Spec source of truth: `docs/superpowers/specs/2026-06-28-workout-categories-design.md`.

---

### Task 1: TypeScript types

**Files:**
- Modify: `src/types/index.ts` — add `WorkoutCategory` type and `category` field on `WorkoutLog` interface

**Interfaces:**
- Consumes: existing `WorkoutLog` interface in `src/types/index.ts` (line ~36).
- Produces: `export type WorkoutCategory` (used by future #133, #136 consumers); modified `WorkoutLog` with optional `category` field.

- [ ] **Step 1: Inspect the current `WorkoutLog` interface**

Read `src/types/index.ts` lines 30-50 to confirm the existing shape:

```typescript
export interface WorkoutLog {
  id: string;
  workoutId: string;
  date: string;
  startTime: string;
  endTime?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  completed: boolean;
}
```

- [ ] **Step 2: Add the `WorkoutCategory` type immediately before the `WorkoutLog` interface**

Edit `src/types/index.ts`. Insert this block above `export interface WorkoutLog {`:

```typescript
export type WorkoutCategory =
  | 'strength'
  | 'cardio'
  | 'flexibility'
  | 'hiit'
  | 'sports'
  | 'other';
```

- [ ] **Step 3: Add the `category` field to `WorkoutLog`**

Edit `src/types/index.ts`. Inside the `WorkoutLog` interface, add the new field as the last property before the closing brace:

```typescript
export interface WorkoutLog {
  id: string;
  workoutId: string;
  date: string;
  startTime: string;
  endTime?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  completed: boolean;
  category?: WorkoutCategory | null;
}
```

Keep the existing fields in their existing order; only add the new field.

- [ ] **Step 4: Type-check the project**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
```

Expected: no output (no errors). If any existing call site constructs a `WorkoutLog` literal that now fails because of strict-object-literal checks, surface the file and stop — don't silently widen.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add WorkoutCategory type and optional category field on WorkoutLog (Issue #148)"
```

---

### Task 2: SQL migration

**Files:**
- Create: `supabase/migrations/20260628150000_workout_categories.sql`

**Interfaces:**
- Consumes: existing `public.workout_logs` table (defined in `supabase/migrations/20260400000000_base_schema.sql`).
- Produces: `public.workout_logs.category` column (text, nullable, CHECK-constrained); `workout_logs_category_check` CHECK constraint; `idx_workout_logs_category` partial index. Becomes available to #133 progress trigger and #136 discovery service when they ship.

- [ ] **Step 1: Create the migration file with the full SQL**

Create `supabase/migrations/20260628150000_workout_categories.sql` with this exact content:

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

- [ ] **Step 2: Verify the file shape matches the existing migration convention**

Run:
```bash
ls supabase/migrations/ | tail -5
```

Expected: the new file appears in the listing with the exact name `20260628150000_workout_categories.sql`, sorted after `20260608120000_challenges_pick_rpc.sql`.

Run:
```bash
head -5 supabase/migrations/20260628150000_workout_categories.sql
```

Expected: starts with the `-- Issue #148` comment line.

- [ ] **Step 3: Sanity-check the idempotency pattern matches a known-good migration**

Run:
```bash
grep -c "exception" supabase/migrations/20260628150000_workout_categories.sql
```

Expected: `2` (one `WHEN duplicate_column` for the ALTER COLUMN, one `WHEN duplicate_object` for the ADD CONSTRAINT).

Run:
```bash
grep -c "if not exists" supabase/migrations/20260628150000_workout_categories.sql
```

Expected: `1` (the CREATE INDEX line).

If either count is wrong, the migration won't re-run safely — stop and fix.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628150000_workout_categories.sql
git commit -m "feat(db): add category column to workout_logs (Issue #148)"
```

---

### Task 3: Verify, push, open PR

**Files:**
- No source changes. Verification + branch push + PR open + issue body annotation.

**Interfaces:**
- Consumes: Tasks 1 + 2 (committed branch).
- Produces: PR ready for Aleks's review against `master`; Issue #148 body annotated with PR link.

- [ ] **Step 1: Run the full lint**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx eslint .
```

Expected: no output. The new optional field on `WorkoutLog` shouldn't surface any lint warnings.

- [ ] **Step 2: Run the full type-check**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Run the full Jest suite**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest --passWithNoTests
```

Expected: all suites green. Count should match the prior baseline (71/71 before this branch).

- [ ] **Step 4: Run the web export to mirror CI**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx expo export --platform web
```

Expected: success — `Exported: dist`.

- [ ] **Step 5: Confirm working tree is clean except for the expected untracked dirs**

Run:
```bash
git status -sb
```

Expected: branch line `## feat/148-workout-categories`, followed only by untracked `.claude/` and `.superpowers/` directories. No modified tracked files.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/148-workout-categories
```

Expected: branch created on origin; tracking link set.

- [ ] **Step 7: Write the PR body to a file**

Create `.superpowers/sdd/pr-148-body.md` with this content:

```markdown
## Summary

- Adds optional `category text` column to `public.workout_logs` with CHECK constraint over six values (`strength`, `cardio`, `flexibility`, `hiit`, `sports`, `other`) and a partial index `(user_id, category) WHERE category IS NOT NULL`.
- Adds matching TypeScript: `WorkoutCategory` string-literal-union type and `category?: WorkoutCategory | null` on the `WorkoutLog` interface in `src/types/index.ts`.
- Migration is idempotent (`DO $$ ... EXCEPTION` pattern + `IF NOT EXISTS`), matches the project convention from PR #150 / #129.
- No backfill, no `save_workout` RPC change, no UI work, no i18n, no RLS change. Strictly the column + the type.

## New files

- `supabase/migrations/20260628150000_workout_categories.sql` — column + constraint + partial index.
- `docs/superpowers/specs/2026-06-28-workout-categories-design.md` — design spec.
- `docs/superpowers/plans/2026-06-28-workout-categories.md` — implementation plan.

## Modified files

- `src/types/index.ts` — `WorkoutCategory` type alias + `category` field on `WorkoutLog`.

## Test plan

- [x] `npx tsc --noEmit` → no errors
- [x] `npx eslint .` → no errors
- [x] `npx jest --passWithNoTests` → 71/71 green (baseline preserved; no behavior change)
- [x] `npx expo export --platform web` → success
- [ ] Supabase preview applies the migration cleanly (auto-runs on this PR branch)
- [ ] Manual (post-merge): direct `INSERT INTO workout_logs (..., category) VALUES (..., 'strength')` succeeds; `INSERT ... VALUES (..., 'invalid')` fails with `workout_logs_category_check`; `INSERT ... VALUES (..., NULL)` succeeds.

## Notes for #133 and #136

- `#133` progress trigger should treat `NULL category` as "skip — uncategorized" when computing category-filtered challenge progress.
- `#136` discovery service can now expose `categoryFilter` on trainer-authored challenges.

Closes #148
```

- [ ] **Step 8: Open the PR**

Run:
```bash
"/c/Program Files/GitHub CLI/gh.exe" pr create \
  --repo 2Bros1Mission/GymApp \
  --base master \
  --head feat/148-workout-categories \
  --title "feat(db): add category column to workout_logs (#148)" \
  --body-file .superpowers/sdd/pr-148-body.md
```

Expected: prints the new PR URL.

- [ ] **Step 9: Annotate Issue #148 with the PR link**

Get the current issue body and prepend a one-line implementation note:

```bash
"/c/Program Files/GitHub CLI/gh.exe" issue view 148 --repo 2Bros1Mission/GymApp --json body --jq '.body' > .superpowers/sdd/issue-148-body-original.md
```

Then create `.superpowers/sdd/issue-148-body-new.md`:

```markdown
> **Implementation note:** Shipped per `docs/superpowers/specs/2026-06-28-workout-categories-design.md`. See PR for the design write-up and trade-offs. No deviations from this body — column shape, value list, partial index, and idempotency all match.

---

```

…followed by the original body (concatenate the two files).

Then apply:

```bash
"/c/Program Files/GitHub CLI/gh.exe" issue edit 148 \
  --repo 2Bros1Mission/GymApp \
  --body-file .superpowers/sdd/issue-148-body-new.md
```

Expected: prints the issue URL.

- [ ] **Step 10: Final sanity check**

Run:
```bash
git log --oneline master..HEAD
```

Expected: three commits — the spec doc, the type addition, the migration — plus the implementation plan commit (added separately by the controller). All authored by `gosho`.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Migration filename + 14-digit timestamp — Task 2 Step 1.
- ✅ `DO $$ ... EXCEPTION` idempotency on column + constraint — Task 2 Step 1 + Step 3 verification.
- ✅ Six-value CHECK constraint with NULL allowance — Task 2 Step 1.
- ✅ Partial index on `(user_id, category) WHERE category IS NOT NULL` — Task 2 Step 1.
- ✅ `WorkoutCategory` string-literal-union type — Task 1 Step 2.
- ✅ `category?: WorkoutCategory | null` on `WorkoutLog` — Task 1 Step 3.
- ✅ No `save_workout` RPC change — explicitly out-of-scope, not in any task.
- ✅ No backfill — not in any task.
- ✅ Verification: tsc + eslint + jest + expo export — Task 3 Steps 1–4.
- ✅ Idempotency self-check (grep for `exception` count + `if not exists` count) — Task 2 Step 3.

**Type consistency check:**
- `WorkoutCategory` defined once in Task 1 Step 2; referenced in Task 1 Step 3. Consistent.
- File paths consistent throughout: `src/types/index.ts`, `supabase/migrations/20260628150000_workout_categories.sql`.
- Constraint name `workout_logs_category_check` — used identically in Task 2 Step 1, Step 3 grep verification, and PR body acceptance criteria.
- Index name `idx_workout_logs_category` — same.

No placeholders. No `TBD`, no `add appropriate validation`, no `similar to Task N` references.
