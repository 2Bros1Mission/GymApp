# Trainer Challenge Service Implementation Plan (Issue #139)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the trainer-side challenge service — atomic create-with-participants RPC, guarded manual-progress RPC, template CRUD, and two aggregate read functions — in a new `src/lib/trainerChallengeService.ts`, fully tested.

**Architecture:** One migration adds two SECURITY DEFINER RPCs (`fn_create_trainer_challenge`, `fn_trainer_update_progress`). A new service file wraps them plus direct-table template CRUD and two joined reads. Row-validation helpers move to a shared `src/lib/rowGuards.ts` (extracted from `leaderboardService.ts` — do NOT refactor leaderboardService's own usage in this PR). `mapRowToChallenge` is exported from `challengeService.ts` and reused.

**Tech Stack:** TypeScript, Supabase JS client, PostgreSQL (plpgsql), Jest.

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-02-trainer-challenge-service-design.md`. Where this plan and the spec disagree, the spec governs.
- Migration filename: `supabase/migrations/20260702120000_trainer_challenge_rpcs.sql` (14-digit timestamp).
- Both RPCs: `language plpgsql`, `security definer`, `set search_path = public, pg_temp`, header comment with rationale, then `revoke all on function ... from public;` and `grant execute on function ... to authenticated;`.
- **Trainer challenge completion NEVER writes `profiles.leaderboard_points`.**
- Mutations never throw — they return `{ success: boolean; ...; error?: string }`. Queries throw generic strings; raw `PostgrestError` only to `console.error('[trainerChallengeService] <fn>:', error)`.
- Typed mutation error codes: `'not_a_trainer' | 'not_connected' | 'invalid_input' | 'invalid_value' | 'not_found' | 'not_allowed' | 'unknown'`.
- Client-side pre-validation mirrors RPC checks and runs BEFORE any network call; tests assert `mockRpc`/`mockQueries` untouched on rejection.
- No `supabase.auth.getSession()` anywhere. No `new Date("YYYY-MM-DD")` anywhere — date comparisons on ISO date strings use plain string comparison.
- Test fixtures are DB-shaped: snake_case keys, bare `'YYYY-MM-DD'` strings for date columns, explicit nulls.
- `p_value` in `fn_trainer_update_progress` is the ABSOLUTE new progress, not a delta.
- Participants per challenge: 1..50. `targetValue`, `customTargetValue`, progress `value`: integers, all `> 0` and `<= 100000`. Trainer challenges always store points = 0 (schema CHECK).
- Node PATH prefix for every shell command that runs node/npx:
  ```bash
  export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"
  ```
- Verification gates before PR: `npx tsc --noEmit`, `npx eslint .`, `npx jest --passWithNoTests`, `npx expo export --platform web` — all clean.

---

### Task 1: Types + shared row guards + mapper export

**Files:**
- Modify: `src/types/index.ts` — add 5 interfaces after the existing `TrainerChallengeTemplate` block
- Create: `src/lib/rowGuards.ts` — `asNumber` / `asString` moved from leaderboardService (copy, do not edit leaderboardService)
- Modify: `src/lib/challengeService.ts:51` — `function mapRowToChallenge` → `export function mapRowToChallenge`

**Interfaces:**
- Consumes: existing `Challenge`, `ChallengeParticipant`, `WorkoutCategory`, `TrainerChallengeTemplate` from `src/types/index.ts`.
- Produces: `CreateTrainerChallengeParams`, `SaveTemplateParams`, `TrainerChallengeWithProgress`, `TrainerClientProgress`, `TrainerChallengeDetail` (types); `asNumber(row, key): number`, `asString(row, key): string` from `src/lib/rowGuards.ts`; exported `mapRowToChallenge(row): Challenge` from `challengeService.ts`. Tasks 3–7 import all of these.

- [ ] **Step 1: Add the five types to `src/types/index.ts`**

Locate the existing `TrainerChallengeTemplate` interface (search for `interface TrainerChallengeTemplate`). Insert immediately AFTER its closing brace:

```typescript
export interface CreateTrainerChallengeParams {
  title: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  challengeType: 'frequency' | 'streak' | 'custom_auto' | 'custom_self_reported';
  targetValue: number;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  difficulty: 'easy' | 'medium' | 'hard';
  category?: WorkoutCategory;
  participants: { userId: string; customTargetValue?: number }[]; // 1..50
}

export interface SaveTemplateParams {
  title: string;
  challengeType: 'frequency' | 'streak' | 'custom';
  targetValue: number;
  category?: string;
  description?: string;
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

- [ ] **Step 2: Create `src/lib/rowGuards.ts`**

```typescript
// Runtime shape validation at the row-mapper boundary. Supabase rows are
// untyped until src/types/database.ts is regenerated (#162); blind `as`
// casts let renamed columns flow through as undefined (PR #161 D1).
export function asNumber(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}

export function asString(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}
```

Do NOT modify `src/lib/leaderboardService.ts` — its local copies stay until #163's dedup pass.

- [ ] **Step 3: Export the challenge mapper**

In `src/lib/challengeService.ts` line ~51, change:

```typescript
function mapRowToChallenge(row: Record<string, unknown>): Challenge {
```

to:

```typescript
export function mapRowToChallenge(row: Record<string, unknown>): Challenge {
```

No other change to that file.

- [ ] **Step 4: Type-check**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/rowGuards.ts src/lib/challengeService.ts
git commit -m "feat(types): add trainer challenge types, shared row guards, export challenge mapper (Issue #139)"
```

---

### Task 2: Migration — two RPCs

**Files:**
- Create: `supabase/migrations/20260702120000_trainer_challenge_rpcs.sql`

**Interfaces:**
- Consumes: `challenges`, `challenge_participants`, `trainer_clients`, `profiles` tables (all existing).
- Produces: `public.fn_create_trainer_challenge(p_title text, p_title_bg text, p_description text, p_description_bg text, p_challenge_type text, p_target_value integer, p_start_date date, p_end_date date, p_difficulty text, p_category text, p_participants jsonb) returns jsonb`; `public.fn_trainer_update_progress(p_challenge_id uuid, p_client_id uuid, p_value integer) returns jsonb`. Tasks 4–5 call these via `sb.rpc(...)`.

- [ ] **Step 1: Create the migration file with this exact content**

```sql
-- ============================================================
-- Issue #139 — trainer challenge RPCs
--
-- fn_create_trainer_challenge: atomic create of one trainer
-- challenge + N participant enrollments (ADR-005). Ownership is
-- derived from auth.uid(); every participant must be an ACTIVE
-- trainer_clients connection. All-or-nothing: any failure rolls
-- the challenge row back too. points is always stored as 0
-- (challenges_trainer_zero_points CHECK constraint).
--
-- fn_trainer_update_progress: guarded manual progress update for
-- custom_self_reported trainer challenges. p_value is the ABSOLUTE
-- new progress (idempotent on retry), clamped to target_value.
-- Completion sets status/completed_at but NEVER touches
-- profiles.leaderboard_points — the leaderboard is fed by platform
-- challenge completions only (see 20260602120000, #129 header).
--
-- search_path hardened with pg_temp per CVE-2018-1058, matching
-- every other SECURITY DEFINER function in the repo.
-- ============================================================

create or replace function public.fn_create_trainer_challenge(
  p_title text,
  p_title_bg text,
  p_description text,
  p_description_bg text,
  p_challenge_type text,
  p_target_value integer,
  p_start_date date,
  p_end_date date,
  p_difficulty text,
  p_category text,
  p_participants jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer uuid;
  v_challenge_id uuid;
  v_count integer;
  v_missing integer;
  v_bad_target integer;
begin
  v_trainer := auth.uid();

  if not exists (
    select 1 from public.profiles
    where id = v_trainer and role = 'trainer'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_trainer');
  end if;

  -- Null-safe validation (three-valued-logic-proof: every branch
  -- uses `is null or` so a NULL param cannot skip the guard).
  if p_title is null or char_length(trim(p_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_target_value is null or p_target_value <= 0 or p_target_value > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_start_date is null or p_end_date is null or p_end_date <= p_start_date then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_challenge_type is null or p_challenge_type not in
     ('frequency', 'streak', 'custom_auto', 'custom_self_reported') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_participants is null or jsonb_typeof(p_participants) != 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  v_count := jsonb_array_length(p_participants);
  if v_count < 1 or v_count > 50 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Every element must have a valid uuid userId; customTargetValue,
  -- when present, must be in (0, 100000].
  -- The `(e->>'userId')::uuid is null` cast is intentionally inside the
  -- guarded begin/exception block so a malformed (non-uuid) userId string
  -- raises an exception here and is caught, returning invalid_input instead
  -- of propagating a raw cast error to the caller.
  begin
    select count(*) into v_bad_target
    from jsonb_array_elements(p_participants) as e
    where (e->>'userId') is null or (e->>'userId')::uuid is null
       or (e ? 'customTargetValue') and (
            (e->>'customTargetValue')::integer <= 0
         or (e->>'customTargetValue')::integer > 100000
       );
  exception when others then
    -- non-uuid userId or non-integer customTargetValue
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end;
  if v_bad_target > 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Set-based connection check: every listed client must be an
  -- ACTIVE connection of this trainer. No per-client detail leaked.
  select count(*) into v_missing
  from jsonb_array_elements(p_participants) as e
  where not exists (
    select 1 from public.trainer_clients tc
    where tc.trainer_id = v_trainer
      and tc.client_id = (e->>'userId')::uuid
      and tc.status = 'active'
  );
  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'error', 'not_connected');
  end if;

  -- points is hard-zero for trainer challenges (challenges_trainer_zero_points CHECK); the leaderboard is platform-only.
  insert into public.challenges (
    source, creator_id, title, title_bg, description, description_bg,
    challenge_type, cadence, difficulty, target_value, points,
    category, status, start_date, end_date
  ) values (
    'trainer', v_trainer, trim(p_title), p_title_bg, p_description, p_description_bg,
    p_challenge_type, 'one_time', p_difficulty, p_target_value, 0,
    p_category, 'active', p_start_date, p_end_date
  ) returning id into v_challenge_id;

  insert into public.challenge_participants (
    challenge_id, user_id, source, status, current_progress,
    target_value, joined_at
  )
  select
    v_challenge_id,
    (e->>'userId')::uuid,
    'trainer_assigned',
    'active',
    0,
    coalesce((e->>'customTargetValue')::integer, p_target_value),
    now()
  from jsonb_array_elements(p_participants) as e;

  return jsonb_build_object('ok', true, 'challenge_id', v_challenge_id);
end;
$$;

revoke all on function public.fn_create_trainer_challenge(
  text, text, text, text, text, integer, date, date, text, text, jsonb
) from public;
grant execute on function public.fn_create_trainer_challenge(
  text, text, text, text, text, integer, date, date, text, text, jsonb
) to authenticated;

create or replace function public.fn_trainer_update_progress(
  p_challenge_id uuid,
  p_client_id uuid,
  p_value integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge record;
  v_participant record;
  v_new integer;
  v_completed boolean := false;
begin
  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Existence of others' challenges is not disclosed: wrong owner
  -- and wrong source both return not_found, not a permission error.
  if v_challenge.creator_id is distinct from auth.uid()
     or v_challenge.source != 'trainer' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_challenge.challenge_type != 'custom_self_reported' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if p_value is null or p_value <= 0 or p_value > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  select * into v_participant
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = p_client_id
    and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- p_value is the ABSOLUTE new progress (idempotent), clamped.
  v_new := least(p_value, v_participant.target_value);
  v_completed := v_new >= v_participant.target_value;

  update public.challenge_participants
  set current_progress = v_new,
      status = case when v_completed then 'completed' else status end,
      completed_at = case when v_completed then now() else completed_at end
  where id = v_participant.id;

  -- Deliberately NO profiles.leaderboard_points write here: trainer
  -- challenge points are display-only (spec, Design Decisions).

  return jsonb_build_object('ok', true, 'completed', v_completed);
end;
$$;

revoke all on function public.fn_trainer_update_progress(uuid, uuid, integer) from public;
grant execute on function public.fn_trainer_update_progress(uuid, uuid, integer) to authenticated;
```

- [ ] **Step 2: Verify shape**

Run:
```bash
grep -c "security definer" supabase/migrations/20260702120000_trainer_challenge_rpcs.sql
```
Expected: `2`

```bash
grep -c "set search_path = public, pg_temp" supabase/migrations/20260702120000_trainer_challenge_rpcs.sql
```
Expected: `2`

```bash
grep -c "revoke all on function" supabase/migrations/20260702120000_trainer_challenge_rpcs.sql
```
Expected: `2`

```bash
grep -c "leaderboard_points" supabase/migrations/20260702120000_trainer_challenge_rpcs.sql
```
Expected: `1` (the comment explaining why there is no write — no actual UPDATE).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702120000_trainer_challenge_rpcs.sql
git commit -m "feat(db): add trainer challenge create + manual progress RPCs (Issue #139)"
```

---

### Task 3: Service skeleton + template CRUD

**Files:**
- Create: `src/lib/trainerChallengeService.ts`
- Create: `src/lib/__tests__/trainerChallengeService.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`; `SaveTemplateParams`, `TrainerChallengeTemplate` from `../types`.
- Produces: `saveTrainerTemplate(trainerId: string, params: SaveTemplateParams): Promise<{ success: boolean; id?: string; error?: string }>`; `getTrainerTemplates(trainerId: string): Promise<TrainerChallengeTemplate[]>`; `deleteTrainerTemplate(templateId: string): Promise<{ error?: string }>`; the `sb` wrapper and test harness reused by Tasks 4–7.

- [ ] **Step 1: Write the failing tests (new file, includes the full harness)**

Create `src/lib/__tests__/trainerChallengeService.test.ts`:

```typescript
import {
  saveTrainerTemplate,
  getTrainerTemplates,
  deleteTrainerTemplate,
} from '../trainerChallengeService';

interface QueryRecord {
  table: string;
  select?: string;
  filters: { method: string; args: unknown[] }[];
}

const mockRpc = jest.fn();
const mockQueue: { data: unknown; error: unknown }[] = [];
const mockQueries: QueryRecord[] = [];

function mockMakeChain(table: string): unknown {
  const record: QueryRecord = { table, filters: [] };
  mockQueries.push(record);
  const chain: Record<string, unknown> = {};
  chain.select = (sel: string) => { record.select = sel; return chain; };
  chain.insert = (...args: unknown[]) => { record.filters.push({ method: 'insert', args }); return chain; };
  chain.delete = (...args: unknown[]) => { record.filters.push({ method: 'delete', args }); return chain; };
  chain.eq = (...args: unknown[]) => { record.filters.push({ method: 'eq', args }); return chain; };
  chain.in = (...args: unknown[]) => { record.filters.push({ method: 'in', args }); return chain; };
  chain.order = (...args: unknown[]) => { record.filters.push({ method: 'order', args }); return chain; };
  chain.limit = (...args: unknown[]) => { record.filters.push({ method: 'limit', args }); return chain; };
  chain.single = () => Promise.resolve(mockQueue.shift() ?? { data: null, error: null });
  chain.maybeSingle = () => Promise.resolve(mockQueue.shift() ?? { data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(mockQueue.shift() ?? { data: null, error: null }).then(resolve);
  return chain;
}

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => mockMakeChain(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockQueue.length = 0;
  mockQueries.length = 0;
  mockRpc.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

// ─── saveTrainerTemplate ────────────────────────────────────────────────────

describe('saveTrainerTemplate', () => {
  const params = {
    title: 'Weekly Cardio Block',
    challengeType: 'frequency' as const,
    targetValue: 5,
    category: 'cardio',
    description: 'Five cardio sessions',
  };

  it('inserts the template and returns its id', async () => {
    mockQueue.push({ data: { id: 'tpl-1' }, error: null });
    const res = await saveTrainerTemplate('trainer-1', params);
    expect(res).toEqual({ success: true, id: 'tpl-1' });
    expect(mockQueries[0]).toMatchObject({
      table: 'trainer_challenge_templates',
      filters: [
        {
          method: 'insert',
          args: [{
            trainer_id: 'trainer-1',
            title: 'Weekly Cardio Block',
            challenge_type: 'frequency',
            target_value: 5,
            category: 'cardio',
            description: 'Five cardio sessions',
          }],
        },
      ],
    });
  });

  it.each(['', '   '])('rejects empty title %p before any network call', async (bad) => {
    const res = await saveTrainerTemplate('trainer-1', { ...params, title: bad });
    expect(res).toEqual({ success: false, error: 'invalid_input' });
    expect(mockQueries).toHaveLength(0);
  });

  it.each([0, -1, 100001, 1.5, NaN])('rejects targetValue %p before any network call', async (bad) => {
    const res = await saveTrainerTemplate('trainer-1', { ...params, targetValue: bad });
    expect(res).toEqual({ success: false, error: 'invalid_input' });
    expect(mockQueries).toHaveLength(0);
  });

  it('returns unknown on PostgrestError and logs the raw error', async () => {
    const raw = { message: 'rls violation', code: '42501' };
    mockQueue.push({ data: null, error: raw });
    const res = await saveTrainerTemplate('trainer-1', params);
    expect(res).toEqual({ success: false, error: 'unknown' });
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[trainerChallengeService] saveTrainerTemplate:');
    expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
  });
});

// ─── getTrainerTemplates ────────────────────────────────────────────────────

describe('getTrainerTemplates', () => {
  it('returns own templates sorted newest first', async () => {
    mockQueue.push({
      data: [
        { id: 'tpl-2', trainer_id: 'trainer-1', title: 'B', challenge_type: 'streak', target_value: 7, category: null, description: null, created_at: '2026-07-01T10:00:00Z' },
        { id: 'tpl-1', trainer_id: 'trainer-1', title: 'A', challenge_type: 'frequency', target_value: 5, category: 'cardio', description: 'x', created_at: '2026-06-30T10:00:00Z' },
      ],
      error: null,
    });
    const out = await getTrainerTemplates('trainer-1');
    expect(out).toEqual([
      { id: 'tpl-2', trainerId: 'trainer-1', title: 'B', challengeType: 'streak', targetValue: 7, category: null, description: null, createdAt: '2026-07-01T10:00:00Z' },
      { id: 'tpl-1', trainerId: 'trainer-1', title: 'A', challengeType: 'frequency', targetValue: 5, category: 'cardio', description: 'x', createdAt: '2026-06-30T10:00:00Z' },
    ]);
    expect(mockQueries[0]).toMatchObject({
      table: 'trainer_challenge_templates',
      filters: [
        { method: 'eq', args: ['trainer_id', 'trainer-1'] },
        { method: 'order', args: ['created_at', { ascending: false }] },
      ],
    });
  });

  it('returns an empty array when there are no templates', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(getTrainerTemplates('trainer-1')).resolves.toEqual([]);
  });

  it('throws a generic message on PostgrestError', async () => {
    mockQueue.push({ data: null, error: { message: 'boom', code: '08000' } });
    await expect(getTrainerTemplates('trainer-1')).rejects.toThrow('Failed to load templates');
  });
});

// ─── deleteTrainerTemplate ──────────────────────────────────────────────────

describe('deleteTrainerTemplate', () => {
  it('deletes and returns {} when a row was removed', async () => {
    mockQueue.push({ data: [{ id: 'tpl-1' }], error: null });
    await expect(deleteTrainerTemplate('tpl-1')).resolves.toEqual({});
    expect(mockQueries[0]).toMatchObject({
      table: 'trainer_challenge_templates',
      filters: [
        { method: 'delete', args: [] },
        { method: 'eq', args: ['id', 'tpl-1'] },
      ],
    });
  });

  it('returns not_found when zero rows were removed (RLS or missing id)', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(deleteTrainerTemplate('tpl-x')).resolves.toEqual({ error: 'not_found' });
  });

  it('returns the generic error string on PostgrestError', async () => {
    mockQueue.push({ data: null, error: { message: 'boom', code: '08000' } });
    await expect(deleteTrainerTemplate('tpl-1')).resolves.toEqual({ error: 'unknown' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts
```
Expected: FAIL with `Cannot find module '../trainerChallengeService'`.

- [ ] **Step 3: Create the service file with the wrapper + template trio**

Create `src/lib/trainerChallengeService.ts`:

```typescript
import { supabase } from './supabase';
import { asNumber, asString } from './rowGuards';
import type {
  SaveTemplateParams,
  TrainerChallengeTemplate,
} from '../types';

// The generated Database type predates the challenge tables; until it's
// regenerated (#162), work through an untyped view. Row shapes are
// validated at the mapper boundary (rowGuards).
type SupabaseClient = typeof supabase;
type SupabaseFrom = SupabaseClient['from'];
type SupabaseRpc = SupabaseClient['rpc'];
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<SupabaseFrom>;
  rpc: (fn: string, args?: Record<string, unknown>) => ReturnType<SupabaseRpc>;
};

// ─── Row → domain mappers ────────────────────────────────────────────────────

function mapRowToTemplate(row: Record<string, unknown>): TrainerChallengeTemplate {
  return {
    id: asString(row, 'id'),
    trainerId: asString(row, 'trainer_id'),
    title: asString(row, 'title'),
    challengeType: asString(row, 'challenge_type') as TrainerChallengeTemplate['challengeType'],
    targetValue: asNumber(row, 'target_value'),
    category: (row.category as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: asString(row, 'created_at'),
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function saveTrainerTemplate(
  trainerId: string,
  params: SaveTemplateParams,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (typeof trainerId !== 'string' || trainerId.trim().length === 0) {
    return { success: false, error: 'invalid_input' };
  }
  if (params.title.trim().length === 0) {
    return { success: false, error: 'invalid_input' };
  }
  if (!Number.isInteger(params.targetValue) || params.targetValue <= 0 || params.targetValue > 100000) {
    return { success: false, error: 'invalid_input' };
  }
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .insert({
      trainer_id: trainerId,
      title: params.title.trim(),
      challenge_type: params.challengeType,
      target_value: params.targetValue,
      category: params.category ?? null,
      description: params.description ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[trainerChallengeService] saveTrainerTemplate:', error);
    return { success: false, error: 'unknown' };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function getTrainerTemplates(
  trainerId: string,
): Promise<TrainerChallengeTemplate[]> {
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .select('id, trainer_id, title, challenge_type, target_value, category, description, created_at')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[trainerChallengeService] getTrainerTemplates:', error);
    throw new Error('Failed to load templates');
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToTemplate(r));
}

export async function deleteTrainerTemplate(
  templateId: string,
): Promise<{ error?: string }> {
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .delete()
    .eq('id', templateId)
    .select('id');
  if (error) {
    console.error('[trainerChallengeService] deleteTrainerTemplate:', error);
    return { error: 'unknown' };
  }
  if (!data || (data as unknown[]).length === 0) {
    return { error: 'not_found' };
  }
  return {};
}
```

Note on the insert test expectation: the mock chain records `insert` args, then `.select('id').single()` resolves from the queue — the harness in Step 1 supports this because `select` just records and `single()` shifts the queue.

- [ ] **Step 4: Run to confirm pass**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts
```
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check, then commit**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit
git add src/lib/trainerChallengeService.ts src/lib/__tests__/trainerChallengeService.test.ts
git commit -m "feat(service): add trainerChallengeService template CRUD (Issue #139)"
```

---

### Task 4: `createTrainerChallenge`

**Files:**
- Modify: `src/lib/trainerChallengeService.ts` — append function + import `CreateTrainerChallengeParams`
- Modify: `src/lib/__tests__/trainerChallengeService.test.ts` — new describe block + import

**Interfaces:**
- Consumes: `fn_create_trainer_challenge` RPC (Task 2), `CreateTrainerChallengeParams` (Task 1), `sb`/harness (Task 3).
- Produces: `createTrainerChallenge(params): Promise<{ success: boolean; challengeId?: string; error?: string }>`.

- [ ] **Step 1: Write the failing tests**

Add `createTrainerChallenge` to the test file import, then append:

```typescript
// ─── createTrainerChallenge ─────────────────────────────────────────────────

describe('createTrainerChallenge', () => {
  const valid = {
    title: 'Team Push Week',
    titleBg: 'Тимова седмица',
    description: 'Push hard',
    descriptionBg: undefined,
    challengeType: 'custom_self_reported' as const,
    targetValue: 10,
    startDate: '2026-07-06',
    endDate: '2026-07-13',
    difficulty: 'medium' as const,
    category: 'strength' as const,
    participants: [
      { userId: 'client-1' },
      { userId: 'client-2', customTargetValue: 15 },
    ],
  };

  it('calls the RPC with the full jsonb payload and returns the id', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, challenge_id: 'ch-9' }, error: null });
    const res = await createTrainerChallenge(valid);
    expect(res).toEqual({ success: true, challengeId: 'ch-9' });
    expect(mockRpc).toHaveBeenCalledWith('fn_create_trainer_challenge', {
      p_title: 'Team Push Week',
      p_title_bg: 'Тимова седмица',
      p_description: 'Push hard',
      p_description_bg: null,
      p_challenge_type: 'custom_self_reported',
      p_target_value: 10,
      p_start_date: '2026-07-06',
      p_end_date: '2026-07-13',
      p_difficulty: 'medium',
      p_category: 'strength',
      p_participants: [
        { userId: 'client-1' },
        { userId: 'client-2', customTargetValue: 15 },
      ],
    });
  });

  it.each([
    ['empty title', { ...valid, title: '  ' }],
    ['zero target', { ...valid, targetValue: 0 }],
    ['float target', { ...valid, targetValue: 2.5 }],
    ['oversize target', { ...valid, targetValue: 100001 }],
    ['end before start', { ...valid, endDate: '2026-07-01' }],
    ['end equals start', { ...valid, endDate: '2026-07-06' }],
    ['no participants', { ...valid, participants: [] }],
    ['51 participants', { ...valid, participants: Array.from({ length: 51 }, (_, i) => ({ userId: `c-${i}` })) }],
    ['bad override', { ...valid, participants: [{ userId: 'c-1', customTargetValue: 0 }] }],
  ])('rejects %s before any network call', async (_label, bad) => {
    const res = await createTrainerChallenge(bad);
    expect(res).toEqual({ success: false, error: 'invalid_input' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(['not_a_trainer', 'not_connected', 'invalid_input'])(
    'surfaces RPC error code %s',
    async (code) => {
      mockRpc.mockResolvedValue({ data: { ok: false, error: code }, error: null });
      const res = await createTrainerChallenge(valid);
      expect(res).toEqual({ success: false, error: code });
    },
  );

  it('returns unknown when the RPC itself errors', async () => {
    const raw = { message: 'function does not exist', code: '42883' };
    mockRpc.mockResolvedValue({ data: null, error: raw });
    const res = await createTrainerChallenge(valid);
    expect(res).toEqual({ success: false, error: 'unknown' });
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[trainerChallengeService] createTrainerChallenge:');
    expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts -t createTrainerChallenge
```
Expected: FAIL with `createTrainerChallenge is not a function`.

- [ ] **Step 3: Implement**

Extend the type import in `trainerChallengeService.ts`:

```typescript
import type {
  CreateTrainerChallengeParams,
  SaveTemplateParams,
  TrainerChallengeTemplate,
} from '../types';
```

Append after the templates section:

```typescript
// ─── Create ──────────────────────────────────────────────────────────────────

function isValidIntInRange(v: number, min: number, max: number): boolean {
  return Number.isInteger(v) && v >= min && v <= max;
}

export async function createTrainerChallenge(
  params: CreateTrainerChallengeParams,
): Promise<{ success: boolean; challengeId?: string; error?: string }> {
  // Mirrors fn_create_trainer_challenge's validation (S1): reject at
  // the boundary without a round-trip. Dates compare as ISO strings —
  // never new Date('YYYY-MM-DD') (UTC-midnight shift, PR #160).
  const invalid =
    params.title.trim().length === 0 ||
    !isValidIntInRange(params.targetValue, 1, 100000) ||
    params.endDate <= params.startDate ||
    params.participants.length < 1 ||
    params.participants.length > 50 ||
    params.participants.some(
      (p) =>
        p.userId.trim().length === 0 ||
        (p.customTargetValue !== undefined &&
          !isValidIntInRange(p.customTargetValue, 1, 100000)),
    );
  if (invalid) {
    return { success: false, error: 'invalid_input' };
  }

  const { data, error } = await sb.rpc('fn_create_trainer_challenge', {
    p_title: params.title,
    p_title_bg: params.titleBg ?? null,
    p_description: params.description ?? null,
    p_description_bg: params.descriptionBg ?? null,
    p_challenge_type: params.challengeType,
    p_target_value: params.targetValue,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_difficulty: params.difficulty,
    p_category: params.category ?? null,
    p_participants: params.participants,
  });
  if (error) {
    console.error('[trainerChallengeService] createTrainerChallenge:', error);
    return { success: false, error: 'unknown' };
  }
  const result = data as unknown as { ok?: boolean; error?: string; challenge_id?: string } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'unknown' };
  }
  return { success: true, challengeId: result.challenge_id };
}
```

- [ ] **Step 4: Run the full file, confirm pass**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts
```
Expected: PASS (~29 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trainerChallengeService.ts src/lib/__tests__/trainerChallengeService.test.ts
git commit -m "feat(service): add createTrainerChallenge via atomic RPC (Issue #139)"
```

---

### Task 5: `updateClientProgress`

**Files:**
- Modify: `src/lib/trainerChallengeService.ts` — append function
- Modify: `src/lib/__tests__/trainerChallengeService.test.ts` — new describe block + import

**Interfaces:**
- Consumes: `fn_trainer_update_progress` RPC (Task 2), `sb`/harness (Task 3).
- Produces: `updateClientProgress(challengeId: string, clientId: string, value: number): Promise<{ success: boolean; completed?: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing tests**

Add `updateClientProgress` to the import, append:

```typescript
// ─── updateClientProgress ───────────────────────────────────────────────────

describe('updateClientProgress', () => {
  it('calls the RPC and returns completed=false while below target', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, completed: false }, error: null });
    const res = await updateClientProgress('ch-1', 'client-1', 7);
    expect(res).toEqual({ success: true, completed: false });
    expect(mockRpc).toHaveBeenCalledWith('fn_trainer_update_progress', {
      p_challenge_id: 'ch-1',
      p_client_id: 'client-1',
      p_value: 7,
    });
  });

  it('returns completed=true when the RPC reports completion', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, completed: true }, error: null });
    const res = await updateClientProgress('ch-1', 'client-1', 10);
    expect(res).toEqual({ success: true, completed: true });
  });

  it.each([0, -3, 100001, 2.5, NaN, Infinity])(
    'rejects value %p before any network call',
    async (bad) => {
      const res = await updateClientProgress('ch-1', 'client-1', bad);
      expect(res).toEqual({ success: false, error: 'invalid_value' });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it.each(['not_found', 'not_allowed', 'invalid_value'])(
    'surfaces RPC error code %s',
    async (code) => {
      mockRpc.mockResolvedValue({ data: { ok: false, error: code }, error: null });
      const res = await updateClientProgress('ch-1', 'client-1', 5);
      expect(res).toEqual({ success: false, error: code });
    },
  );

  it('returns unknown when the RPC itself errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x', code: '08000' } });
    const res = await updateClientProgress('ch-1', 'client-1', 5);
    expect(res).toEqual({ success: false, error: 'unknown' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts -t updateClientProgress
```
Expected: FAIL with `updateClientProgress is not a function`.

- [ ] **Step 3: Implement**

Append to the service file:

```typescript
// ─── Manual progress (custom_self_reported only) ────────────────────────────

export async function updateClientProgress(
  challengeId: string,
  clientId: string,
  value: number,
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  if (!isValidIntInRange(value, 1, 100000)) {
    return { success: false, error: 'invalid_value' };
  }
  const { data, error } = await sb.rpc('fn_trainer_update_progress', {
    p_challenge_id: challengeId,
    p_client_id: clientId,
    p_value: value,
  });
  if (error) {
    console.error('[trainerChallengeService] updateClientProgress:', error);
    return { success: false, error: 'unknown' };
  }
  const result = data as unknown as { ok?: boolean; error?: string; completed?: boolean } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'unknown' };
  }
  return { success: true, completed: result.completed === true };
}
```

- [ ] **Step 4: Run the full file, confirm pass**

Expected: PASS (~40 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trainerChallengeService.ts src/lib/__tests__/trainerChallengeService.test.ts
git commit -m "feat(service): add updateClientProgress via guarded RPC (Issue #139)"
```

---

### Task 6: `getTrainerChallenges`

**Files:**
- Modify: `src/lib/trainerChallengeService.ts` — append function + imports
- Modify: `src/lib/__tests__/trainerChallengeService.test.ts` — new describe block + import

**Interfaces:**
- Consumes: exported `mapRowToChallenge` from `./challengeService` (Task 1), `TrainerChallengeWithProgress` (Task 1).
- Produces: `getTrainerChallenges(trainerId: string, status?: 'active' | 'completed'): Promise<TrainerChallengeWithProgress[]>`.

- [ ] **Step 1: Write the failing tests**

Add `getTrainerChallenges` to the import, append:

```typescript
// ─── getTrainerChallenges ───────────────────────────────────────────────────

const challengeRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  template_id: null,
  creator_id: 'trainer-1',
  source: 'trainer',
  title: `Challenge ${id}`,
  title_bg: null,
  description: null,
  description_bg: null,
  challenge_type: 'custom_self_reported',
  cadence: 'one_time',
  difficulty: 'medium',
  target_value: 10,
  points: 100,
  category: null,
  status: 'active',
  start_date: '2026-07-06',
  end_date: '2026-07-13',
  created_at: '2026-07-02T10:00:00Z',
  ...extra,
});

describe('getTrainerChallenges', () => {
  it('aggregates participant stats per challenge', async () => {
    mockQueue.push({
      data: [
        {
          ...challengeRow('ch-1'),
          challenge_participants: [
            { user_id: 'c-1', status: 'active', current_progress: 5, target_value: 10 },
            { user_id: 'c-2', status: 'completed', current_progress: 15, target_value: 15 },
          ],
        },
        {
          ...challengeRow('ch-2'),
          challenge_participants: [],
        },
      ],
      error: null,
    });
    const out = await getTrainerChallenges('trainer-1');
    expect(out).toHaveLength(2);
    expect(out[0].participantCount).toBe(2);
    expect(out[0].completedCount).toBe(1);
    expect(out[0].averageProgress).toBe(75); // (50% + 100%) / 2
    expect(out[0].challenge.id).toBe('ch-1');
    expect(out[1]).toMatchObject({ participantCount: 0, completedCount: 0, averageProgress: 0 });
    expect(mockQueries[0]).toMatchObject({
      table: 'challenges',
      filters: [
        { method: 'eq', args: ['creator_id', 'trainer-1'] },
        { method: 'eq', args: ['source', 'trainer'] },
        { method: 'order', args: ['created_at', { ascending: false }] },
      ],
    });
  });

  it('passes the status filter through', async () => {
    mockQueue.push({ data: [], error: null });
    await getTrainerChallenges('trainer-1', 'completed');
    expect(mockQueries[0].filters).toContainEqual({ method: 'eq', args: ['status', 'completed'] });
  });

  it('returns an empty array when the trainer has no challenges', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(getTrainerChallenges('trainer-1')).resolves.toEqual([]);
  });

  it('clamps per-participant progress at 100% in the average', async () => {
    mockQueue.push({
      data: [{
        ...challengeRow('ch-1'),
        challenge_participants: [
          { user_id: 'c-1', status: 'active', current_progress: 30, target_value: 10 },
        ],
      }],
      error: null,
    });
    const out = await getTrainerChallenges('trainer-1');
    expect(out[0].averageProgress).toBe(100);
  });

  it('throws a generic message on PostgrestError', async () => {
    mockQueue.push({ data: null, error: { message: 'boom', code: '08000' } });
    await expect(getTrainerChallenges('trainer-1')).rejects.toThrow('Failed to load trainer challenges');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL with `getTrainerChallenges is not a function`.

- [ ] **Step 3: Implement**

Add imports at the top of the service file:

```typescript
import { mapRowToChallenge } from './challengeService';
import type {
  CreateTrainerChallengeParams,
  SaveTemplateParams,
  TrainerChallengeTemplate,
  TrainerChallengeWithProgress,
} from '../types';
```

Append:

```typescript
// ─── Reads ───────────────────────────────────────────────────────────────────

interface ParticipantStatsRow {
  user_id: string;
  status: string;
  current_progress: number;
  target_value: number;
}

function participantPct(p: ParticipantStatsRow): number {
  if (p.target_value <= 0) return 0;
  return Math.min(100, Math.round((p.current_progress / p.target_value) * 100));
}

export async function getTrainerChallenges(
  trainerId: string,
  status?: 'active' | 'completed',
): Promise<TrainerChallengeWithProgress[]> {
  let query = sb
    .from('challenges')
    .select('*, challenge_participants(user_id, status, current_progress, target_value)')
    .eq('creator_id', trainerId)
    .eq('source', 'trainer');
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('[trainerChallengeService] getTrainerChallenges:', error);
    throw new Error('Failed to load trainer challenges');
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const participants = (row.challenge_participants as ParticipantStatsRow[] | null) ?? [];
    const completedCount = participants.filter((p) => p.status === 'completed').length;
    const averageProgress = participants.length === 0
      ? 0
      : Math.round(participants.reduce((sum, p) => sum + participantPct(p), 0) / participants.length);
    return {
      challenge: mapRowToChallenge(row),
      participantCount: participants.length,
      completedCount,
      averageProgress,
    };
  });
}
```

Note: the mock chain returns `chain` from `.eq()`, and the final `await query.order(...)` triggers `chain.then` — the harness handles the reassignment `query = query.eq(...)` transparently because every method returns the same chain object.

- [ ] **Step 4: Run the full file, confirm pass**

Expected: PASS (~45 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trainerChallengeService.ts src/lib/__tests__/trainerChallengeService.test.ts
git commit -m "feat(service): add getTrainerChallenges with aggregate stats (Issue #139)"
```

---

### Task 7: `getTrainerChallengeDetail`

**Files:**
- Modify: `src/lib/trainerChallengeService.ts` — append function + imports
- Modify: `src/lib/__tests__/trainerChallengeService.test.ts` — new describe block + import

**Interfaces:**
- Consumes: `mapRowToChallenge`, `asNumber`/`asString`, `TrainerChallengeDetail`, `TrainerClientProgress` (Task 1).
- Produces: `getTrainerChallengeDetail(trainerId: string, challengeId: string): Promise<TrainerChallengeDetail>`.

- [ ] **Step 1: Write the failing tests**

Add `getTrainerChallengeDetail` to the import, append:

```typescript
// ─── getTrainerChallengeDetail ──────────────────────────────────────────────

describe('getTrainerChallengeDetail', () => {
  it('returns the challenge with per-client progress', async () => {
    mockQueue.push({
      data: {
        ...challengeRow('ch-1'),
        challenge_participants: [
          {
            user_id: 'c-1', status: 'active', current_progress: 5, target_value: 10,
            profile: { name: 'Ivan' },
          },
          {
            user_id: 'c-2', status: 'completed', current_progress: 15, target_value: 15,
            profile: { name: 'Maria' },
          },
        ],
      },
      error: null,
    });
    const out = await getTrainerChallengeDetail('trainer-1', 'ch-1');
    expect(out.challenge.id).toBe('ch-1');
    expect(out.clients).toEqual([
      { userId: 'c-1', userName: 'Ivan', currentProgress: 5, targetValue: 10, progressPercentage: 50, status: 'active' },
      { userId: 'c-2', userName: 'Maria', currentProgress: 15, targetValue: 15, progressPercentage: 100, status: 'completed' },
    ]);
    expect(mockQueries[0]).toMatchObject({
      table: 'challenges',
      filters: [
        { method: 'eq', args: ['id', 'ch-1'] },
        { method: 'eq', args: ['creator_id', 'trainer-1'] },
        { method: 'eq', args: ['source', 'trainer'] },
      ],
    });
  });

  it('filters out participants whose profile join is null (R5)', async () => {
    mockQueue.push({
      data: {
        ...challengeRow('ch-1'),
        challenge_participants: [
          { user_id: 'c-1', status: 'active', current_progress: 5, target_value: 10, profile: null },
          { user_id: 'c-2', status: 'active', current_progress: 2, target_value: 10, profile: { name: 'Maria' } },
        ],
      },
      error: null,
    });
    const out = await getTrainerChallengeDetail('trainer-1', 'ch-1');
    expect(out.clients).toHaveLength(1);
    expect(out.clients[0].userName).toBe('Maria');
  });

  it('throws when the challenge is missing or not owned', async () => {
    mockQueue.push({ data: null, error: null });
    await expect(getTrainerChallengeDetail('trainer-1', 'ch-x')).rejects.toThrow('Failed to load challenge detail');
  });

  it('throws a generic message on PostgrestError', async () => {
    mockQueue.push({ data: null, error: { message: 'boom', code: '08000' } });
    await expect(getTrainerChallengeDetail('trainer-1', 'ch-1')).rejects.toThrow('Failed to load challenge detail');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL with `getTrainerChallengeDetail is not a function`.

- [ ] **Step 3: Implement**

Extend the type import with `TrainerChallengeDetail, TrainerClientProgress`. Append:

```typescript
export async function getTrainerChallengeDetail(
  trainerId: string,
  challengeId: string,
): Promise<TrainerChallengeDetail> {
  const { data, error } = await sb
    .from('challenges')
    .select('*, challenge_participants(user_id, status, current_progress, target_value, profile:profiles(name))')
    .eq('id', challengeId)
    .eq('creator_id', trainerId)
    .eq('source', 'trainer')
    .maybeSingle();
  if (error) {
    console.error('[trainerChallengeService] getTrainerChallengeDetail:', error);
    throw new Error('Failed to load challenge detail');
  }
  if (!data) {
    throw new Error('Failed to load challenge detail');
  }
  const row = data as Record<string, unknown>;
  const participants = (row.challenge_participants as Record<string, unknown>[] | null) ?? [];
  const clients: TrainerClientProgress[] = participants
    .filter((p) => p.profile != null) // R5: orphan joins are dropped, not fabricated
    .map((p) => {
      const target = asNumber(p, 'target_value');
      const progress = asNumber(p, 'current_progress');
      return {
        userId: asString(p, 'user_id'),
        userName: asString(p.profile as Record<string, unknown>, 'name'),
        currentProgress: progress,
        targetValue: target,
        progressPercentage: target <= 0 ? 0 : Math.min(100, Math.round((progress / target) * 100)),
        status: asString(p, 'status') as TrainerClientProgress['status'],
      };
    });
  return { challenge: mapRowToChallenge(row), clients };
}
```

- [ ] **Step 4: Run the full file, then the whole suite**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx jest src/lib/__tests__/trainerChallengeService.test.ts && npx jest --passWithNoTests
```
Expected: trainer file ~49 tests PASS; whole suite green (existing suites unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trainerChallengeService.ts src/lib/__tests__/trainerChallengeService.test.ts
git commit -m "feat(service): add getTrainerChallengeDetail with per-client progress (Issue #139)"
```

---

### Task 8: Verify, push, open PR, annotate issue

**Files:**
- No source changes.

**Interfaces:**
- Consumes: Tasks 1–7 committed on `feat/139-trainer-challenge-service`.
- Produces: PR against master; Issue #139 annotated.

- [ ] **Step 1: Full verification gates**

```bash
export PATH="/c/Users/GEORGI/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH" && npx tsc --noEmit && npx eslint . && npx jest --passWithNoTests && npx expo export --platform web
```
Expected: all clean, `Exported: dist` at the end.

- [ ] **Step 2: Run /security-review and /pr-review-toolkit:review-pr on the branch** (controller-level: the standard pre-PR ritual from quality_standards §5). Fix anything Critical/Important before pushing.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/139-trainer-challenge-service
```

PR body written to `.superpowers/sdd/pr-139-body.md` first:

```markdown
## Summary

- New `src/lib/trainerChallengeService.ts`: `createTrainerChallenge`, `updateClientProgress`, `saveTrainerTemplate`, `getTrainerTemplates`, `deleteTrainerTemplate`, `getTrainerChallenges`, `getTrainerChallengeDetail`.
- New migration `20260702120000_trainer_challenge_rpcs.sql`: `fn_create_trainer_challenge` (atomic challenge + N participants, ADR-005) and `fn_trainer_update_progress` (guarded manual progress, absolute semantics, idempotent). Both `security definer` + `search_path = public, pg_temp` + revoke/grant.
- **Trainer challenge completions never write `profiles.leaderboard_points`** — the leaderboard stays platform-only (design decision; prevents trainer-set point inflation).
- Shared `src/lib/rowGuards.ts` extracted (asNumber/asString) so the third service doesn't copy-paste runtime row validation; `mapRowToChallenge` exported from `challengeService.ts` and reused.
- Lessons applied from PR #160/#161/#164 reviews: no `getSession()`; `auth.uid()` ownership in RPCs; null-safe RPC validation; generic error strings; DB-shaped test fixtures; no `new Date("YYYY-MM-DD")`; new functions (no CREATE OR REPLACE signature hazards).

## New files
- `src/lib/trainerChallengeService.ts`
- `src/lib/__tests__/trainerChallengeService.test.ts` (~49 tests)
- `src/lib/rowGuards.ts`
- `supabase/migrations/20260702120000_trainer_challenge_rpcs.sql`
- `docs/superpowers/specs/2026-07-02-trainer-challenge-service-design.md`
- `docs/superpowers/plans/2026-07-02-trainer-challenge-service.md`

## Modified files
- `src/types/index.ts` — 5 new interfaces
- `src/lib/challengeService.ts` — `mapRowToChallenge` exported (one line)

## Test plan
- [x] `npx jest` — full suite green, new file ~49 tests, DB-shaped fixtures
- [x] `npx tsc --noEmit` / `npx eslint .` / `npx expo export --platform web` — clean
- [ ] Supabase preview applies the migration
- [ ] Manual: create challenge with 2 clients (one override) → both participant rows correct; update progress to target → completed, **leaderboard unchanged**; non-connected client → `not_connected`

Closes #139
```

```bash
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo 2Bros1Mission/GymApp --base master \
  --head feat/139-trainer-challenge-service \
  --title "feat(service): implement trainer challenge service (#139)" \
  --body-file .superpowers/sdd/pr-139-body.md
```

- [ ] **Step 4: Annotate Issue #139**

Prepend to the issue body (same `--body-file` prepend flow as #148): implemented per the spec; deviations — new file placement, `trainerId` dropped from mutation signatures (auth.uid() in RPCs), `ClientProgress` renamed `TrainerClientProgress` (name collision), no leaderboard points for trainer challenges.

---

## Self-Review Notes

**Spec coverage:** all 7 functions (Tasks 3–7), both RPCs (Task 2), 5 types + guards + mapper export (Task 1), no-leaderboard-points rule (Task 2 SQL + PR body), verification + ritual + PR + annotation (Task 8). Spec's acceptance criteria each map to a test or a grep check.

**Type consistency:** `TrainerClientProgress.status` uses `ChallengeParticipant['status']` (Task 1) and Task 7 casts to `TrainerClientProgress['status']` — same type. `isValidIntInRange` defined in Task 4, reused in Task 5. `challengeRow` fixture helper defined in Task 6, reused in Task 7. `participantPct` defined Task 6; Task 7 inlines its own clamp (different row shape — jsonb profile join) — acceptable, not verbatim duplication.

**Placeholder scan:** none. Every code step has complete code; every run step has command + expected output.
