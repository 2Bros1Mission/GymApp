# Issue #137 — My-Challenges Service Design

## Goal

Add the my-challenges service: 4 functions on `src/lib/challengeService.ts` that let clients view active challenges with computed progress fields, self-report progress on custom challenges, abandon challenges, and read history. Powers the "My Challenges" tab sub-view (#143).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `reportProgress` atomicity | Server RPC (`fn_report_progress`) | Read-validate-update-award-points is multi-step; row lock prevents double-completion race |
| Comeback fields scope | Streak challenges only | `longestStreak` is meaningless for non-streak types; avoids confusing semantics |
| Streak field source | `currentProgress` is the current streak | DB schema has no `current_streak`; the #133 trigger writes the streak count into `current_progress` via `calculate_streak()` |
| `abandonChallenge` style | Direct UPDATE with RLS | Single-statement; ownership enforced by existing policy (#130) |
| Function location | Extend `src/lib/challengeService.ts` | Pre-existing file marker (lines 39-41) flags #137 functions as planned additions |
| `userId` parameter | Reads take `userId`; mutations don't | Matches #136 pattern: RPCs read `auth.uid()` server-side |
| Points awarded | Inside RPC, platform challenges only | `challenges.source = 'platform'` gate; trainer challenges have `points = 0` already |

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260609120000_challenges_report_progress_rpc.sql` | `fn_report_progress(uuid, integer) returns jsonb` |
| Modify | `src/lib/challengeService.ts` | Add 4 exported functions + internal `computeDeadline` helper |
| Modify | `src/lib/__tests__/challengeService.test.ts` | Add `describe` blocks for the 4 functions |

## Service Functions

### 1. `getActiveChallenges(userId: string)`

Pure read. Returns one entry per active participation with computed UI fields.

```typescript
interface ActiveChallengeWithDetails {
  participant: ChallengeParticipant;
  challenge: Challenge;
  progressPercentage: number;
  timeRemaining: string | null;       // ISO 8601, null if no deadline
  isStreakBroken: boolean;
  streakComebackDiff: number | null;
}

export async function getActiveChallenges(
  userId: string
): Promise<ActiveChallengeWithDetails[]>
```

**Query:**
```typescript
sb.from('challenge_participants')
  .select('*, challenge:challenges(*)')
  .eq('user_id', userId)
  .eq('status', 'active');
```

**Computation per row:**
- `progressPercentage = Math.min(100, (currentProgress / targetValue) * 100)`
- `timeRemaining = computeDeadline(challenge.cadence, new Date(), challenge.endDate)`
- For `challenge.challengeType === 'streak'`:
  - `isStreakBroken = participant.longestStreak > participant.currentProgress`
  - `streakComebackDiff = participant.longestStreak - participant.currentProgress`
- Otherwise: `isStreakBroken = false`, `streakComebackDiff = null`

### 2. `abandonChallenge(challengeId: string)`

```typescript
interface AbandonResult {
  ok: boolean;
  error?: 'not_active' | 'unknown';
}

export async function abandonChallenge(challengeId: string): Promise<AbandonResult>
```

**Logic:** Single UPDATE. RLS enforces ownership; no userId parameter.
```typescript
const { data, error } = await sb
  .from('challenge_participants')
  .update({ status: 'abandoned' })
  .eq('challenge_id', challengeId)
  .eq('status', 'active')
  .select('id');

if (error) {
  console.error('abandonChallenge failed', error);
  return { ok: false, error: 'unknown' };
}
if (!data || data.length === 0) return { ok: false, error: 'not_active' };
return { ok: true };
```

Note: error codes are `'not_active'` (zero rows updated — already abandoned, completed, or never joined; also the path for an unauthenticated or cross-user attempt under RLS) and `'unknown'` (DB error, logged via `console.error`). The earlier `'not_found'` code was dropped because RLS makes the "row exists for some other user" case indistinguishable from "row does not exist" at the client.

### 3. `reportProgress(challengeId: string, value: number)`

```typescript
interface ReportResult {
  ok: boolean;
  newProgress?: number;
  completed?: boolean;
  error?: 'not_self_reported' | 'not_active' | 'invalid_value'
        | 'not_found' | 'unauthenticated' | 'unknown';
}

export async function reportProgress(
  challengeId: string,
  value: number
): Promise<ReportResult>
```

**Logic:** Single RPC call to `fn_report_progress`. Maps RPC's `{ ok, new_progress, completed, error }` jsonb response into the camelCase `ReportResult`.

### 4. `getChallengeHistory(userId: string, limit: number = 20)`

Pure read.

```typescript
export async function getChallengeHistory(
  userId: string,
  limit: number = 20
): Promise<(ChallengeParticipant & { challenge: Challenge })[]>
```

**Query:**
```typescript
sb.from('challenge_participants')
  .select('*, challenge:challenges(*)')
  .eq('user_id', userId)
  .in('status', ['completed', 'abandoned'])
  .order('completed_at', { ascending: false, nullsFirst: false })
  .limit(limit);
```

Returns mapped via `mapRowToParticipant`.

## Internal Helper: `computeDeadline`

Not exported. Lives in `challengeService.ts`. Returns ISO 8601 string or null.

```typescript
function computeDeadline(
  cadence: 'daily' | 'weekly' | 'monthly' | 'one_time',
  now: Date,
  endDate: string | null
): string | null
```

**4AM Sofia day boundary:**
- `daily`: next 4AM Europe/Sofia after `now`
- `weekly`: next Monday 4AM Europe/Sofia after `now`
- `monthly`: 1st of next month at 4AM Europe/Sofia
- `one_time`: returns `endDate` if set, else `null`

Implementation uses native `Date` arithmetic + manual timezone-offset math (Sofia is UTC+2 in winter, UTC+3 in summer EEST). No external date library required — the project doesn't bundle one.

## RPC Migration: `fn_report_progress`

**File:** `supabase/migrations/20260609120000_challenges_report_progress_rpc.sql`

**Signature:**
```sql
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

  -- Lock participant row to prevent double-completion race.
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

    -- Award points (platform challenges only — trainer challenges have 0 points).
    if v_challenge.source = 'platform' and v_challenge.points > 0 then
      update public.profiles
      set leaderboard_points = leaderboard_points + v_challenge.points,
          leaderboard_points_updated_at = now()
      where id = v_user_id;
    end if;

    -- Update completions_this_period for the cadence (custom challenges only — frequency/streak go through the trigger).
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

**Conventions:**
- `create or replace function` (matches #135 pattern)
- `security definer` — required for `profiles.leaderboard_points` write
- `set search_path = public` — prevents search-path injection
- jsonb return shape: `{ ok, new_progress?, completed?, error? }`

## Tests

Extend `src/lib/__tests__/challengeService.test.ts` using existing `mockQueue` and `mockRpc` patterns.

**`getActiveChallenges`:**
- Empty result → `[]`
- Streak challenge with `longestStreak > currentProgress` → `isStreakBroken: true`, correct diff
- Frequency challenge → `isStreakBroken: false`, `streakComebackDiff: null`
- Progress > target → `progressPercentage` capped at 100
- Daily challenge → `timeRemaining` is next 4AM Sofia
- One-time trainer challenge with `endDate` → `timeRemaining` equals endDate

**`abandonChallenge`:**
- Success → `{ ok: true }`
- Zero rows updated → `{ ok: false, error: 'not_active' }`
- DB error → `{ ok: false, error: 'unknown' }` (logged via `console.error`)

**`reportProgress`:**
- Successful in-progress update → `{ ok: true, newProgress: N, completed: false }`
- Successful completion → `{ ok: true, newProgress: target, completed: true }`
- Each error code (`not_self_reported`, `not_active`, `invalid_value`, `not_found`, `unauthenticated`) → propagated correctly
- Supabase RPC error → `{ ok: false, error: 'unknown' }`

**`getChallengeHistory`:**
- Empty → `[]`
- Default limit applied (20)
- Custom limit passed through
- Query filters on `status IN ('completed', 'abandoned')`

## What This Issue Does NOT Include

- Frontend My Challenges view — Issue #143
- Comeback card UI — Issue #143 consumes `isStreakBroken`/`streakComebackDiff` from this service
- Trigger-based progress updates — Issue #133 (already merged)
- Leaderboard service — Issue #138
- New columns on existing tables — uses what's already there

## Dependencies

- **#128** (core tables): `challenge_participants`, `challenges`, `user_challenge_state`
- **#129** (leaderboard columns): `profiles.leaderboard_points`, `profiles.leaderboard_points_updated_at`
- **#131** (TypeScript types): `Challenge`, `ChallengeParticipant`
- **#133** (progress trigger): sets `current_progress` for streak-type challenges
