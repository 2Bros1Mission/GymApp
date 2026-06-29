import {
  getLeaderboard,
  getLeaderboardHistory,
  getUserRank,
} from '../leaderboardService';

interface QueryRecord {
  table: string;
  select?: string;
  filters: { method: string; args: unknown[] }[];
}

interface RpcRecord {
  fn: string;
  params: Record<string, unknown> | undefined;
}

const mockQueue: { data: unknown; error: unknown; count?: number | null }[] = [];
const mockRpcQueue: { data: unknown; error: unknown }[] = [];
const mockQueries: QueryRecord[] = [];
const mockRpcCalls: RpcRecord[] = [];

function mockMakeChain(table: string): unknown {
  const record: QueryRecord = { table, filters: [] };
  mockQueries.push(record);
  const chain: Record<string, unknown> = {};
  chain.select = (sel: string, opts?: Record<string, unknown>) => {
    record.select = sel;
    if (opts) record.filters.push({ method: 'select_opts', args: [opts] });
    return chain;
  };
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
    rpc: (fn: string, params?: Record<string, unknown>) => {
      mockRpcCalls.push({ fn, params });
      return Promise.resolve(mockRpcQueue.shift() ?? { data: null, error: null });
    },
  },
}));

beforeEach(() => {
  mockQueue.length = 0;
  mockRpcQueue.length = 0;
  mockQueries.length = 0;
  mockRpcCalls.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
  (console.warn as jest.Mock).mockRestore();
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

  it('returns an empty array when the snapshot is empty', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(getLeaderboard()).resolves.toEqual([]);
  });

  it('passes a custom limit through to the query', async () => {
    mockQueue.push({ data: [], error: null });
    await getLeaderboard(50);
    expect(mockQueries[0].filters).toContainEqual({ method: 'limit', args: [50] });
  });

  it('accepts the exact upper bound (100)', async () => {
    mockQueue.push({ data: [], error: null });
    await expect(getLeaderboard(100)).resolves.toEqual([]);
  });

  it.each([0, -1, 101, 1001, 1.5, NaN, Infinity])(
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
});

describe('getLeaderboardHistory', () => {
  it('returns own monthly history sorted month DESC', async () => {
    mockQueue.push({
      data: [
        { month: '2026-05-01', final_rank: 7, final_points: 320 },
        { month: '2026-04-01', final_rank: 12, final_points: 280 },
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

  it('slices the Postgres date "YYYY-MM-DD" to the documented "YYYY-MM" contract', async () => {
    // Regression for the type-comment-lies bug: PostgREST serializes a
    // `date` column as 'YYYY-MM-DD' (10 chars), but LeaderboardHistoryEntry
    // documents `month: 'YYYY-MM'`. The mapper must normalize at the
    // boundary, not let the day digits leak to UI consumers.
    mockQueue.push({
      data: [{ month: '2026-12-01', final_rank: 1, final_points: 999 }],
      error: null,
    });
    const out = await getLeaderboardHistory('user-1');
    expect(out[0].month).toBe('2026-12');
    expect(out[0].month).toHaveLength(7);
  });

  it('trims a whitespace-padded userId before sending to the DB', async () => {
    mockQueue.push({ data: [], error: null });
    await getLeaderboardHistory('   user-1   ');
    expect(mockQueries[0].filters).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
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
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[leaderboardService] getLeaderboardHistory:');
    expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
  });
});

describe('getUserRank — on-board (RPC)', () => {
  it('returns rank, points, totalParticipants and four neighbors via a single RPC call', async () => {
    mockRpcQueue.push({
      data: {
        rank: 5,
        points: 350,
        total_participants: 5000, // real participant pool, NOT snapshot size
        neighbors: [
          { rank: 3, user_id: 'u-3', user_name: 'C', points: 380, refreshed_at: 'T' },
          { rank: 4, user_id: 'u-4', user_name: 'D', points: 360, refreshed_at: 'T' },
          { rank: 6, user_id: 'u-6', user_name: 'F', points: 340, refreshed_at: 'T' },
          { rank: 7, user_id: 'u-7', user_name: 'G', points: 330, refreshed_at: 'T' },
        ],
        refreshed_at: 'T',
      },
      error: null,
    });

    const out = await getUserRank('u-me');

    expect(out).toEqual({
      rank: 5,
      points: 350,
      totalParticipants: 5000,
      neighbors: [
        { rank: 3, userId: 'u-3', userName: 'C', points: 380, refreshedAt: 'T' },
        { rank: 4, userId: 'u-4', userName: 'D', points: 360, refreshedAt: 'T' },
        { rank: 6, userId: 'u-6', userName: 'F', points: 340, refreshedAt: 'T' },
        { rank: 7, userId: 'u-7', userName: 'G', points: 330, refreshedAt: 'T' },
      ],
    });
    expect(mockRpcCalls).toEqual([
      { fn: 'fn_get_user_rank_info', params: { p_user_id: 'u-me' } },
    ]);
    // No direct table reads — everything goes through the RPC.
    expect(mockQueries).toHaveLength(0);
  });

  it('returns only "below" neighbors when user is rank 1', async () => {
    mockRpcQueue.push({
      data: {
        rank: 1,
        points: 500,
        total_participants: 10,
        neighbors: [
          { rank: 2, user_id: 'u-2', user_name: 'B', points: 480, refreshed_at: 'T' },
          { rank: 3, user_id: 'u-3', user_name: 'C', points: 460, refreshed_at: 'T' },
        ],
        refreshed_at: 'T',
      },
      error: null,
    });
    const out = await getUserRank('u-1');
    expect(out.rank).toBe(1);
    expect(out.neighbors).toHaveLength(2);
    expect(out.neighbors.every((n) => n.rank > 1)).toBe(true);
  });

  it('returns only "above" neighbors when user is the last rank', async () => {
    mockRpcQueue.push({
      data: {
        rank: 10,
        points: 100,
        total_participants: 10,
        neighbors: [
          { rank: 8, user_id: 'u-8', user_name: 'H', points: 120, refreshed_at: 'T' },
          { rank: 9, user_id: 'u-9', user_name: 'I', points: 110, refreshed_at: 'T' },
        ],
        refreshed_at: 'T',
      },
      error: null,
    });
    const out = await getUserRank('u-10');
    expect(out.rank).toBe(10);
    expect(out.neighbors).toHaveLength(2);
    expect(out.neighbors.every((n) => n.rank < 10)).toBe(true);
  });

  it('trims a whitespace-padded userId before passing to the RPC', async () => {
    mockRpcQueue.push({
      data: { rank: 1, points: 1, total_participants: 1, neighbors: [], refreshed_at: 'T' },
      error: null,
    });
    await getUserRank('   u-me   ');
    expect(mockRpcCalls[0].params).toEqual({ p_user_id: 'u-me' });
  });

  it.each(['', '   '])('throws invalid_user_id when userId is %p', async (bad) => {
    await expect(getUserRank(bad)).rejects.toThrow('invalid_user_id');
    expect(mockRpcCalls).toHaveLength(0);
  });
});

describe('getUserRank — off-board (RPC)', () => {
  it('surfaces server-computed rank for an off-board user with non-zero points', async () => {
    // The server computes the rank via COUNT(*) FROM profiles WHERE
    // leaderboard_points > $mine, per Gamification.md §383. UI never
    // has to special-case rank: null for users outside the top 100.
    mockRpcQueue.push({
      data: {
        rank: 247,
        points: 42,
        total_participants: 5000,
        neighbors: [],
        refreshed_at: null,
      },
      error: null,
    });
    const out = await getUserRank('u-new');
    expect(out).toEqual({
      rank: 247,
      points: 42,
      totalParticipants: 5000,
      neighbors: [],
    });
  });

  it('returns rank: null for a zero-points user (no relative rank in the >0-point cohort)', async () => {
    // Regression for N2: previously the SQL count predicate matched
    // every >0-point user against a 0-point caller, returning
    // rank = total_participants + 1 ("rank 5001 of 5000"). RPC now
    // short-circuits zero-points to rank: null so the UI can render
    // "unranked" copy.
    mockRpcQueue.push({
      data: {
        rank: null,
        points: 0,
        total_participants: 5000,
        neighbors: [],
        refreshed_at: null,
      },
      error: null,
    });
    const out = await getUserRank('u-fresh');
    expect(out).toEqual({
      rank: null,
      points: 0,
      totalParticipants: 5000,
      neighbors: [],
    });
  });

  it('returns rank: null with a warning when the profile row is missing', async () => {
    mockRpcQueue.push({
      data: {
        rank: null,
        points: 0,
        total_participants: 5000,
        neighbors: [],
        refreshed_at: null,
        profile_missing: true,
      },
      error: null,
    });
    const out = await getUserRank('u-ghost');
    expect(out).toEqual({
      rank: null,
      points: 0,
      totalParticipants: 5000,
      neighbors: [],
    });
    // Invariant violation (handle_new_user trigger should guarantee a
    // profile exists for every auth user) — surface it so on-call notices.
    expect((console.warn as jest.Mock).mock.calls[0][0]).toBe(
      '[leaderboardService] getUserRank: profile row missing for'
    );
    expect((console.warn as jest.Mock).mock.calls[0][1]).toBe('u-ghost');
  });

  it('throws a generic message when the RPC errors', async () => {
    mockRpcQueue.push({ data: null, error: { message: 'rls denied', code: '42501' } });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe(
      '[leaderboardService] getUserRank:'
    );
  });

  it('throws a generic message when the RPC silently returns null data', async () => {
    mockRpcQueue.push({ data: null, error: null });
    await expect(getUserRank('u-x')).rejects.toThrow('Failed to load user rank');
  });
});

describe('Row validation at the mapper boundary', () => {
  // Regression for the unchecked-cast schema-drift hazard: if the DB
  // ever renames a column, the row arrives missing the expected key
  // and the mapper should throw at the boundary, not silently
  // propagate `undefined` typed as `number` into the caller.

  it('throws malformed_row when a snapshot column is missing from a getLeaderboard row', async () => {
    mockQueue.push({
      data: [{ rank: 1, user_id: 'u1', user_name: 'A', /* points missing */ refreshed_at: 'T' }],
      error: null,
    });
    await expect(getLeaderboard()).rejects.toThrow('malformed_row:points');
  });

  it('throws malformed_row when a history column is missing', async () => {
    mockQueue.push({
      data: [{ month: '2026-05-01', /* final_rank missing */ final_points: 100 }],
      error: null,
    });
    await expect(getLeaderboardHistory('u-1')).rejects.toThrow('malformed_row:final_rank');
  });

  it('throws malformed_row:month when the date column shape is unexpected', async () => {
    // Regression for N7: previously mapRowToHistory blindly sliced
    // raw.slice(0, 7). If PostgREST ever returns 'YYYY-M-D' or a
    // timezone-converted timestamp, the slice produces garbage. The
    // regex guard converts that to a clean malformed_row.
    mockQueue.push({
      data: [{ month: '26-05-01', final_rank: 7, final_points: 320 }],
      error: null,
    });
    await expect(getLeaderboardHistory('u-1')).rejects.toThrow('malformed_row:month');
  });

  it('throws malformed_row:total_participants when the RPC payload is missing a field', async () => {
    // Regression for N3: the RPC payload was previously type-asserted
    // (`as unknown as RankInfoPayload`) with no runtime validation,
    // so a malformed jsonb (missing total_participants) would let
    // `undefined as number` poison the consumer. validateRankPayload
    // now enforces the same boundary discipline as the row mappers.
    mockRpcQueue.push({
      data: {
        rank: 5,
        points: 350,
        // total_participants missing
        neighbors: [],
        refreshed_at: 'T',
      },
      error: null,
    });
    await expect(getUserRank('u-me')).rejects.toThrow('malformed_row:total_participants');
  });

  it('throws malformed_row:neighbors when the RPC returns a non-array neighbors field', async () => {
    // Regression for N4: previously `data.neighbors.map(...)` would
    // crash with "TypeError: ... .map is not a function" if the RPC
    // returned an object instead of an array. Now surfaced as a
    // clean malformed_row error consistent with the mapper boundary.
    mockRpcQueue.push({
      data: {
        rank: 5,
        points: 350,
        total_participants: 100,
        neighbors: {} as unknown,
        refreshed_at: 'T',
      },
      error: null,
    });
    await expect(getUserRank('u-me')).rejects.toThrow('malformed_row:neighbors');
  });

  it('throws malformed_row:neighbors[] when a single neighbor row is not an object', async () => {
    mockRpcQueue.push({
      data: {
        rank: 5,
        points: 350,
        total_participants: 100,
        neighbors: [null],
        refreshed_at: 'T',
      },
      error: null,
    });
    await expect(getUserRank('u-me')).rejects.toThrow('malformed_row:neighbors[]');
  });
});
