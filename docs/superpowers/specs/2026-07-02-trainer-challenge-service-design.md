# Issue #139 — Trainer Challenge Service Design

## Goal

Implement the trainer-side challenge service: create challenges for connected clients (with per-client target overrides), list/inspect them with progress stats, manually update progress on self-reported challenges, and manage reusable templates. Ships end-to-end: two new SECURITY DEFINER RPCs for the multi-table/guarded writes, direct table access for the rest. Unblocks the Trainer Challenge Builder (#145) and Management (#146) screens.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File placement | New `src/lib/trainerChallengeService.ts` | Issue says "add to `challengeService.ts`", but that file is ~900 LOC. Same split precedent as #138 (`leaderboardService.ts`), which Aleksandar ratified by merging PR #161. |
| Leaderboard points | **Trainer challenge completions never award `profiles.leaderboard_points`** | The leaderboard migration (#129) documents points as "accumulated from platform challenge completions". Trainer-set point values are arbitrary (up to the cap); letting them feed the global leaderboard would let a friendly trainer boost a client to rank 1. Completion sets `status='completed'` + `completed_at`; the points value is display-only in trainer UI. |
| Multi-table create | RPC `fn_create_trainer_challenge` | 1 `challenges` row + N `challenge_participants` rows must be atomic (ADR-005). Ownership validation (all participants are active `trainer_clients` connections) happens inside the same transaction. |
| Manual progress update | RPC `fn_trainer_update_progress` | Guarded update (creator + challenge-type checks) with an atomic completion side-effect. Column-specific SECURITY DEFINER RPC per quality standard §1 (no open UPDATE policies). |
| Templates | Direct table access, no RPC | Single-table CRUD; `"Trainers manage own templates"` RLS (FOR ALL, from #130) enforces ownership. |
| Mutation auth | `auth.uid()` inside RPCs; **no `trainerId` param on mutations** | R2/S5 lesson from PR #160: never trust client-supplied identity for writes, never call `getSession()` client-side. `updateClientProgress(challengeId, clientId, value)` and `deleteTrainerTemplate(templateId)` drop the issue's `trainerId` parameter. |
| Query auth | Explicit `trainerId` param + `.eq()` filter, RLS backstop | Matches `getDiscoveryPool` / `getLeaderboardHistory` shape — defense-in-depth per quality standard §1. |
| Type naming | `TrainerClientProgress` (not the issue's `ClientProgress`) | The issue's name collides with the existing `ClientProgress` interface in `src/types/index.ts` (trainer progress dashboard). |
| Date handling | Date-only strings passed through; **no `new Date("YYYY-MM-DD")` anywhere** | PR #160 regression lesson: UTC-midnight parsing shifts dates in Europe/Sofia. `endDate > startDate` validated by ISO string comparison. |
| RPC hygiene | `security definer`, `set search_path = public, pg_temp`, `grant execute to authenticated`, `revoke from public` | Matches `fn_get_user_rank_info` (Aleksandar's PR #161 fix) — `pg_temp` per CVE-2018-1058; S4 note from PR #160. |
| Aggregates for list view | One joined query, aggregate in JS | Avoids N+1 (quality standard §2). Trainer challenges have ≤50 participants, so JS aggregation over the joined rows is cheap; no LATERAL needed. |
| Participants cap | 1–50 per challenge | Bounds the atomic insert and the jsonb payload; a trainer with more clients creates multiple challenges. |
| Points cap | `0..100000` at creation | Prevents integer-overflow paths (S2 lesson); points are display-only anyway per the leaderboard decision. |

## Public API — `src/lib/trainerChallengeService.ts`

### Types (added to `src/types/index.ts` next to existing challenge types)

```typescript
export interface CreateTrainerChallengeParams {
  title: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  challengeType: 'frequency' | 'streak' | 'custom_auto' | 'custom_self_reported';
  targetValue: number;
  startDate: string;   // 'YYYY-MM-DD'
  endDate: string;     // 'YYYY-MM-DD'
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;      // display-only reward, 0..100000
  category?: WorkoutCategory;
  participants: { userId: string; customTargetValue?: number }[]; // 1..50
}

export interface TrainerChallengeWithProgress {
  challenge: Challenge;
  participantCount: number;
  completedCount: number;
  averageProgress: number; // 0-100, rounded
}

export interface TrainerClientProgress {
  userId: string;
  userName: string;
  currentProgress: number;
  targetValue: number;
  progressPercentage: number; // 0-100, rounded, clamped
  status: ChallengeParticipant['status'];
}

export interface TrainerChallengeDetail {
  challenge: Challenge;
  clients: TrainerClientProgress[];
}
```

`TrainerChallengeTemplate` already exists (#131) — reused, not redefined. Note the existing type's `challengeType: 'frequency' | 'streak' | 'custom'` matches the `trainer_challenge_templates` table CHECK; templates are simplified configs, not full challenge types.

### Functions

```typescript
// Mutations — never throw
export async function createTrainerChallenge(
  params: CreateTrainerChallengeParams,
): Promise<{ success: boolean; challengeId?: string; error?: string }>;

export async function updateClientProgress(
  challengeId: string, clientId: string, value: number,
): Promise<{ success: boolean; completed?: boolean; error?: string }>;

export async function saveTrainerTemplate(
  trainerId: string, params: SaveTemplateParams,
): Promise<{ success: boolean; id?: string; error?: string }>;

export async function deleteTrainerTemplate(
  templateId: string,
): Promise<{ error?: string }>;

// Queries — throw generic strings on error
export async function getTrainerChallenges(
  trainerId: string, status?: 'active' | 'completed',
): Promise<TrainerChallengeWithProgress[]>;

export async function getTrainerChallengeDetail(
  trainerId: string, challengeId: string,
): Promise<TrainerChallengeDetail>;

export async function getTrainerTemplates(
  trainerId: string,
): Promise<TrainerChallengeTemplate[]>;
```

```typescript
export interface SaveTemplateParams {
  title: string;
  challengeType: 'frequency' | 'streak' | 'custom';
  targetValue: number;
  category?: string;
  description?: string;
}
```

**Template signature note:** `saveTrainerTemplate` keeps an explicit `trainerId` argument (unlike the RPC-backed mutations) because a direct INSERT must supply the `trainer_id` column, and the `with check (trainer_id = auth.uid())` RLS policy rejects any spoofed value server-side. This matches how `custom_workouts` CRUD works in `trainerService.ts` today. RLS is the enforcement; the parameter is plumbing, not trust. `deleteTrainerTemplate` needs no such parameter — the RLS `using` clause scopes the delete to own rows.

## New Migration — `supabase/migrations/20260702120000_trainer_challenge_rpcs.sql`

### `fn_create_trainer_challenge(...) returns jsonb`

Parameters: `p_title text, p_title_bg text, p_description text, p_description_bg text, p_challenge_type text, p_target_value integer, p_start_date date, p_end_date date, p_difficulty text, p_points integer, p_category text, p_participants jsonb`

Flow:
1. `v_trainer := auth.uid()`; reject if the profile row's `role != 'trainer'` → `'not_a_trainer'`.
2. Validate (null-safe, three-valued-logic-proof — S1):
   - `char_length(trim(p_title)) > 0` else `'invalid_input'`
   - `p_target_value` is not null and `> 0` and `<= 100000`
   - `p_points` is not null and `>= 0` and `<= 100000`
   - `p_end_date > p_start_date` (both not null)
   - `p_challenge_type in ('frequency','streak','custom_auto','custom_self_reported')`
   - `p_participants` is a jsonb array with `1 <= length <= 50`; every element has a `userId` uuid; `customTargetValue` when present is `> 0 and <= 100000`
3. Set-based connection check: every participant userId must have an `active` row in `trainer_clients` with `trainer_id = v_trainer` — if any is missing → `'not_connected'` (no per-client detail leaked).
4. Insert `challenges` (`source='trainer'`, `cadence='one_time'`, `creator_id=v_trainer`, `status='active'`, dates/category/points from params).
5. Insert `challenge_participants` per element: `source='trainer_assigned'`, `status='active'`, `current_progress=0`, `target_value=coalesce(customTargetValue, p_target_value)`, `joined_at=now()`.
6. Any error → whole transaction rolls back. Return `jsonb_build_object('ok', true, 'challenge_id', v_id)`.

### `fn_trainer_update_progress(p_challenge_id uuid, p_client_id uuid, p_value integer) returns jsonb`

Flow:
1. Load challenge; `not found` → `'not_found'` (explicit `if not found` guard — the #160 blocker-2 lesson).
2. `creator_id != auth.uid()` or `source != 'trainer'` → `'not_found'` (don't disclose existence of others' challenges).
3. `challenge_type != 'custom_self_reported'` → `'not_allowed'`.
4. `p_value is null or p_value <= 0 or p_value > 100000` → `'invalid_value'`.
5. Load participant row (`challenge_id`, `user_id = p_client_id`, `status = 'active'`); missing → `'not_found'`.
6. **Semantics: `p_value` is the absolute new progress value, not a delta** — the trainer types the client's current count into the UI (#146). `update ... set current_progress = least(p_value, target_value)`. Absolute semantics make the operation idempotent (safe on double-tap/retry), unlike the delta semantics of `fn_report_progress`.
7. If new `current_progress >= target_value`: `status='completed'`, `completed_at=now()`. **No `profiles.leaderboard_points` write.**
8. Return `jsonb_build_object('ok', true, 'completed', v_completed)`.

Both functions: `language plpgsql`, `security definer`, `set search_path = public, pg_temp`, header comment with rationale, `revoke all on function ... from public;` + `grant execute on function ... to authenticated;`. Signature discipline: these are NEW functions — no `CREATE OR REPLACE` signature-change hazards; if a later PR changes their signatures it must `DROP FUNCTION` first.

## Error Handling

- **Queries** throw generic strings: `'Failed to load trainer challenges'`, `'Failed to load challenge detail'`, `'Failed to load templates'`. Raw `PostgrestError` only to `console.error('[trainerChallengeService] <fn>:', error)` (S3).
- **Mutations** return `{ success: false, error }` — error codes: `'not_a_trainer' | 'not_connected' | 'invalid_input' | 'invalid_value' | 'not_found' | 'not_allowed' | 'unknown'`. RPC results unwrapped with the standard null-safe pattern.
- **Client-side pre-validation** mirrors the RPC checks (S1): runs before the network call, returns the same typed error codes, tested with `mockRpc`/`mockQueries` length-0 assertions.
- **Mapper boundary** validates runtime shape for critical fields (dates as strings, numbers as numbers) and throws `'malformed_row:<field>'` rather than blind `as`-casting (PR #161 D1 lesson).

## Testing

`src/lib/__tests__/trainerChallengeService.test.ts` — queue-based fluent-chain mock + `mockRpc`, mirroring `challengeService.test.ts`. **All fixtures DB-shaped** (snake_case keys, bare `'YYYY-MM-DD'` date strings, explicit nulls) — not TS-type-shaped (PR #161 fixture lesson).

| Function | Cases |
|---|---|
| `createTrainerChallenge` | happy path (RPC called with correct jsonb incl. overrides); each client-side validation rejection (empty title, 0/51 participants, bad dates via string compare, out-of-range target/points) with no RPC call; RPC error codes (`not_a_trainer`, `not_connected`, `invalid_input`) surfaced; RPC exception → `'unknown'` |
| `updateClientProgress` | happy (not completed); completion (`completed: true`); `invalid_value` client-side for null/NaN/0/negative/>100000 before network; RPC codes `not_found`/`not_allowed` surfaced |
| `saveTrainerTemplate` | happy; empty title rejected client-side; PostgrestError → `{success:false}` |
| `getTrainerTemplates` | happy sorted DESC; empty → `[]`; error → generic throw |
| `deleteTrainerTemplate` | happy; 0 rows deleted → `'not_found'`; error path |
| `getTrainerChallenges` | happy with aggregates (counts, completed, avg%); status filter passed; empty → `[]`; orphan participant rows ignored; error → generic throw |
| `getTrainerChallengeDetail` | happy with per-client rows; orphan profile join filtered (R5); percentage clamped 0–100; challenge not found → generic throw; error path |

Target ~40 tests. Verification gates before PR: `npx tsc --noEmit`, `npx eslint .`, `npx jest --passWithNoTests`, `npx expo export --platform web` — all clean.

## Affected Files

**New**
- `src/lib/trainerChallengeService.ts`
- `src/lib/__tests__/trainerChallengeService.test.ts`
- `supabase/migrations/20260702120000_trainer_challenge_rpcs.sql`
- `docs/superpowers/specs/2026-07-02-trainer-challenge-service-design.md` (this file)

**Modified**
- `src/types/index.ts` — add `CreateTrainerChallengeParams`, `SaveTemplateParams`, `TrainerChallengeWithProgress`, `TrainerClientProgress`, `TrainerChallengeDetail`

## Acceptance Criteria

- [ ] `createTrainerChallenge` atomically creates challenge + N participants with per-client overrides; rejects non-connected clients with `'not_connected'`
- [ ] `updateClientProgress` only succeeds for own `custom_self_reported` trainer challenges; sets absolute progress; auto-completes at target; **never writes `profiles.leaderboard_points`**
- [ ] Templates: save/list/delete with RLS-enforced ownership; 0-row delete → `'not_found'`
- [ ] `getTrainerChallenges` returns aggregates without N+1
- [ ] `getTrainerChallengeDetail` returns per-client progress with orphan joins filtered
- [ ] No `getSession()` calls; mutations derive trainer from `auth.uid()` in RPCs
- [ ] Both RPCs: `security definer`, `search_path = public, pg_temp`, `revoke from public`, `grant to authenticated`
- [ ] No `new Date("YYYY-MM-DD")` parsing anywhere in the service
- [ ] ~40 DB-shaped-fixture tests green; tsc/eslint/jest/expo export clean

## Out of Scope

- Battle pass tiers (explicitly v2 per issue).
- Trainer Builder (#145) and Management (#146) UI screens.
- Editing/deleting a live trainer challenge (not in issue steps; needs its own design for participant-progress implications).
- Awarding leaderboard points for trainer challenges — deliberately excluded (see Design Decisions).
- i18n strings (#147).

## References

- Issue #139; `Documentation/Gamification.md` §"Trainer Challenge Builder", "Per-Client Customization", "Templates"
- `supabase/migrations/20260601120000_challenges_core_tables.sql` — `trainer_challenge_templates`, participant `source` values
- `supabase/migrations/20260603120000_challenges_rls.sql` — trainer insert policies, template FOR ALL policy
- `supabase/migrations/20260629120000_leaderboard_user_rank_rpc.sql` — RPC style reference (Aleksandar)
- PR #160/#161/#164 review threads — R2/R5/S1/S2/S3/S4, date-parsing, fixture-shape, signature-change lessons
