# PR Review Findings

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

### Simplified Explanations

**Issue 1 (Critical): No filter for trainer's own clients**
Imagine a gym owner asking "show me what my clients did today" — but instead of looking at *their* client list, the system looks through *every single member in the gym* and relies on a locked door to stop them from seeing others' data. Even though the locked door works, it's slow and wasteful.
**Fix:** First get the trainer's client list, then only ask for those clients' workouts.

**Issue 2 (High): One failure crashes everything**
The trainer dashboard loads clients, workouts, AND activity all at once in a bundle. If the activity part fails (e.g. server hiccup), the whole dashboard goes blank — like one blown fuse knocking out all the lights in the house instead of just one room.
**Fix:** If activity fails, show the rest of the dashboard normally and just skip the activity section.

**Issue 3 (Medium): Missing safety check before navigation**
If a client somehow doesn't have an ID, tapping their activity row navigates to a broken URL with "undefined" in it — like writing an address on an envelope but leaving the house number blank.
**Fix:** Check that the client ID exists before navigating. If it's missing, don't navigate.

**Issue 4 (Medium): Slow rendering of activity list**
All 30 activity items are rendered at once inside a simple scroll container. On older phones this causes stuttering — like trying to load 30 high-res photos all at once instead of loading them as you scroll.
**Fix:** Use a smart list (FlatList) that only renders items visible on screen, loading more as you scroll.

**Issue 5 (Medium): Date format ignores app language**
Dates show in whatever format your phone uses, not the language you chose in the app. If you set the app to Bulgarian but your phone is English, dates appear in English.
**Fix:** Pass the app's selected language to the date formatter so dates always match the app language.

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

### Simplified Explanations

**Issue 1 (High): Client can change things they shouldn't**
When a client marks an assignment as "completed," the system only checks *which row* they're editing (their own), but not *which columns*. It's like a hotel guest being allowed into their room but then being able to rearrange the furniture, repaint walls, and change the room number on the door.
**Fix:** Instead of letting clients edit the row directly, give them a specific button (RPC) that only changes the status field and nothing else.

**Issue 2 (High): Can't assign the same workout twice**
There's a rule saying "one client can only have one pending copy of each workout." But it also blocks having two *completed* copies. So if a trainer assigns "Leg Day" every week, the second week fails — like a library that says "you already borrowed this book last month" even though you returned it.
**Fix:** Only enforce the "one at a time" rule for pending assignments, not completed ones.

**Issue 3 (High): Trainer can assign someone else's workout**
The system checks that the trainer has a connection with the client, but doesn't check that the workout actually belongs to that trainer. It's like a teacher being allowed to assign homework from any teacher's class, not just their own.
**Fix:** Add a check that the workout was created by the same trainer who's assigning it.

**Issue 4 (Medium): Assign button visible to clients**
Clients see an "assign" button on workouts even though only trainers can assign. Tapping it leads to an error or empty screen — like showing a "Staff Only" door to customers but without the "Staff Only" sign.
**Fix:** Only show the button when the user is a trainer.

**Issue 5 (Medium): Batch assignment partial failure**
When assigning a workout to 5 clients at once, if client #3 fails, the process stops and the user just sees "error" with no idea that clients #1 and #2 already got it. Like mailing 5 letters but the post office loses one and throws away the remaining two.
**Fix:** Try all 5 independently and report which succeeded and which failed.

**Issue 6 (Medium): Complete-assignment shortcut**
When marking an assignment complete, the app uses the client's phone clock for the timestamp instead of the server's clock. Someone could set their phone to the future. Also no extra safety check that it's really their assignment.
**Fix:** Let the server set the completion time (it already knows what time it is), and double-check the client owns the assignment.

**Issue 7 (Medium): Auto-migration with no safety net**
Every merge to main automatically pushes database changes with no preview or approval step. Like having a robot that automatically renovates your house every time you sketch something on a napkin — no review before the walls come down.
**Fix:** Add a dry-run step that shows what would change, requiring a human to approve before it actually runs.

**Issue 8 (Medium): Navigation to wrong workout type**
When tapping an assigned workout, the app navigates to a route that may only handle sample workouts, not custom ones. Like having a library card that only works at one branch — tapping a book from the other branch shows nothing.
**Fix:** Verify the route handles custom workouts, or route to the correct screen based on workout type.

**Issue 9 (Low): Due date feature with no UI**
The code accepts a "due date" when creating assignments, but there's no date picker in the screen. It's dead weight — like a form that has a hidden field nobody can fill in.
**Fix:** Either add the date picker UI or remove the unused parameter.

---

## PR #99 — fix: handle mismatched remote migration history in CI

**Status:** Merged. ~~Has a significant correctness issue.~~ **RESOLVED by PR #110** (migrations renamed to 14-digit timestamps).

| Severity | Finding |
|----------|---------|
| High | **Version format mismatch means ALL remote migrations are revoked every run.** Local files use short prefixes (`001`, `002`...) while Supabase remote uses 14-digit timestamps. The `grep -q "^${rv}$"` comparison never matches, so every remote migration is revoked on each push. This "works" as a brute-force reset but masks the root cause. Fix: rename local migrations to use Supabase timestamps, or add a count guard. |
| Medium | **Silent error suppression** — `2>/dev/null || true` on all commands makes debugging impossible when things go wrong. Replace with visible warnings. |

### Simplified Explanations

**Issue 1 (High): All migrations get reset every run**
Local migration files use short names (001, 002...) but Supabase uses long timestamps. The CI compares them and never finds a match, so it revokes ALL migrations every push and re-applies them from scratch. Like a teacher who can't match student names to their test papers because one list uses first names and the other uses full names — so they throw out all grades and re-grade everything daily.
**Fix:** Rename local files to use the same 14-digit timestamp format. (This is what PR #110 fixed.)

**Issue 2 (Medium): Errors hidden in CI**
All CI commands have "ignore errors" flags (`|| true`, `2>/dev/null`). If something breaks, you see no error — like putting tape over your car's check-engine light.
**Fix:** Show warnings instead of hiding errors, so you know when something went wrong.

---

## PR #101 — fix: mark existing migrations as applied before pushing

**Status:** Merged. ~~Minor concern only.~~ **RESOLVED by PR #110** (root cause fixed, this workaround is no longer exercised).

| Severity | Finding |
|----------|---------|
| Low | `supabase migration repair --status applied "$lv" 2>/dev/null || true` swallows all errors. If the CLI fails for a real reason (expired token, API change), the workflow silently continues and `db push` may fail with a confusing error. Replace with: `2>&1 || echo "Warning: failed to mark $lv as applied"`. |

### Simplified Explanations

**Issue 1 (Low): Swallowed errors**
The "mark as applied" command silently ignores failures. If your login token expires, the step appears to succeed but actually didn't — like a smoke detector with dead batteries that shows a green light anyway.
**Fix:** Print a warning message when the command fails instead of hiding it completely.

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

### Simplified Explanations

**Issue 1 (High): Client can modify goal suggestions they shouldn't**
When a client responds to a trainer's suggestion, they can change ANY field, not just accept/reject. They could change what was suggested, who suggested it, or which goal it's for — like a student being allowed to edit the teacher's question while answering it.
**Fix:** Use a dedicated RPC that only changes the status and response timestamp, nothing else.

**Issue 2 (High): Two-step operation can half-fail**
Accepting a suggestion does two things: (1) mark suggestion as accepted, (2) update the goal's target value. If step 2 fails, the suggestion shows "accepted" but the goal didn't actually change — like a bank transfer that debits your account but never credits the other one.
**Fix:** Wrap both steps in a single database transaction (RPC) so either both happen or neither does.

**Issue 3 (High): Crash when client has no body metrics**
The code asks the database for "exactly one row" of body metrics. If the client hasn't logged any yet, the database throws an error instead of returning nothing — like a librarian getting angry when you ask for a book that doesn't exist instead of just saying "we don't have it."
**Fix:** Use `.maybeSingle()` which gracefully returns null when no row exists.

**Issue 4 (Medium): Wrong React hook usage**
`useMemo` (meant for calculating values) is being used to run actions (side effects). It's like using a measuring cup as a mixing bowl — it sort of works but behaves unpredictably.
**Fix:** Move the logic to `useEffect` which is designed for running actions.

**Issue 5 (Medium): No error feedback on goal operations**
When completing or deleting a goal fails, the app shows no error message. The user taps "complete" and nothing happens — like pressing an elevator button that's broken but has no "out of order" sign.
**Fix:** Show an error message when the operation fails, so the user knows to try again.

**Issue 6 (Medium): NaN risk from number parsing**
Goal values (like "lose 5kg") are parsed from text to numbers without checking if the result is actually a number. If something unexpected is stored, calculations show "NaN" — like a calculator displaying gibberish because someone typed letters.
**Fix:** Validate that the parsed value is a real number before using it. Show an error or default if it's not.

**Issue 7 (Low): No loading states**
When completing or deleting a goal, there's no spinner or disabled state on the button. Users might tap repeatedly thinking nothing happened — like a crosswalk button with no light to show it registered your press.
**Fix:** Disable the button and show a spinner while the operation is in progress.

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

### Simplified Explanations

**Issue 1 (High): New trainer can't see old feedback**
The policy says "trainers can only read feedback they wrote." If a client gets reassigned to a new trainer, the new trainer can't see the previous conversation history — like a doctor who can't access a patient's medical history because a different doctor wrote it.
**Fix:** Allow trainers to read all feedback on workouts belonging to their connected clients, not just feedback they personally wrote.

**Issue 2 (High): Missing parameter crashes the screen**
If someone navigates to the workout-detail screen without the required workout ID (e.g., from a malformed link), the screen shows blank with no explanation — like opening a recipe book to a page that's completely empty with no "page not found" message.
**Fix:** Detect the missing parameter and either redirect back or show a clear error message.

**Issue 3 (High): No user-friendly error for forbidden access**
If someone tries to view a workout they shouldn't access, the database silently returns nothing (thanks to RLS), but the app just shows a blank screen. No "you don't have permission" message — like knocking on a door and getting complete silence instead of "wrong address."
**Fix:** Detect when the query returns empty due to access restrictions and show a meaningful error.

**Issue 4 (Medium): Whitespace-only messages allowed**
The database checks that feedback isn't empty (`length > 0`), but spaces count as characters. Someone could send a message that's just 50 spaces — looks blank but technically passes. Like a student submitting a "filled" exam that's actually just blank spaces.
**Fix:** Trim whitespace before checking length: `char_length(trim(message)) > 0`.

**Issue 5 (Medium): No instant feedback after sending**
After the trainer sends feedback, they have to wait for the entire conversation to reload from the server before seeing their own message appear. Like sending a text message and not seeing it in your chat until you close and reopen the app.
**Fix:** Add the message to the screen immediately (optimistic update) while the server confirms in the background.

**Issue 6 (Medium): Slow permission check on every message**
Every time feedback is inserted, the database runs a join across two tables to verify permissions. Without the right index, this gets slower as data grows — like a security guard who checks every visitor against a paper list instead of a quick-lookup computer system.
**Fix:** Ensure a composite database index exists on the columns being checked, so the lookup stays fast.

**Issue 7 (Medium): Timezone confusion in relative times**
"5 minutes ago" calculations might be wrong if the timestamp doesn't include timezone info. The app could show "just now" for something that happened hours ago — like a clock that doesn't account for daylight savings.
**Fix:** Ensure all timestamps include timezone information, or normalize them before calculating relative time.

**Issue 8 (Medium): Unused parameter in navigation**
The `clientId` is included in the URL when navigating to workout-detail, but the screen never reads it. It's dead weight — like writing your phone number on a form that nobody ever calls.
**Fix:** Either use the parameter for something useful (like an extra permission check) or stop passing it.

**Issue 9 (Low): No edit or delete for feedback**
Once a trainer sends feedback, they can never fix a typo or remove it. It's permanently carved in stone — like writing in permanent marker on a whiteboard.
**Fix:** Add UPDATE/DELETE policies (and UI) if trainers should be able to edit their own feedback. Or accept it as intentional (append-only audit trail).

**Issue 10 (Low): Fragile empty-state check**
The code checks if workout details are "empty" by testing if a string is falsy (empty string). This is technically correct but brittle — could break if the default value changes. Like balancing a book on a pencil tip — works now but easily knocked over.
**Fix:** Use an explicit null/undefined check or a boolean flag instead of relying on empty string behavior.

**Note:** Supabase Preview check is failing — likely a migration issue that needs investigation before merge.

---

## Recurring Patterns

These issues appear across multiple PRs and should be addressed systematically:

### 1. Overly permissive RLS UPDATE policies (PRs #98, #105)

**Pattern:** Policies restrict which ROWS can be updated (`client_id = auth.uid()`) but not which COLUMNS. Supabase RLS cannot restrict columns natively.

**Systemic fix:** All client-facing mutations that should only change specific fields (status transitions, completions) must go through `SECURITY DEFINER` RPC functions that validate and update only the intended columns. Never expose raw `.update()` for state transitions.

**In simple terms:** RLS checks "is this your row?" but can't check "are you only changing the allowed columns?" It's like a bouncer who checks your ID at the door but doesn't stop you from going behind the bar once inside. The fix: for any action where users should only change specific fields, always use a dedicated server function (RPC) that only touches those fields.

### 2. Relying solely on RLS without application-level filtering (PRs #97, #98)

**Pattern:** Queries fetch broadly (no WHERE clause for ownership) and trust RLS to invisibly filter. This works for security but hurts performance and makes code unreadable.

**Systemic fix:** Always include explicit ownership filters in queries even when RLS is present. Defense in depth.

**In simple terms:** Queries fetch everything and trust the database security to filter out what you shouldn't see. It's secure, but wasteful — like ordering the entire menu and having the waiter remove dishes you're allergic to, instead of just ordering what you can eat. The fix: always filter in your query even when security rules exist. Belt AND suspenders.

### 3. Silent CI error suppression (PRs #99, #101)

**Pattern:** `|| true` and `2>/dev/null` on CI commands make failures invisible.

**Systemic fix:** Log warnings instead of swallowing errors. Add count guards for destructive operations.

**In simple terms:** CI scripts suppress all errors with "ignore failures" flags. When something actually breaks, there's no trace of what went wrong — like a smoke detector with dead batteries. The fix: log warnings instead of silencing errors, and add safety checks before destructive operations.
