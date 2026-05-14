# PR Review Findings (PRs #96–#102, #105, #107)

Reviewed 2026-05-14. Summary of security flaws, missing features, and code quality issues.

---

## PR #96 — fix: hide trainer email from client-side connection flow

**Status:** LGTM (merged)

| Severity | Finding |
|----------|---------|
| Low | Trainer email is still returned from the backend query (just unused in UI now). For full privacy, remove from the Supabase select/RPC response in a follow-up. |

---

## PR #97 — feat: show recent client workout activity on trainer dashboard

**Status:** Merged. Has critical and high issues.

| Severity | Finding |
|----------|---------|
| Critical | `getRecentClientActivity` has NO application-level filter for trainer's clients. Queries `workout_logs` without `.in('user_id', clientIds)`, relying entirely on RLS. This is a performance problem (full table scan + correlated subquery per row as data grows) and a defense-in-depth gap. The `trainerId` parameter is accepted but never used. |
| High | Activity query failure crashes the entire dashboard. It's in a `Promise.all` with critical data — if it throws, everything fails. Should use `.catch(() => [])` for graceful degradation. |
| Medium | No `clientId` null check before `router.push(\`/client-progress?clientId=${a.clientId}\`)` — navigates to `?clientId=undefined` if `user_id` is null. |
| Medium | 30 activity items rendered via `.map()` inside a ScrollView (not FlatList). Will cause jank on lower-end devices. |
| Medium | `new Date(a.date).toLocaleDateString()` without locale — date format won't match the app's selected language (BG/EN). |

**Recommended fix for critical issue:**
```typescript
export async function getRecentClientActivity(trainerId: string, limit = 30) {
  const { data: connections } = await supabase
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  const clientIds = (connections ?? []).map(c => c.client_id);
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('workout_logs')
    .select(`id, workout_name, date, duration_seconds, user_id,
             client:profiles!workout_logs_user_id_fkey ( name )`)
    .in('user_id', clientIds)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);
  // ...
}
```

---

## PR #98 — feat: add workout assignment flow (trainer -> client)

**Status:** Merged. Has multiple high-severity security gaps.

| Severity | Finding |
|----------|---------|
| High | **RLS UPDATE policy too permissive** — "Clients can update own assignment status" restricts rows (`client_id = auth.uid()`) but NOT columns. A client can modify `trainer_id`, `workout_id`, `notes`, `assigned_at` via direct Supabase request. Fix: use an RPC that only updates `status` and `completed_at`. |
| High | **Unique constraint breaks repeat assignments** — `unique(client_id, workout_id, status)` means only ONE completed record can exist per workout per client. Re-assigning the same workout (weekly, etc.) will throw a unique violation. Fix: use a partial unique index `WHERE status = 'pending'`. |
| High | **Missing workout ownership check in INSERT policy** — Trainers can assign workouts they don't own. RLS checks `trainer_id = auth.uid()` and connection exists, but never verifies `workout_id` belongs to that trainer. Add: `and exists (select 1 from custom_workouts where id = workout_assignments.workout_id and creator_id = auth.uid())`. |
| Medium | **Assign button visible to clients** — No role guard on the people icon in workouts list. Clients see a button leading to empty/error state. Wrap in `{profile?.role === 'trainer' && (...)}`. |
| Medium | **Partial failure in batch assignment** — Sequential `for` loop. If assignment 3/5 fails, user sees one error with no indication which succeeded. Use `Promise.allSettled` and report per-client results. |
| Medium | **`completeAssignment` doesn't filter by `client_id`** — Relies solely on RLS. Also uses client-supplied `new Date().toISOString()` instead of server-side `now()`. |
| Medium | **Auto-migration workflow has no safety gates** — `supabase db push` on every merge to master with no dry-run or approval step. |
| Medium | **Navigation to `/workout/${a.workoutId}` may be broken** — Route may only handle sample workouts, not custom ones from `custom_workouts` table. |
| Low | `dueDate` parameter wired in service but no date picker in UI (unreachable feature). |

---

## PR #99 — fix: handle mismatched remote migration history in CI

**Status:** Merged. Has a significant correctness issue.

| Severity | Finding |
|----------|---------|
| High | **Version format mismatch means ALL remote migrations are revoked every run.** Local files use short prefixes (`001`, `002`...) while Supabase remote uses 14-digit timestamps. The `grep -q "^${rv}$"` comparison never matches, so every remote migration is revoked on each push. This "works" as a brute-force reset but masks the root cause. Fix: rename local migrations to use Supabase timestamps, or add a count guard. |
| Medium | **Silent error suppression** — `2>/dev/null || true` on all commands makes debugging impossible when things go wrong. Replace with visible warnings. |

---

## PR #100 — chore: trigger migration workflow

**Status:** LGTM. Single comment line added to trigger CI. No functional change.

---

## PR #101 — fix: mark existing migrations as applied before pushing

**Status:** Merged. Minor concern only.

| Severity | Finding |
|----------|---------|
| Low | `supabase migration repair --status applied "$lv" 2>/dev/null || true` swallows all errors. If the CLI fails for a real reason (expired token, API change), the workflow silently continues and `db push` may fail with a confusing error. Replace with: `2>&1 || echo "Warning: failed to mark $lv as applied"`. |

---

## PR #102 — chore: trigger migration workflow v2

**Status:** LGTM. Comment text change to retrigger CI. No functional change.

---

## PR #105 — feat: client goals

**Status:** Has high-severity security and correctness issues.

| Severity | Finding |
|----------|---------|
| High | **RLS UPDATE policy on `goal_suggestions` too permissive** — Clients can modify ANY column (not just `status`). A client could change `suggested_value`, `trainer_id`, `goal_id`, or `notes` via direct Supabase request. Fix: use an RPC that only updates `status` and `responded_at`. |
| High | **Non-atomic `respondToSuggestion`** — Updates suggestion status and goal target value in two separate queries. If the second fails, suggestion is marked accepted but goal isn't updated (inconsistent state). Should be a single RPC transaction. |
| High | **`.single()` on `body_metrics` may crash** — If client has no body metrics, `.single()` throws. Should use `.maybeSingle()`. |
| Medium | **`useMemo` misused for side effects** in `suggest-goal.tsx` — Runs logic that should be in `useEffect`. Can cause unexpected re-execution or stale values. |
| Medium | **Missing error handling on `completeGoal`/`deleteGoal`** — No user feedback if operations fail. UI optimistically updates without confirming success. |
| Medium | **NaN risk from `parseFloat`** — No validation that parsed goal values are numbers before use in calculations/display. |
| Low | Missing loading states during goal operations. |

---

## PR #107 — feat: add workout feedback from trainer (#22)

**Status:** Open. CI passes but Supabase Preview failing. Has high-severity RLS and validation issues.

| Severity | Finding |
|----------|---------|
| High | **RLS SELECT policy too narrow** — "Trainers can read own feedback" only allows `trainer_id = auth.uid()`. If a client is reassigned or has history from a different trainer, the new trainer sees incomplete conversation. Policy should allow reading all feedback on connected client workouts (via `trainer_clients` join). |
| High | **Missing `workoutLogId` validation** — Navigating to `/workout-detail` without the param shows a blank screen (no error, no redirect). `enabled: !!workoutLogId` prevents the fetch but leaves the user stuck. |
| High | **No service-layer authorization guard** — `getWorkoutDetail` takes any `workoutLogId` with no app-level ownership check. RLS protects at DB level, but error UX is poor if someone hits a forbidden row. |
| Medium | **Whitespace-only messages pass validation** — DB constraint checks `char_length(message) > 0` but doesn't trim. Direct API caller could insert whitespace-only feedback. Fix: `char_length(trim(message)) > 0`. |
| Medium | **No optimistic update after sending feedback** — User must wait for full refetch to see their message. Adds perceptible delay. |
| Medium | **Performance concern on INSERT policy** — `workout_logs JOIN trainer_clients` subquery runs on every insert. Verify composite index exists on `trainer_clients(trainer_id, client_id, status)`. |
| Medium | **Timezone handling in `formatRelativeTime`** — Could show incorrect relative times if timestamp string lacks timezone indicator. |
| Medium | **Unused `clientId` param** — Passed in navigation URL but never consumed in workout-detail screen. |
| Low | No UPDATE/DELETE policies — feedback is append-only, trainers can't fix typos. |
| Low | `EMPTY_DETAIL` relies on falsy empty string for render check — fragile pattern. |

**Note:** Supabase Preview check is failing — likely a migration issue that needs investigation before merge.

---

## Recurring Patterns

These issues appear across multiple PRs and should be addressed systematically:

### 1. Overly permissive RLS UPDATE policies (PRs #98, #105)

**Pattern:** Policies restrict which ROWS can be updated (`client_id = auth.uid()`) but not which COLUMNS. Supabase RLS cannot restrict columns natively.

**Systemic fix:** All client-facing mutations that should only change specific fields (status transitions, completions) must go through `SECURITY DEFINER` RPC functions that validate and update only the intended columns. Never expose raw `.update()` for state transitions.

### 2. Relying solely on RLS without application-level filtering (PRs #97, #98)

**Pattern:** Queries fetch broadly (no WHERE clause for ownership) and trust RLS to invisibly filter. This works for security but hurts performance and makes code unreadable.

**Systemic fix:** Always include explicit ownership filters in queries even when RLS is present. Defense in depth.

### 3. Silent CI error suppression (PRs #99, #101)

**Pattern:** `|| true` and `2>/dev/null` on CI commands make failures invisible.

**Systemic fix:** Log warnings instead of swallowing errors. Add count guards for destructive operations.
