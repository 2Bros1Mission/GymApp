# Leaderboard Service Implementation Plan (Issue #138)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four read-only service-layer functions (`getLeaderboard`, `getUserRank`, `getLeaderboardHistory`, `getLeaderboardLastUpdated`) backed by `leaderboard_snapshot` / `leaderboard_history` / `profiles` with full unit-test coverage and no new migration.

**Architecture:** New file `src/lib/leaderboardService.ts` that imports `supabase` and three types from `../types`. All four functions are queries — they throw on error (generic message; raw `PostgrestError` to `console.error` only). No `getSession()` calls; `userId` is a parameter, RLS does ownership. Off-board `getUserRank` falls back to `profiles.leaderboard_points`.

**Tech Stack:** TypeScript, Supabase JS client, Jest. The mock harness mirrors `src/lib/__tests__/challengeService.test.ts` (queue-based fluent-chain mock — see Task 1 for the verbatim scaffolding to copy).

## Global Constraints

- File placement: service in `src/lib/leaderboardService.ts`; tests in `src/lib/__tests__/leaderboardService.test.ts`. No new migration.
- Reuse the existing `LeaderboardEntry` from `src/types/index.ts:341` — do **not** redefine it.
- `userId` parameter, **not** `supabase.auth.getSession()` — lesson R2/S5 from PR #160.
- Error throws use generic, non-leaking strings (`'Failed to load leaderboard'`, etc.) — lesson S3. Raw `PostgrestError` goes only to `console.error('[leaderboardService] <fn>:', error)`.
- Input validation throws synchronously **before** the network call: `'invalid_limit'` for out-of-range limits, `'invalid_user_id'` for empty/non-string userId. No silent clamping.
- `getLeaderboard` accepts `limit ∈ [1, 1000]` (default 100). `getLeaderboardHistory` accepts `limit ∈ [1, 24]` (default 6).
- Belt-and-suspenders on `leaderboard_history`: explicit `.eq('user_id', userId)` even though RLS enforces it.
- All four functions integrate with `useAsyncData<T>` / `useFocusAsyncData<T>` — they return arrays or single values, no `{success, data}` envelope.
- Verification commands: `npx tsc --noEmit`, `npx eslint .`, `npx jest src/lib/__tests__/leaderboardService.test.ts`. All three must be clean before opening the PR.
- Spec source of truth: `docs/superpowers/specs/2026-06-28-leaderboard-service-design.md`.

---

### Task 1: Skeleton + `getLeaderboard` happy path

**Files:**
- Create: `src/lib/leaderboardService.ts`
- Create: `src/lib/__tests__/leaderboardService.test.ts`

**Interfaces:**
- Consumes: existing `LeaderboardEntry` from `src/types/index.ts:341` (`{ rank, userId, userName, points, refreshedAt }`); `supabase` from `src/lib/supabase.ts`.
- Produces: `mapRowToEntry(row: Record<string, unknown>): LeaderboardEntry`, `getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>` (used by Tasks 2, 5, 6 via the neighbors query).

- [ ] **Step 1: Create the test file with the mock scaffolding**

Create `src/lib/__tests__/leaderboardService.test.ts`:

```typescript
import { getLeaderboard } from '../leaderboardService';

interface QueryRecord {
  table: string;
  select?: string;
  filters: { method: string; args: unknown[] }[];
}

const mockQueue: { data: unknown; error: unknown }[] = [];
const mockQueries: QueryRecord[] = [];

function mockMakeChain(table: string): unknown {
  const record: QueryRecord = { table, filters: [] };
  mockQueries.push(record);
  const chain: Record<string, unknown> = {};
  chain.select = (sel: string) => { record.select = sel; return chain; };
  chain.eq = (...args: unknown[]) => { record.filters.push({ method: 'eq', args }); return chain; };
  chain.gte = (...args: unknown[]) => { record.filters.push({ method: 'gte', args }); return chain; };
  chain.lte = (...args: unknown[]) => { record.filters.push({ method: 'lte', args }); return chain; };
  chain.order = (...args: unknown[]) => { record.filters.push({ method: 'order', args }); return chain; };
  chain.limit = (...args: unknown[]) => { record.filters.push({ method: 'limit', args }); return chain; };
  chain.maybeSingle = () =>
    Promise.resolve(mockQueue.shift() ?? { data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(mockQueue.shift() ?? { data: null, error: null }).then(resolve);
  return chain;
}

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => mockMakeChain(table),
  },
}));

beforeEach(() => {
  mockQueue.length = 0;
  mockQueries.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('getLeaderboard', () => {
  it('returns entries sorted by rank with the default limit of 100', async () => {
    mockQueue.push({
      data: [
        { rank: 1, user_id: 'u1', user_name: 'Alice', points: 500, refreshed_at: '2026-06-28T10:00:00Z' },
        { rank: 2, user_id: 'u2', user_name: 'Bob', points: 400, refreshed_at: '2026-06-28T10:00:00Z' },
      ],
      error: null,
    });

    const result = await getLeaderboard();

    expect(result).toEqual([
      { rank: 1, userId: 'u1', userName: 'Alice', points: 500, refreshedAt: '2026-06-28T10:00:00Z' },
      { rank: 2, userId: 'u2', userName: 'Bob', points: 400, refreshedAt: '2026-06-28T10:00:00Z' },
    ]);
    expect(mockQueries[0]).toMatchObject({
      table: 'leaderboard_snapshot',
      select: 'rank, user_id, user_name, points, refreshed_at',
      filters: [
        { method: 'order', args: ['rank', { ascending: true }] },
        { method: 'limit', args: [100] },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: FAIL with `Cannot find module '../leaderboardService'`.

- [ ] **Step 3: Create the service file with minimal implementation**

Create `src/lib/leaderboardService.ts`:

```typescript
import { supabase } from './supabase';
import type { LeaderboardEntry } from '../types';

// The generated Database type predates the leaderboard tables; until it's
// regenerated, work through an untyped view for these reads. Row-level
// shapes are validated at the mapper boundary (mapRowToEntry).
type SupabaseClient = typeof supabase;
type SupabaseFrom = SupabaseClient['from'];
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<SupabaseFrom>;
};

// ─── Row → domain mappers ────────────────────────────────────────────────────

function mapRowToEntry(row: Record<string, unknown>): LeaderboardEntry {
  return {
    rank: row.rank as number,
    userId: row.user_id as string,
    userName: row.user_name as string,
    points: row.points as number,
    refreshedAt: row.refreshed_at as string,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  const { data, error } = await sb
    .from('leaderboard_snapshot')
    .select('rank, user_id, user_name, points, refreshed_at')
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leaderboardService] getLeaderboard:', error);
    throw new Error('Failed to load leaderboard');
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToEntry(r));
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: PASS, 1 test.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): add leaderboardService.getLeaderboard (Issue #138)"
```

---

### Task 2: `getLeaderboard` edge cases (validation, empty, error)

**Files:**
- Modify: `src/lib/__tests__/leaderboardService.test.ts` — add five tests inside the existing `describe('getLeaderboard', ...)`.
- Modify: `src/lib/leaderboardService.ts` — add `limit` validation guard.

**Interfaces:**
- Consumes: same as Task 1.
- Produces: hardens existing `getLeaderboard`; same signature.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('getLeaderboard', ...)` in the test file:

```typescript
it('returns an empty array when the snapshot is empty', async () => {
  mockQueue.push({ data: [], error: null });
  await expect(getLeaderboard()).resolves.toEqual([]);
});

it('passes a custom limit through to the query', async () => {
  mockQueue.push({ data: [], error: null });
  await getLeaderboard(50);
  expect(mockQueries[0].filters).toContainEqual({ method: 'limit', args: [50] });
});

it.each([0, -1, 1001, 1.5, NaN, Infinity])(
  'throws invalid_limit when limit is %p',
  async (bad) => {
    await expect(getLeaderboard(bad)).rejects.toThrow('invalid_limit');
    expect(mockQueries).toHaveLength(0);
  }
);

it('throws a generic message and logs the raw error on PostgrestError', async () => {
  const raw = { message: 'policy "x" denied select on leaderboard_snapshot', code: '42501' };
  mockQueue.push({ data: null, error: raw });
  await expect(getLeaderboard()).rejects.toThrow('Failed to load leaderboard');
  expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[leaderboardService] getLeaderboard:');
  expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
});
```

- [ ] **Step 2: Run the tests to see exactly which fail**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: 1 passes (empty snapshot — already works); 1 passes (custom limit — already works); 6 cases of `invalid_limit` FAIL (no validation yet); the PostgrestError test PASSES (error throw + console.error already wired).

- [ ] **Step 3: Add the limit guard**

Replace the body of `getLeaderboard` in `src/lib/leaderboardService.ts` so the validation runs first:

```typescript
export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('invalid_limit');
  }
  const { data, error } = await sb
    .from('leaderboard_snapshot')
    .select('rank, user_id, user_name, points, refreshed_at')
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leaderboardService] getLeaderboard:', error);
    throw new Error('Failed to load leaderboard');
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToEntry(r));
}
```

- [ ] **Step 4: Run the tests to confirm all pass**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: PASS, all `getLeaderboard` tests green (≈9 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): harden getLeaderboard with limit validation and error contract (Issue #138)"
```

---

### Task 3: `getLeaderboardLastUpdated`

**Files:**
- Modify: `src/lib/__tests__/leaderboardService.test.ts` — new `describe` block.
- Modify: `src/lib/leaderboardService.ts` — append new function.

**Interfaces:**
- Consumes: `sb` wrapper from Task 1.
- Produces: `getLeaderboardLastUpdated(): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

Append to the test file (after the existing `describe('getLeaderboard', ...)` block):

```typescript
import { getLeaderboard, getLeaderboardLastUpdated } from '../leaderboardService';

describe('getLeaderboardLastUpdated', () => {
  it('returns the refreshed_at ISO string when the snapshot has rows', async () => {
    mockQueue.push({
      data: { refreshed_at: '2026-06-28T10:00:00Z' },
      error: null,
    });
    await expect(getLeaderboardLastUpdated()).resolves.toBe('2026-06-28T10:00:00Z');
    expect(mockQueries[0]).toMatchObject({
      table: 'leaderboard_snapshot',
      select: 'refreshed_at',
      filters: [
        { method: 'order', args: ['refreshed_at', { ascending: false }] },
        { method: 'limit', args: [1] },
      ],
    });
  });

  it('returns null when the snapshot is empty', async () => {
    mockQueue.push({ data: null, error: null });
    await expect(getLeaderboardLastUpdated()).resolves.toBeNull();
  });

  it('throws a generic message on PostgrestError', async () => {
    const raw = { message: 'connection failure', code: '08000' };
    mockQueue.push({ data: null, error: raw });
    await expect(getLeaderboardLastUpdated()).rejects.toThrow('Failed to load leaderboard freshness');
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[leaderboardService] getLeaderboardLastUpdated:');
  });
});
```

Replace the top-of-file import to match what now exists:

```typescript
import { getLeaderboard, getLeaderboardLastUpdated } from '../leaderboardService';
```

(Or use one import per `describe` — both work; pick whichever the file already does.)

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts -t getLeaderboardLastUpdated`

Expected: FAIL with `getLeaderboardLastUpdated is not a function`.

- [ ] **Step 3: Implement `getLeaderboardLastUpdated`**

Append to `src/lib/leaderboardService.ts`:

```typescript
export async function getLeaderboardLastUpdated(): Promise<string | null> {
  const { data, error } = await sb
    .from('leaderboard_snapshot')
    .select('refreshed_at')
    .order('refreshed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[leaderboardService] getLeaderboardLastUpdated:', error);
    throw new Error('Failed to load leaderboard freshness');
  }
  if (!data) return null;
  return (data as { refreshed_at: string }).refreshed_at;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: PASS, all tests (≈12 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): add getLeaderboardLastUpdated (Issue #138)"
```

---

### Task 4: `getLeaderboardHistory` + `LeaderboardHistoryEntry` type

**Files:**
- Modify: `src/types/index.ts` — add `LeaderboardHistoryEntry` next to `LeaderboardEntry`.
- Modify: `src/lib/__tests__/leaderboardService.test.ts` — new `describe` block.
- Modify: `src/lib/leaderboardService.ts` — append new function + new mapper.

**Interfaces:**
- Consumes: `LeaderboardHistoryEntry` (added in this task).
- Produces: `getLeaderboardHistory(userId: string, limit?: number): Promise<LeaderboardHistoryEntry[]>`, `mapRowToHistory(row): LeaderboardHistoryEntry`.

- [ ] **Step 1: Add the type to `src/types/index.ts`**

Insert immediately after the existing `LeaderboardEntry` (line 347):

```typescript
export interface LeaderboardHistoryEntry {
  month: string; // 'YYYY-MM'
  rank: number;
  points: number;
}
```

- [ ] **Step 2: Write the failing tests**

Append to the test file:

```typescript
import {
  getLeaderboard,
  getLeaderboardLastUpdated,
  getLeaderboardHistory,
} from '../leaderboardService';

describe('getLeaderboardHistory', () => {
  it('returns own monthly history sorted month DESC', async () => {
    mockQueue.push({
      data: [
        { month: '2026-05', final_rank: 7, final_points: 320 },
        { month: '2026-04', final_rank: 12, final_points: 280 },
      ],
      error: null,
    });
    const out = await getLeaderboardHistory('user-1');
    expect(out).toEqual([
      { month: '2026-05', rank: 7, points: 320 },
      { month: '2026-04', rank: 12, points: 280 },
    ]);
    expect(mockQueries[0]).toMatchObject({
      table: 'leaderboard_history',
      select: 'month, final_rank, final_points',
      filters: [
        { method: 'eq', args: ['user_id', 'user-1'] },
        { method: 'order', args: ['month', { ascending: false }] },
        { method: 'limit', args: [6] },
      ],
    });
  });

  it('returns an empty array when the user has no history', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(getLeaderboardHistory('user-1')).resolves.toEqual([]);
  });

  it('passes a custom limit through', async () => {
    mockQueue.push({ data: [], error: null });
    await getLeaderboardHistory('user-1', 12);
    expect(mockQueries[0].filters).toContainEqual({ method: 'limit', args: [12] });
  });

  it.each([0, -1, 25, 1.5, NaN, Infinity])(
    'throws invalid_limit when limit is %p',
    async (bad) => {
      await expect(getLeaderboardHistory('user-1', bad)).rejects.toThrow('invalid_limit');
      expect(mockQueries).toHaveLength(0);
    }
  );

  it.each(['', '   '])('throws invalid_user_id when userId is %p', async (bad) => {
    await expect(getLeaderboardHistory(bad)).rejects.toThrow('invalid_user_id');
    expect(mockQueries).toHaveLength(0);
  });

  it('throws a generic message on PostgrestError', async () => {
    const raw = { message: 'policy "y" denied', code: '42501' };
    mockQueue.push({ data: null, error: raw });
    await expect(getLeaderboardHistory('user-1')).rejects.toThrow('Failed to load leaderboard history');
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts -t getLeaderboardHistory`

Expected: FAIL with `getLeaderboardHistory is not a function`.

- [ ] **Step 4: Implement `getLeaderboardHistory`**

Update the type import block at the top of `src/lib/leaderboardService.ts`:

```typescript
import type { LeaderboardEntry, LeaderboardHistoryEntry } from '../types';
```

Add the mapper alongside `mapRowToEntry`:

```typescript
function mapRowToHistory(row: Record<string, unknown>): LeaderboardHistoryEntry {
  return {
    month: row.month as string,
    rank: row.final_rank as number,
    points: row.final_points as number,
  };
}
```

Append the function below `getLeaderboardLastUpdated`:

```typescript
export async function getLeaderboardHistory(
  userId: string,
  limit: number = 6,
): Promise<LeaderboardHistoryEntry[]> {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('invalid_user_id');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
    throw new Error('invalid_limit');
  }
  const { data, error } = await sb
    .from('leaderboard_history')
    .select('month, final_rank, final_points')
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[leaderboardService] getLeaderboardHistory:', error);
    throw new Error('Failed to load leaderboard history');
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToHistory(r));
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: PASS, all tests (≈22 total).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): add getLeaderboardHistory + LeaderboardHistoryEntry (Issue #138)"
```

---

### Task 5: `getUserRank` on-board branch + `UserRankInfo` type

**Files:**
- Modify: `src/types/index.ts` — add `UserRankInfo` next to `LeaderboardHistoryEntry`.
- Modify: `src/lib/__tests__/leaderboardService.test.ts` — new `describe` block (three on-board tests).
- Modify: `src/lib/leaderboardService.ts` — append `getUserRank` with on-board branch only; off-board comes in Task 6.

**Interfaces:**
- Consumes: existing `mapRowToEntry`, `LeaderboardEntry`, new `UserRankInfo`.
- Produces: `getUserRank(userId: string): Promise<UserRankInfo>` (on-board branch).

- [ ] **Step 1: Add the type to `src/types/index.ts`**

Append below `LeaderboardHistoryEntry`:

```typescript
export interface UserRankInfo {
  rank: number | null;            // null = not in snapshot
  points: number;                 // from snapshot if present, else profiles.leaderboard_points
  totalParticipants: number;      // count of snapshot rows; 0 if user off-board
  neighbors: LeaderboardEntry[];  // up to 2 above + 2 below; [] if off-board
}
```

- [ ] **Step 2: Write the failing on-board tests**

Append to the test file:

```typescript
import {
  getLeaderboard,
  getLeaderboardLastUpdated,
  getLeaderboardHistory,
  getUserRank,
} from '../leaderboardService';

describe('getUserRank — on-board', () => {
  it('returns rank, points, totalParticipants, and four neighbors for a mid-rank user', async () => {
    // Query 1: own snapshot row
    mockQueue.push({
      data: { rank: 5, user_id: 'u-me', user_name: 'Me', points: 350, refreshed_at: 'T' },
      error: null,
    });
    // Query 2: total count (head request via select with count option — see impl)
    mockQueue.push({ data: [], error: null, count: 273 });
    // Query 3: neighbors
    mockQueue.push({
      data: [
        { rank: 3, user_id: 'u-3', user_name: 'C', points: 380, refreshed_at: 'T' },
        { rank: 4, user_id: 'u-4', user_name: 'D', points: 360, refreshed_at: 'T' },
        { rank: 6, user_id: 'u-6', user_name: 'F', points: 340, refreshed_at: 'T' },
        { rank: 7, user_id: 'u-7', user_name: 'G', points: 330, refreshed_at: 'T' },
      ],
      error: null,
    });

    const out = await getUserRank('u-me');

    expect(out).toEqual({
      rank: 5,
      points: 350,
      totalParticipants: 273,
      neighbors: [
        { rank: 3, userId: 'u-3', userName: 'C', points: 380, refreshedAt: 'T' },
        { rank: 4, userId: 'u-4', userName: 'D', points: 360, refreshedAt: 'T' },
        { rank: 6, userId: 'u-6', userName: 'F', points: 340, refreshedAt: 'T' },
        { rank: 7, userId: 'u-7', userName: 'G', points: 330, refreshedAt: 'T' },
      ],
    });
    // Self filter on own-row lookup
    expect(mockQueries[0].filters).toContainEqual({ method: 'eq', args: ['user_id', 'u-me'] });
  });

  it('returns only "below" neighbors when user is rank 1', async () => {
    mockQueue.push({
      data: { rank: 1, user_id: 'u-1', user_name: 'A', points: 500, refreshed_at: 'T' },
      error: null,
    });
    mockQueue.push({ data: [], error: null, count: 10 });
    mockQueue.push({
      data: [
        { rank: 2, user_id: 'u-2', user_name: 'B', points: 480, refreshed_at: 'T' },
        { rank: 3, user_id: 'u-3', user_name: 'C', points: 460, refreshed_at: 'T' },
      ],
      error: null,
    });
    const out = await getUserRank('u-1');
    expect(out.rank).toBe(1);
    expect(out.neighbors).toHaveLength(2);
    expect(out.neighbors.every((n) => n.rank > 1)).toBe(true);
  });

  it('returns only "above" neighbors when user is the last rank', async () => {
    mockQueue.push({
      data: { rank: 10, user_id: 'u-10', user_name: 'J', points: 100, refreshed_at: 'T' },
      error: null,
    });
    mockQueue.push({ data: [], error: null, count: 10 });
    mockQueue.push({
      data: [
        { rank: 8, user_id: 'u-8', user_name: 'H', points: 120, refreshed_at: 'T' },
        { rank: 9, user_id: 'u-9', user_name: 'I', points: 110, refreshed_at: 'T' },
      ],
      error: null,
    });
    const out = await getUserRank('u-10');
    expect(out.rank).toBe(10);
    expect(out.neighbors).toHaveLength(2);
    expect(out.neighbors.every((n) => n.rank < 10)).toBe(true);
  });

  it.each(['', '   '])('throws invalid_user_id when userId is %p', async (bad) => {
    await expect(getUserRank(bad)).rejects.toThrow('invalid_user_id');
    expect(mockQueries).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts -t "getUserRank — on-board"`

Expected: FAIL with `getUserRank is not a function`.

- [ ] **Step 4: Extend the mock chain to record the count-option selector**

In the test file, update the existing `chain.select`:

```typescript
chain.select = (sel: string, opts?: Record<string, unknown>) => {
  record.select = sel;
  if (opts) record.filters.push({ method: 'select_opts', args: [opts] });
  return chain;
};
```

And update `chain.then` so when the next queued response has a `count` property, it propagates it on the resolved value (Supabase shape: `{ data, error, count }`):

```typescript
chain.then = (resolve: (v: unknown) => unknown) => {
  const next = mockQueue.shift() ?? { data: null, error: null };
  return Promise.resolve(next).then(resolve);
};
```

(The `then` change is no-op if `count` is already in the shifted object — Supabase returns it as a top-level key. Leave as is and rely on the queue object having `count`.)

- [ ] **Step 5: Implement `getUserRank` on-board branch**

Update the type import:

```typescript
import type {
  LeaderboardEntry,
  LeaderboardHistoryEntry,
  UserRankInfo,
} from '../types';
```

Append the function:

```typescript
export async function getUserRank(userId: string): Promise<UserRankInfo> {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('invalid_user_id');
  }

  // 1. Own snapshot row.
  const own = await sb
    .from('leaderboard_snapshot')
    .select('rank, user_id, user_name, points, refreshed_at')
    .eq('user_id', userId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (own.error) {
    console.error('[leaderboardService] getUserRank own:', own.error);
    throw new Error('Failed to load user rank');
  }

  if (own.data) {
    const me = mapRowToEntry(own.data);
    // 2. Total participants + 3. Neighbors, in parallel.
    const [countRes, neighborsRes] = await Promise.all([
      sb.from('leaderboard_snapshot').select('user_id', { count: 'exact', head: true }) as unknown as
        Promise<{ count: number | null; error: unknown }>,
      sb
        .from('leaderboard_snapshot')
        .select('rank, user_id, user_name, points, refreshed_at')
        .gte('rank', Math.max(1, me.rank - 2))
        .lte('rank', me.rank + 2)
        .order('rank', { ascending: true }) as unknown as
        Promise<{ data: Record<string, unknown>[] | null; error: unknown }>,
    ]);

    if (countRes.error) {
      console.error('[leaderboardService] getUserRank count:', countRes.error);
      throw new Error('Failed to load user rank');
    }
    if (neighborsRes.error) {
      console.error('[leaderboardService] getUserRank neighbors:', neighborsRes.error);
      throw new Error('Failed to load user rank');
    }

    const neighbors = (neighborsRes.data ?? [])
      .map((r: Record<string, unknown>) => mapRowToEntry(r))
      .filter((n) => n.userId !== userId);

    return {
      rank: me.rank,
      points: me.points,
      totalParticipants: countRes.count ?? 0,
      neighbors,
    };
  }

  // Off-board branch handled in Task 6.
  return { rank: null, points: 0, totalParticipants: 0, neighbors: [] };
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts -t "getUserRank — on-board"`

Expected: PASS, four new tests.

Also run the whole file: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: all tests pass (≈26 total).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): add getUserRank on-board branch + UserRankInfo (Issue #138)"
```

---

### Task 6: `getUserRank` off-board fallback + error paths

**Files:**
- Modify: `src/lib/__tests__/leaderboardService.test.ts` — new `describe` block for off-board cases.
- Modify: `src/lib/leaderboardService.ts` — implement the off-board branch.

**Interfaces:**
- Consumes: existing `getUserRank` signature.
- Produces: complete `getUserRank` covering the off-board fallback and per-query error paths.

- [ ] **Step 1: Write the failing off-board tests**

Append to the test file:

```typescript
describe('getUserRank — off-board', () => {
  it('falls back to profiles.leaderboard_points when user is not in the snapshot', async () => {
    // Q1: own snapshot row — empty
    mockQueue.push({ data: null, error: null });
    // Q2: profiles fallback
    mockQueue.push({
      data: { leaderboard_points: 42 },
      error: null,
    });
    const out = await getUserRank('u-new');
    expect(out).toEqual({
      rank: null,
      points: 42,
      totalParticipants: 0,
      neighbors: [],
    });
    expect(mockQueries[1]).toMatchObject({
      table: 'profiles',
      select: 'leaderboard_points',
      filters: [{ method: 'eq', args: ['id', 'u-new'] }],
    });
  });

  it('returns 0 points when user has no profile row either', async () => {
    mockQueue.push({ data: null, error: null }); // no snapshot
    mockQueue.push({ data: null, error: null }); // no profile
    await expect(getUserRank('u-ghost')).resolves.toEqual({
      rank: null,
      points: 0,
      totalParticipants: 0,
      neighbors: [],
    });
  });

  it('throws a generic message when the snapshot read errors', async () => {
    mockQueue.push({ data: null, error: { message: 'boom', code: '08000' } });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
  });

  it('throws a generic message when the count read errors', async () => {
    mockQueue.push({
      data: { rank: 1, user_id: 'u-x', user_name: 'X', points: 100, refreshed_at: 'T' },
      error: null,
    });
    mockQueue.push({ data: null, error: { message: 'count failed', code: '08000' }, count: null });
    mockQueue.push({ data: [], error: null });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
  });

  it('throws a generic message when the neighbors read errors', async () => {
    mockQueue.push({
      data: { rank: 1, user_id: 'u-x', user_name: 'X', points: 100, refreshed_at: 'T' },
      error: null,
    });
    mockQueue.push({ data: [], error: null, count: 5 });
    mockQueue.push({ data: null, error: { message: 'rls', code: '42501' } });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
  });

  it('throws a generic message when the profile fallback read errors', async () => {
    mockQueue.push({ data: null, error: null });
    mockQueue.push({ data: null, error: { message: 'fail', code: '08000' } });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts -t "getUserRank — off-board"`

Expected: FAIL — the off-board branch in `getUserRank` currently returns `{rank:null, points:0, ...}` regardless of profile.

- [ ] **Step 3: Implement the off-board branch**

Replace the trailing line `// Off-board branch handled in Task 6.\n  return {...};` in `getUserRank` with:

```typescript
  // Off-board: user has no snapshot row. Fall back to profiles.leaderboard_points.
  const profile = await sb
    .from('profiles')
    .select('leaderboard_points')
    .eq('id', userId)
    .maybeSingle() as { data: { leaderboard_points: number } | null; error: unknown };

  if (profile.error) {
    console.error('[leaderboardService] getUserRank profile:', profile.error);
    throw new Error('Failed to load user rank');
  }

  return {
    rank: null,
    points: profile.data?.leaderboard_points ?? 0,
    totalParticipants: 0,
    neighbors: [],
  };
```

- [ ] **Step 4: Run the full test file to confirm everything passes**

Run: `npx jest src/lib/__tests__/leaderboardService.test.ts`

Expected: PASS, ≈32 total tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npx eslint src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leaderboardService.ts src/lib/__tests__/leaderboardService.test.ts
git commit -m "feat(service): add getUserRank off-board fallback + per-query error paths (Issue #138)"
```

---

### Task 7: Verification, push, open PR

**Files:**
- No source changes. Verification + PR open.

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: PR ready for Aleks's review.

- [ ] **Step 1: Run the full project lint**

Run: `npx eslint .`

Expected: no errors. Fix anything new.

- [ ] **Step 2: Run the full project type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Run the full Jest suite**

Run: `npx jest --passWithNoTests`

Expected: all green. Existing challenge tests remain at 67/67 (or whatever the current count is); new leaderboard file adds ~32 tests.

- [ ] **Step 4: Run web export to mirror CI**

Run: `npx expo export --platform web`

Expected: success. Fix any TS errors that only surface here.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/138-leaderboard-service
```

- [ ] **Step 6: Open the PR**

Use the standard PR template from `quality_standards.md` §5. PR body:

```markdown
## Summary
- New `src/lib/leaderboardService.ts` with four read-only functions: `getLeaderboard`, `getUserRank`, `getLeaderboardHistory`, `getLeaderboardLastUpdated`.
- No new migration — reads from existing `leaderboard_snapshot`, `leaderboard_history`, and `profiles`.
- `getLeaderboardHistory` is own-rows-only (matches Gamification.md + RLS). Issue #138 body to be updated to ratify.
- File extracted from `challengeService.ts` (which is now ~900 LOC after #137) into its own service file. Issue #138 body to be updated.
- Lessons applied from PR #160 review: no `getSession()` (R2/S5), generic error throws + raw error to console.error (S3), synchronous input validation that throws instead of clamping (S1).

## New files
- `src/lib/leaderboardService.ts` — four functions + `mapRowToEntry` + `mapRowToHistory`.
- `src/lib/__tests__/leaderboardService.test.ts` — ~32 tests, deterministic, no real DB.

## Modified files
- `src/types/index.ts` — added `UserRankInfo` and `LeaderboardHistoryEntry` next to existing `LeaderboardEntry`.
- `docs/superpowers/specs/2026-06-28-leaderboard-service-design.md` — new design spec.
- `docs/superpowers/plans/2026-06-28-leaderboard-service.md` — new implementation plan.

## Test plan
- [ ] `npx jest src/lib/__tests__/leaderboardService.test.ts` → all green
- [ ] `npx tsc --noEmit` → no errors
- [ ] `npx eslint .` → no errors
- [ ] `npx expo export --platform web` → success
- [ ] Manual sanity: `getLeaderboard()` returns sorted rows; `getUserRank(authUserId)` returns user's rank with neighbors; `getLeaderboardHistory(authUserId)` returns own months only.

Closes #138
```

Open with `gh pr create`:

```bash
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo 2Bros1Mission/GymApp --base master \
  --title "feat(service): implement leaderboard service (#138)" \
  --body "$(cat <<'EOF'
[paste PR body here]
EOF
)"
```

- [ ] **Step 7: Update Issue #138 body**

Edit Issue #138 to ratify the two design deviations:

```bash
"/c/Program Files/GitHub CLI/gh.exe" issue edit 138 --repo 2Bros1Mission/GymApp --body "..."
```

Add a note at the top: "Implemented per `docs/superpowers/specs/2026-06-28-leaderboard-service-design.md`. Two intentional deviations from this body: (1) service lives in new `src/lib/leaderboardService.ts`, not `challengeService.ts`; (2) `getLeaderboardHistory` returns own-rows-only, no top-3, aligning with `Documentation/Gamification.md` and `leaderboard_history` RLS."

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `getLeaderboard(limit)` — Task 1+2
- ✅ `getUserRank(userId)` — Task 5+6
- ✅ `getLeaderboardHistory(userId, limit)` — Task 4
- ✅ `getLeaderboardLastUpdated()` — Task 3
- ✅ Tiebreaker — handled by `refresh_leaderboard_snapshot()` ORDER BY, not in service layer (spec calls this out as out-of-scope)
- ✅ No `getSession()` — enforced in implementations and global constraints
- ✅ Generic error strings — enforced in implementations and tests
- ✅ All four integrate with `useAsyncData` — same shape as `challengeService` queries
- ✅ All affected files in the plan match the spec's "Affected Files" section
- ✅ TDD order matches the spec
- ✅ Acceptance criteria 1–8 all map to specific task steps

**Type consistency check:**
- `LeaderboardEntry` used in Tasks 1, 5, 6 — always the existing `{rank, userId, userName, points, refreshedAt}` shape
- `UserRankInfo` defined in Task 5, consumed in Tasks 5 and 6
- `LeaderboardHistoryEntry` defined in Task 4, consumed in Task 4
- Function signatures consistent throughout: `getLeaderboard(limit?)`, `getUserRank(userId)`, `getLeaderboardHistory(userId, limit?)`, `getLeaderboardLastUpdated()`

No gaps. No placeholders.
