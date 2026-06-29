# Issue #138 — Leaderboard Service Design

## Goal

Implement the read-only service layer that powers the Leaderboard sub-view (#144). Provides four functions: top-N standings, user's own rank with neighbor context, user's monthly history, and snapshot freshness. Reads from pre-computed `leaderboard_snapshot` and per-user `leaderboard_history` rows. No new migration, no new RPC — RLS does the authorization.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File placement | New `src/lib/leaderboardService.ts` | Issue #138 says "add to `challengeService.ts`", but that file is ~900 LOC after #137. Leaderboard concerns are distinct from challenge participation. Cleaner boundary; matches the "smaller well-bounded units" guidance. Issue body and `Gamification.md` §869 to be updated to reflect. |
| `getLeaderboardHistory` scope | **Own rows only** | Issue #138 body claims "top 3 per month + user's row". Conflicts with `Gamification.md` line 403/869 ("user's own final rank + points archived per month") **and** with `leaderboard_history` RLS (`"Users read own leaderboard history"` — `user_id = auth.uid()`). Picking own-rows-only preserves the design doc + the RLS contract; no migration, no SECURITY DEFINER RPC. Issue body to be updated. |
| Auth model | Parameterised `userId` + RLS | No `supabase.auth.getSession()` calls — that was the R2/S5 lesson from PR #160 (getSession reads local storage, breaks during token-refresh races, adds nothing on top of RLS). `userId` is a parameter; RLS on `leaderboard_history` enforces ownership. Belt-and-suspenders: app-level `.eq('user_id', userId)` on `getLeaderboardHistory` for defense-in-depth. |
| Error contract | Throw generic strings; raw `PostgrestError` to `console.error` only | Lesson S3 from PR #160 — don't leak RLS policy names / constraint names to UI. All four functions are queries (no mutations), so they throw on error and `useAsyncData` / `useFocusAsyncData` surface a generic message via `ErrorCard`. |
| `getUserRank` off-board branch | `rank: null, totalParticipants: 0, neighbors: []` | If a user has `profiles.leaderboard_points > 0` but isn't in the snapshot yet (between 30-min refreshes), we surface their points but no rank. UI shouldn't display "— / 273" — it should say "not on leaderboard yet". Returning `totalParticipants: 0` on the off-board path keeps the UI simple (single conditional on `rank === null`). |
| Neighbors window | `rank between max(1, r-2) and r+2`, exclude self | Single query, no JS-side filtering. Rank-1 user gets only "below"; last-rank user gets only "above". |
| Input validation | Accept `limit` in `1..1000` (get­Leaderboard) or `1..24` (getLeaderboardHistory); reject out-of-range with synchronous `throw new Error('invalid_limit')` — **do not silently clamp** | Validate at boundary before hitting DB. Mirrors S1 lesson from PR #160 (client-side validation for typed error contracts). Silent clamping hides caller bugs; throwing surfaces them. |

## Public API

### Types

`LeaderboardEntry` **already exists** in `src/types/index.ts:341` (shipped via #131). We reuse it and add two new sibling types in the same file (not in the service file) for consistency with the rest of the challenge types:

```typescript
// already in src/types/index.ts — DO NOT redefine
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  points: number;
  refreshedAt: string;
}

// to be added in src/types/index.ts next to LeaderboardEntry
export interface UserRankInfo {
  rank: number | null;            // null = not in snapshot
  points: number;                 // from snapshot if present, else profiles.leaderboard_points
  totalParticipants: number;      // count of snapshot rows; 0 if user off-board
  neighbors: LeaderboardEntry[];  // up to 2 above + 2 below; [] if off-board
}

export interface LeaderboardHistoryEntry {
  month: string;        // 'YYYY-MM'
  rank: number;
  points: number;
}
```

The service file imports all three from `../types`. The neighbor entries inherit `refreshedAt` from the snapshot row, so the field is populated naturally by `mapRowToEntry`.

### Functions

```typescript
export async function getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
export async function getUserRank(userId: string): Promise<UserRankInfo>;
export async function getLeaderboardHistory(userId: string, limit?: number): Promise<LeaderboardHistoryEntry[]>;
export async function getLeaderboardLastUpdated(): Promise<string | null>;
```

Defaults: `getLeaderboard(limit=100)`, `getLeaderboardHistory(limit=6)`.

## Implementation Strategy

| Function | Source | Query |
|---|---|---|
| `getLeaderboard` | `leaderboard_snapshot` | `select user_id, user_name, points, rank order by rank asc limit $1` |
| `getUserRank` | `leaderboard_snapshot` (on-board branch: own row + count + neighbors in parallel via `Promise.all`); `profiles.leaderboard_points` (off-board fallback) | See branching below |
| `getLeaderboardHistory` | `leaderboard_history` | `select month, final_rank, final_points where user_id = $1 order by month desc limit $2` |
| `getLeaderboardLastUpdated` | `leaderboard_snapshot` | `select refreshed_at order by refreshed_at desc limit 1` (cheaper than `max()` aggregate, and snapshot rows share one `refreshed_at` per cycle) |

### `getUserRank` branching

```text
1. Query leaderboard_snapshot WHERE user_id = $userId
   ├── hit  → in parallel: count(*) from snapshot, neighbors window
   │         return { rank, points, totalParticipants, neighbors }
   └── miss → query profiles.leaderboard_points WHERE id = $userId
              return { rank: null, points: profileRow.leaderboard_points ?? 0,
                       totalParticipants: 0, neighbors: [] }
```

Neighbors query: `select user_id, user_name, points, rank from leaderboard_snapshot where rank between greatest(1, $r - 2) and $r + 2 and user_id <> $userId order by rank asc`.

### Reference implementation skeleton

```typescript
export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('invalid_limit');
  }
  const { data, error } = await supabase
    .from('leaderboard_snapshot')
    .select('user_id, user_name, points, rank')
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leaderboardService] getLeaderboard:', error);
    throw new Error('Failed to load leaderboard');
  }
  return (data ?? []).map(mapRowToEntry);
}
```

`mapRowToEntry` is a local helper that converts snake_case DB columns to the camelCase `LeaderboardEntry` shape — mirrors `mapRowToParticipant` in `challengeService.ts`.

## Authorization

| Table | RLS | Service-side filter | Defense-in-depth? |
|-------|-----|---------------------|---|
| `leaderboard_snapshot` | Policy `"Anyone can read leaderboard"` — `select` for role `authenticated`, no row predicate | none needed | n/a — the snapshot is intentionally readable by every signed-in user; the migration that creates it (#130) sets `to authenticated` |
| `leaderboard_history` | `"Users read own"` (`user_id = auth.uid()`) | `.eq('user_id', userId)` | Yes — belt-and-suspenders per quality_standards.md §1 |
| `profiles` (fallback read) | existing policy | `.eq('id', userId)` for `leaderboard_points` only | Yes — minimum-column select |

No `getSession()` calls anywhere. No SECURITY DEFINER RPC needed. No new migration.

## Error Handling

All four functions follow the **query throw-on-error** pattern from `quality_standards.md` §3.

- On `PostgrestError`: `console.error('[leaderboardService] <fn>:', error)` then `throw new Error('Failed to ...')` with a generic message. **Raw error never reaches the UI** (S3 lesson).
- On invalid input: synchronous `throw new Error('invalid_limit')` / `throw new Error('invalid_user_id')` before the network call.
- Consumers integrate via `useAsyncData` / `useFocusAsyncData`; the surface-level `ErrorCard` renders the generic message with retry.

## Testing

**File:** `src/lib/__tests__/leaderboardService.test.ts` — same mocked-supabase scaffolding as `challengeService.test.ts`.

### Coverage matrix

| Function | Cases |
|---|---|
| `getLeaderboard` | (a) happy path returns sorted entries; (b) empty snapshot → `[]`; (c) `limit=1` and `limit=1000` boundaries; (d) `limit=0`/`limit=1001`/negative/non-integer → throws `'invalid_limit'`; (e) PostgrestError → throws generic, raw goes to `console.error` |
| `getUserRank` | (a) on-board mid-rank → rank + 4 neighbors; (b) rank 1 → only 2 below; (c) last rank → only 2 above; (d) on-board with single neighbor; (e) **off-board with points in profiles** → `{rank:null, points:N, totalParticipants:0, neighbors:[]}`; (f) off-board with no profile row → `{rank:null, points:0, ...}`; (g) PostgrestError on any parallel query → throws generic |
| `getLeaderboardHistory` | (a) happy path returns own months DESC; (b) no history → `[]`; (c) `limit` boundary; (d) empty `userId` → throws `'invalid_user_id'`; (e) PostgrestError → throws generic |
| `getLeaderboardLastUpdated` | (a) returns ISO string when snapshot has rows; (b) returns `null` on empty snapshot; (c) PostgrestError → throws generic |

Target ~25–30 tests, all deterministic. No real DB, no fake timers (no date math in this service).

### TDD order (will be enforced by writing-plans → TDD skill)

1. `getLeaderboard` happy path → green
2. `getLeaderboardLastUpdated` (simplest, two cases)
3. `getLeaderboardHistory`
4. `getUserRank` — most branches; build test-by-test from on-board mid → on-board edges → off-board fallback → off-board no-profile

## Affected Files

**New**
- `src/lib/leaderboardService.ts` — the four functions plus `mapRowToEntry` helper
- `src/lib/__tests__/leaderboardService.test.ts` — coverage matrix above

**Modified**
- `src/types/index.ts` — add `UserRankInfo` and `LeaderboardHistoryEntry` next to existing `LeaderboardEntry`
- `docs/superpowers/specs/2026-06-28-leaderboard-service-design.md` — this file (added)
- (Follow-up, not in this PR) `Documentation/Gamification.md` §869 service catalog — note that the leaderboard service lives in `leaderboardService.ts` and that history is own-rows-only
- (Follow-up, not in this PR) Issue #138 body — ratify own-rows-only history and the file-placement change

## Acceptance Criteria

- [ ] `getLeaderboard(limit?)` returns top N sorted by rank ascending, with `limit` clamped to 1..1000
- [ ] `getUserRank(userId)` returns rank + neighbors when in snapshot, `{rank:null, points:profilePoints, totalParticipants:0, neighbors:[]}` when off-board
- [ ] `getLeaderboardHistory(userId, limit?)` returns the user's own monthly history rows (RLS-enforced) sorted month DESC
- [ ] `getLeaderboardLastUpdated()` returns the latest `refreshed_at` or `null` on empty snapshot
- [ ] All errors throw generic strings; raw `PostgrestError` stays in `console.error`
- [ ] No `supabase.auth.getSession()` calls anywhere in the new file
- [ ] All four functions integrate cleanly with `useAsyncData` / `useFocusAsyncData`
- [ ] `npx tsc --noEmit` clean, `npx eslint .` clean, all new tests green

## Out of Scope

- The Leaderboard UI sub-view (#144) — separate issue.
- "Updated X min ago" string formatting — UI concern, not service.
- Tiebreaker enforcement at service layer — already baked into `refresh_leaderboard_snapshot()`'s ORDER BY (#135 / migration `20260606120000`).
- Realtime updates — leaderboard is pull-based (refresh on screen focus). See `Gamification.md` "No Realtime" note.
- Top-3-per-month historical view — explicitly out of scope per the spec-conflict resolution above. If product later wants this, it needs a separate issue + SECURITY DEFINER RPC + spec-doc update.

## References

- Issue #138 — Gamification: Implement leaderboard service
- `Documentation/Gamification.md` — Sections "Leaderboard", "Snapshot Refresh", "Monthly Reset", "Tiebreaker Rules"
- `docs/superpowers/specs/2026-05-23-leaderboard-tables-design.md` — Table & RLS contract (#129)
- `docs/superpowers/specs/2026-06-17-my-challenges-service-design.md` — Prior art (#137 / PR #160), error-contract patterns
- PR #160 review threads — R2/R5/S1/S3 lessons applied here
- `Documentation/pr-review-findings.md` and the project's `quality_standards.md` — Service-layer return contract, RLS defense-in-depth, error-leak prevention
