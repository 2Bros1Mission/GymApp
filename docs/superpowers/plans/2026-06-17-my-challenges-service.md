# Issue #137 — My-Challenges Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 functions to the my-challenges service (`getActiveChallenges`, `abandonChallenge`, `reportProgress`, `getChallengeHistory`) backed by a new atomic RPC for progress reporting.

**Architecture:** Extends `src/lib/challengeService.ts` (created in #136). Three of the four functions are direct Supabase queries; `reportProgress` calls a new `fn_report_progress` RPC that handles read-validate-update-award-points atomically under a row lock. Internal `computeDeadline` helper computes 4AM Sofia day boundaries for each cadence.

**Tech Stack:** TypeScript, Supabase JS client, Jest, PostgreSQL (Supabase migration)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260609120000_challenges_report_progress_rpc.sql` | `fn_report_progress(uuid, integer) returns jsonb` — atomic completion handler |
| Modify | `src/lib/challengeService.ts` | Add `getActiveChallenges`, `abandonChallenge`, `reportProgress`, `getChallengeHistory`, internal `computeDeadline`, new exported types |
| Modify | `src/lib/__tests__/challengeService.test.ts` | New `describe` blocks for the 4 functions |

---

### Task 1: Confirm branch state

**Files:**
- None (git only)

- [ ] **Step 1: Verify branch and clean state**

```bash
git status
git log --oneline -3
```

Expected: on `feat/137-my-challenges-service`, last commit is the design spec, no uncommitted changes.

---

### Task 2: Write the RPC migration

**Files:**
- Create: `supabase/migrations/20260609120000_challenges_report_progress_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- Issue #137: fn_report_progress RPC
-- Atomic self-report progress handler for custom_self_reported
-- challenges. Locks the participant row, validates challenge type
-- and status, updates progress, awards points on completion
-- (platform challenges only), and bumps user_challenge_state
-- completions_this_period when a custom challenge completes.
--
-- Returns jsonb: { ok, new_progress?, completed?, error? }
-- Error codes: unauthenticated, invalid_value, not_found,
-- not_active, not_self_reported
-- ============================================================

create or replace function public.fn_report_progress(
  p_challenge_id uuid,
  p_value integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant record;
  v_challenge record;
  v_new_progress integer;
  v_completed boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  if p_value <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  -- Lock the participant row to prevent the double-click double-completion race.
  select * into v_participant
  from public.challenge_participants
  where user_id = v_user_id and challenge_id = p_challenge_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_participant.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if v_challenge.challenge_type != 'custom_self_reported' then
    return jsonb_build_object('ok', false, 'error', 'not_self_reported');
  end if;

  v_new_progress := least(v_participant.current_progress + p_value, v_participant.target_value);
  v_completed := v_new_progress >= v_participant.target_value;

  if v_completed then
    update public.challenge_participants
    set current_progress = v_new_progress,
        status = 'completed',
        completed_at = now()
    where id = v_participant.id;

    -- Award points only for platform challenges (trainer challenges have 0 points).
    if v_challenge.source = 'platform' and v_challenge.points > 0 then
      update public.profiles
      set leaderboard_points = leaderboard_points + v_challenge.points,
          leaderboard_points_updated_at = now()
      where id = v_user_id;
    end if;

    -- Bump completions_this_period for custom challenges (frequency/streak
    -- challenges go through the #133 trigger, which updates this on its own).
    if v_challenge.cadence in ('daily', 'weekly', 'monthly') then
      update public.user_challenge_state
      set completions_this_period = completions_this_period + 1
      where user_id = v_user_id and cadence = v_challenge.cadence;
    end if;
  else
    update public.challenge_participants
    set current_progress = v_new_progress
    where id = v_participant.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'new_progress', v_new_progress,
    'completed', v_completed
  );
end;
$$;
```

- [ ] **Step 2: Verify the file is well-formed SQL**

```bash
cat supabase/migrations/20260609120000_challenges_report_progress_rpc.sql | head -20
```

Expected: header comment + `create or replace function` declaration visible.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609120000_challenges_report_progress_rpc.sql
git commit -m "feat(db): add fn_report_progress RPC (Issue #137)

Atomic self-report progress handler for custom_self_reported
challenges. Row-locked transaction handles validate, update,
award points, and bump completions_this_period.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Add types and `computeDeadline` helper to challengeService.ts

**Files:**
- Modify: `src/lib/challengeService.ts`

- [ ] **Step 1: Add the new exported result types**

Insert after the existing `PickChallengeResult` interface (around line 272 — search for `export async function pickChallenge`):

```typescript
// ─── My-Challenges types (#137) ─────────────────────────────────────────────

export interface ActiveChallengeWithDetails {
  participant: ChallengeParticipant;
  challenge: Challenge;
  progressPercentage: number;
  /** ISO 8601 timestamp of the next deadline, or null if no deadline applies. */
  timeRemaining: string | null;
  isStreakBroken: boolean;
  /** Number of streak days lost vs. longest. Null for non-streak challenges. */
  streakComebackDiff: number | null;
}

export interface AbandonResult {
  ok: boolean;
  error?: 'not_found' | 'not_active';
}

export type ReportProgressError =
  | 'not_self_reported'
  | 'not_active'
  | 'invalid_value'
  | 'not_found'
  | 'unauthenticated'
  | 'unknown';

export interface ReportResult {
  ok: boolean;
  newProgress?: number;
  completed?: boolean;
  error?: ReportProgressError;
}
```

- [ ] **Step 2: Add the internal `computeDeadline` helper**

Insert just before the `// ─── My-Challenges types (#137) ───` block:

```typescript
// ─── Deadline computation (4AM Europe/Sofia boundary) ──────────────────────
//
// Returns the next deadline timestamp for a given cadence. Implementation
// uses native Date with manual Sofia offset math — Sofia is UTC+2 (EET)
// in winter and UTC+3 (EEST) in summer. We rely on Intl.DateTimeFormat
// for the offset rather than hardcoding DST rules.

function sofiaOffsetMinutes(at: Date): number {
  // Asia approach: format the moment in Sofia and compute UTC delta.
  const sofiaParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of sofiaParts) if (p.type !== 'literal') m[p.type] = p.value;
  // Reconstruct as if Sofia local time were UTC, then diff against the real UTC.
  const asIfUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour),
    Number(m.minute),
    Number(m.second)
  );
  return Math.round((asIfUtc - at.getTime()) / 60000);
}

function computeDeadline(
  cadence: 'daily' | 'weekly' | 'monthly' | 'one_time',
  now: Date,
  endDate: string | null
): string | null {
  if (cadence === 'one_time') return endDate;

  const offsetMin = sofiaOffsetMinutes(now);
  // Convert "now" into a virtual Sofia-local instant by shifting the UTC clock.
  const sofiaNow = new Date(now.getTime() + offsetMin * 60000);
  const sofiaYear = sofiaNow.getUTCFullYear();
  const sofiaMonth = sofiaNow.getUTCMonth();
  const sofiaDate = sofiaNow.getUTCDate();
  const sofiaHour = sofiaNow.getUTCHours();
  const sofiaDow = sofiaNow.getUTCDay(); // 0=Sun..6=Sat

  let target: Date;
  if (cadence === 'daily') {
    // Next 4AM Sofia. If we're past 4AM today, jump to tomorrow.
    const dayOffset = sofiaHour >= 4 ? 1 : 0;
    target = new Date(Date.UTC(sofiaYear, sofiaMonth, sofiaDate + dayOffset, 4, 0, 0));
  } else if (cadence === 'weekly') {
    // Next Monday 4AM Sofia. Monday = 1; if today is Monday after 4AM, jump 7 days.
    const daysUntilMonday = (8 - sofiaDow) % 7 || 7;
    const dayOffset = sofiaDow === 1 && sofiaHour < 4 ? 0 : daysUntilMonday;
    target = new Date(Date.UTC(sofiaYear, sofiaMonth, sofiaDate + dayOffset, 4, 0, 0));
  } else {
    // monthly: 1st of next month at 4AM Sofia.
    target = new Date(Date.UTC(sofiaYear, sofiaMonth + 1, 1, 4, 0, 0));
  }

  // Shift the Sofia-local target back to true UTC.
  return new Date(target.getTime() - offsetMin * 60000).toISOString();
}
```

- [ ] **Step 3: Update the TODO comment block**

Locate the comment around line 39-41 that reads:
```typescript
// TODO (future issues): #137 owns getActiveChallenges, abandonChallenge,
// reportProgress; #138 owns leaderboard reads; #139 owns trainer
// challenge writes. This file will accumulate them.
```

Replace with:
```typescript
// TODO (future issues): #138 owns leaderboard reads; #139 owns trainer
// challenge writes. This file will accumulate them.
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challengeService.ts
git commit -m "feat(service): add my-challenges types and computeDeadline helper (Issue #137)

Add ActiveChallengeWithDetails, AbandonResult, ReportResult types
and the internal computeDeadline helper that returns the next 4AM
Sofia deadline for daily/weekly/monthly cadences.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Implement `getActiveChallenges`

**Files:**
- Modify: `src/lib/challengeService.ts`

- [ ] **Step 1: Add the function**

Append at the end of `challengeService.ts`:

```typescript
// ─── My Challenges ──────────────────────────────────────────────────────────

/**
 * Returns the user's active challenges with derived UI fields
 * (progress %, deadline, streak-comeback signals). For streak-type
 * challenges, the trigger from #133 writes the current streak count
 * into `current_progress`, so `currentProgress` IS the current streak.
 *
 * Comeback fields are populated only for `challengeType === 'streak'`;
 * for frequency / custom types they are `false` / `null` because
 * `longestStreak` is not meaningful in those contexts.
 */
export async function getActiveChallenges(
  userId: string
): Promise<ActiveChallengeWithDetails[]> {
  const { data, error } = await sb
    .from('challenge_participants')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw new Error(error.message);

  const now = new Date();
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const participant = mapRowToParticipant(row);
    const challenge = participant.challenge;
    const progressPercentage = Math.min(
      100,
      (participant.currentProgress / participant.targetValue) * 100
    );
    const timeRemaining = computeDeadline(challenge.cadence, now, challenge.endDate);
    const isStreak = challenge.challengeType === 'streak';
    return {
      participant,
      challenge,
      progressPercentage,
      timeRemaining,
      isStreakBroken: isStreak
        ? participant.longestStreak > participant.currentProgress
        : false,
      streakComebackDiff: isStreak
        ? participant.longestStreak - participant.currentProgress
        : null,
    };
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Add tests**

Append to `src/lib/__tests__/challengeService.test.ts` (inside the existing test file, after the last `describe` block):

```typescript
describe('getActiveChallenges', () => {
  beforeEach(() => {
    mockQueue.length = 0;
    mockQueries.length = 0;
    mockRpc.mockReset();
  });

  it('returns empty array when user has no active challenges', async () => {
    mockQueue.push({ data: [], error: null });
    const result = await getActiveChallenges('user-1');
    expect(result).toEqual([]);
  });

  it('marks streak as broken when longestStreak > currentProgress', async () => {
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 2,
          longest_streak: 7,
          target_value: 10,
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          completed_at: null,
          source: 'discovery',
          created_at: '2026-01-01T00:00:00Z',
          challenge: {
            id: 'c1',
            template_id: 't1',
            creator_id: null,
            source: 'platform',
            title: 'Streak',
            title_bg: null,
            description: null,
            description_bg: null,
            challenge_type: 'streak',
            cadence: 'daily',
            difficulty: 'easy',
            target_value: 10,
            points: 50,
            category: null,
            status: 'active',
            start_date: '2026-01-01',
            end_date: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].isStreakBroken).toBe(true);
    expect(result[0].streakComebackDiff).toBe(5);
  });

  it('does not compute streak fields for frequency challenges', async () => {
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 1,
          longest_streak: 3,
          target_value: 5,
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          completed_at: null,
          source: 'discovery',
          created_at: '2026-01-01T00:00:00Z',
          challenge: {
            id: 'c1',
            template_id: 't1',
            creator_id: null,
            source: 'platform',
            title: 'Freq',
            title_bg: null,
            description: null,
            description_bg: null,
            challenge_type: 'frequency',
            cadence: 'weekly',
            difficulty: 'easy',
            target_value: 5,
            points: 30,
            category: null,
            status: 'active',
            start_date: '2026-01-01',
            end_date: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    expect(result[0].isStreakBroken).toBe(false);
    expect(result[0].streakComebackDiff).toBeNull();
  });

  it('caps progressPercentage at 100', async () => {
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 15,
          longest_streak: 0,
          target_value: 10,
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          completed_at: null,
          source: 'discovery',
          created_at: '2026-01-01T00:00:00Z',
          challenge: {
            id: 'c1',
            template_id: 't1',
            creator_id: null,
            source: 'platform',
            title: 'X',
            title_bg: null,
            description: null,
            description_bg: null,
            challenge_type: 'frequency',
            cadence: 'daily',
            difficulty: 'easy',
            target_value: 10,
            points: 10,
            category: null,
            status: 'active',
            start_date: '2026-01-01',
            end_date: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    expect(result[0].progressPercentage).toBe(100);
  });

  it('returns endDate as timeRemaining for one_time trainer challenge', async () => {
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 0,
          longest_streak: 0,
          target_value: 1,
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          completed_at: null,
          source: 'trainer_assigned',
          created_at: '2026-01-01T00:00:00Z',
          challenge: {
            id: 'c1',
            template_id: null,
            creator_id: 'trainer-1',
            source: 'trainer',
            title: 'One time',
            title_bg: null,
            description: null,
            description_bg: null,
            challenge_type: 'custom_self_reported',
            cadence: 'one_time',
            difficulty: null,
            target_value: 1,
            points: 0,
            category: null,
            status: 'active',
            start_date: '2026-01-01',
            end_date: '2026-12-31T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    expect(result[0].timeRemaining).toBe('2026-12-31T00:00:00Z');
  });
});
```

- [ ] **Step 4: Update test imports**

In the same file, find the top-of-file import block and add `getActiveChallenges` to it:

```typescript
import {
  pickChallenge,
  getUserChallengeState,
  getUserChallengeProgress,
  getDiscoveryPool,
  getActiveChallenges,
} from '../challengeService';
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/lib/__tests__/challengeService.test.ts -t getActiveChallenges
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/challengeService.ts src/lib/__tests__/challengeService.test.ts
git commit -m "feat(service): add getActiveChallenges (Issue #137)

Returns user's active challenges with progress %, deadline, and
streak-comeback signals. Streak fields populated only for
challengeType === 'streak'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Implement `abandonChallenge`

**Files:**
- Modify: `src/lib/challengeService.ts`

- [ ] **Step 1: Add the function**

Append to `challengeService.ts` after `getActiveChallenges`:

```typescript
/**
 * Marks an active participation as abandoned. Caller's identity is
 * enforced by RLS (#130); no userId parameter is taken — matches the
 * pickChallenge pattern. Returns `{ ok: false, error: 'not_active' }`
 * when zero rows match (already abandoned, completed, or never joined).
 */
export async function abandonChallenge(challengeId: string): Promise<AbandonResult> {
  const { data, error } = await sb
    .from('challenge_participants')
    .update({ status: 'abandoned' })
    .eq('challenge_id', challengeId)
    .eq('status', 'active')
    .select('id');

  if (error) return { ok: false, error: 'not_found' };
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return { ok: false, error: 'not_active' };
  return { ok: true };
}
```

- [ ] **Step 2: Extend test mock to support `update`**

In `src/lib/__tests__/challengeService.test.ts`, locate the `mockMakeChain` function. Add to the chain object (just after the existing `chain.eq` handler is set up):

```typescript
  chain.update = (..._args: unknown[]) => {
    record.filters.push({ method: 'update', args: _args });
    return chain;
  };
```

If a similar handler already exists, leave it as-is.

- [ ] **Step 3: Add tests**

Append to `src/lib/__tests__/challengeService.test.ts`:

```typescript
describe('abandonChallenge', () => {
  beforeEach(() => {
    mockQueue.length = 0;
    mockQueries.length = 0;
    mockRpc.mockReset();
  });

  it('returns ok when a row was updated', async () => {
    mockQueue.push({ data: [{ id: 'p1' }], error: null });
    const result = await abandonChallenge('c1');
    expect(result).toEqual({ ok: true });
  });

  it('returns not_active when no rows matched', async () => {
    mockQueue.push({ data: [], error: null });
    const result = await abandonChallenge('c1');
    expect(result).toEqual({ ok: false, error: 'not_active' });
  });

  it('returns not_found when the supabase call errors', async () => {
    mockQueue.push({ data: null, error: { message: 'boom' } });
    const result = await abandonChallenge('c1');
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});
```

- [ ] **Step 4: Update test imports**

Add `abandonChallenge` to the import block at the top of the test file:

```typescript
import {
  pickChallenge,
  getUserChallengeState,
  getUserChallengeProgress,
  getDiscoveryPool,
  getActiveChallenges,
  abandonChallenge,
} from '../challengeService';
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/lib/__tests__/challengeService.test.ts -t abandonChallenge
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/challengeService.ts src/lib/__tests__/challengeService.test.ts
git commit -m "feat(service): add abandonChallenge (Issue #137)

Marks active participation as abandoned via direct UPDATE through
RLS. Distinguishes not_active (zero rows) from not_found (DB error).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Implement `reportProgress`

**Files:**
- Modify: `src/lib/challengeService.ts`

- [ ] **Step 1: Add the function**

Append to `challengeService.ts` after `abandonChallenge`:

```typescript
/**
 * Reports incremental progress on a `custom_self_reported` challenge.
 * Calls `fn_report_progress` server-side — atomic transaction with row
 * lock prevents double-completion. Returns ReportResult with newProgress
 * (capped at target) and completed flag.
 */
export async function reportProgress(
  challengeId: string,
  value: number
): Promise<ReportResult> {
  const { data, error } = await sb.rpc('fn_report_progress', {
    p_challenge_id: challengeId,
    p_value: value,
  });

  if (error) {
    return { ok: false, error: 'unknown' };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: ReportProgressError;
    new_progress?: number;
    completed?: boolean;
  };

  if (result.ok) {
    return {
      ok: true,
      newProgress: result.new_progress,
      completed: result.completed,
    };
  }

  return { ok: false, error: result.error ?? 'unknown' };
}
```

- [ ] **Step 2: Add tests**

Append to `src/lib/__tests__/challengeService.test.ts`:

```typescript
describe('reportProgress', () => {
  beforeEach(() => {
    mockQueue.length = 0;
    mockQueries.length = 0;
    mockRpc.mockReset();
  });

  it('returns newProgress and completed=false for in-progress update', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, new_progress: 3, completed: false },
      error: null,
    });
    const result = await reportProgress('c1', 1);
    expect(result).toEqual({ ok: true, newProgress: 3, completed: false });
    expect(mockRpc).toHaveBeenCalledWith('fn_report_progress', {
      p_challenge_id: 'c1',
      p_value: 1,
    });
  });

  it('returns completed=true when the RPC reports completion', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, new_progress: 10, completed: true },
      error: null,
    });
    const result = await reportProgress('c1', 5);
    expect(result).toEqual({ ok: true, newProgress: 10, completed: true });
  });

  it.each([
    'not_self_reported',
    'not_active',
    'invalid_value',
    'not_found',
    'unauthenticated',
  ] as const)('propagates RPC error code: %s', async (err) => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, error: err }, error: null });
    const result = await reportProgress('c1', 1);
    expect(result).toEqual({ ok: false, error: err });
  });

  it('returns unknown when supabase RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const result = await reportProgress('c1', 1);
    expect(result).toEqual({ ok: false, error: 'unknown' });
  });
});
```

- [ ] **Step 3: Update test imports**

Add `reportProgress` to the import block:

```typescript
import {
  pickChallenge,
  getUserChallengeState,
  getUserChallengeProgress,
  getDiscoveryPool,
  getActiveChallenges,
  abandonChallenge,
  reportProgress,
} from '../challengeService';
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/__tests__/challengeService.test.ts -t reportProgress
```

Expected: 7 tests pass (2 success cases + 5 error cases via `it.each`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/challengeService.ts src/lib/__tests__/challengeService.test.ts
git commit -m "feat(service): add reportProgress (Issue #137)

Calls fn_report_progress RPC for atomic self-report updates.
Maps server jsonb response to camelCase ReportResult.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Implement `getChallengeHistory`

**Files:**
- Modify: `src/lib/challengeService.ts`

- [ ] **Step 1: Add the function**

Append to `challengeService.ts`:

```typescript
/**
 * Returns the user's completed and abandoned challenges, newest first.
 * Default limit 20; pass a different value for paginated history views.
 */
export async function getChallengeHistory(
  userId: string,
  limit: number = 20
): Promise<ChallengeParticipant[]> {
  const { data, error } = await sb
    .from('challenge_participants')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .in('status', ['completed', 'abandoned'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRowToParticipant);
}
```

- [ ] **Step 2: Add tests**

Append to `src/lib/__tests__/challengeService.test.ts`:

```typescript
describe('getChallengeHistory', () => {
  beforeEach(() => {
    mockQueue.length = 0;
    mockQueries.length = 0;
    mockRpc.mockReset();
  });

  it('returns empty array when user has no history', async () => {
    mockQueue.push({ data: [], error: null });
    const result = await getChallengeHistory('user-1');
    expect(result).toEqual([]);
  });

  it('uses default limit of 20', async () => {
    mockQueue.push({ data: [], error: null });
    await getChallengeHistory('user-1');
    const limitFilter = mockQueries[0].filters.find((f) => f.method === 'limit');
    expect(limitFilter?.args[0]).toBe(20);
  });

  it('passes through custom limit', async () => {
    mockQueue.push({ data: [], error: null });
    await getChallengeHistory('user-1', 50);
    const limitFilter = mockQueries[0].filters.find((f) => f.method === 'limit');
    expect(limitFilter?.args[0]).toBe(50);
  });

  it('filters status to completed and abandoned', async () => {
    mockQueue.push({ data: [], error: null });
    await getChallengeHistory('user-1');
    const inFilter = mockQueries[0].filters.find((f) => f.method === 'in');
    expect(inFilter?.args[0]).toBe('status');
    expect(inFilter?.args[1]).toEqual(['completed', 'abandoned']);
  });
});
```

- [ ] **Step 3: Update test imports**

Add `getChallengeHistory` to the import block:

```typescript
import {
  pickChallenge,
  getUserChallengeState,
  getUserChallengeProgress,
  getDiscoveryPool,
  getActiveChallenges,
  abandonChallenge,
  reportProgress,
  getChallengeHistory,
} from '../challengeService';
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/__tests__/challengeService.test.ts -t getChallengeHistory
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challengeService.ts src/lib/__tests__/challengeService.test.ts
git commit -m "feat(service): add getChallengeHistory (Issue #137)

Returns completed/abandoned participations ordered by completed_at desc.
Default limit 20.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Final validation

**Files:**
- Read all modified files

- [ ] **Step 1: Run the full challengeService test suite**

```bash
npx jest src/lib/__tests__/challengeService.test.ts
```

Expected: all existing tests + all new tests pass.

- [ ] **Step 2: Run TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run ESLint**

```bash
npx eslint . --max-warnings=0
```

Expected: 0 errors and 0 warnings.

- [ ] **Step 4: Verify all 4 new functions are exported**

```bash
grep -E "^export async function (getActiveChallenges|abandonChallenge|reportProgress|getChallengeHistory)" src/lib/challengeService.ts
```

Expected: 4 lines, one per function.

---

### Task 9: Push and open PR

**Files:**
- None (git only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/137-my-challenges-service
```

- [ ] **Step 2: Open PR**

```bash
GH_TOKEN="$GH_TOKEN" "/c/Program Files/GitHub CLI/gh.exe" pr create \
  --title "feat(service): implement my-challenges service (#137)" \
  --body "$(cat <<'EOF'
## Summary
- Add 4 functions to `src/lib/challengeService.ts`: `getActiveChallenges`, `abandonChallenge`, `reportProgress`, `getChallengeHistory`
- Add `fn_report_progress(uuid, integer)` RPC migration with row-lock for atomic self-report completion
- Internal `computeDeadline` helper computes 4AM Sofia day boundaries for each cadence
- Comeback fields (`isStreakBroken`, `streakComebackDiff`) scoped to streak challenges only
- Points awarded only for platform challenges (trainer challenges have 0 points by constraint)

## Test plan
- [ ] Migration applies cleanly on top of #136
- [ ] `getActiveChallenges` returns empty array when no active rows
- [ ] Streak challenge with `longestStreak > currentProgress` returns `isStreakBroken: true`
- [ ] Frequency challenge returns `isStreakBroken: false`, `streakComebackDiff: null`
- [ ] `progressPercentage` is capped at 100 when over target
- [ ] `timeRemaining` for `one_time` returns `challenge.endDate`
- [ ] `abandonChallenge` returns `{ok:true}` on success, `not_active` when no rows match
- [ ] `reportProgress` propagates all 5 error codes from the RPC
- [ ] `reportProgress` cannot double-complete under concurrent calls (row lock)
- [ ] `getChallengeHistory` orders by `completed_at DESC NULLS LAST`, applies default and custom limits
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint .` — 0 errors, 0 warnings
- [ ] `npx jest src/lib/__tests__/challengeService.test.ts` — all green

Closes #137

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify CI passes**

```bash
GH_TOKEN="$GH_TOKEN" "/c/Program Files/GitHub CLI/gh.exe" pr checks
```

Expected: all checks pass (Supabase Preview, Vercel, CI).
