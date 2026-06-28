import {
  getLeaderboard,
  getLeaderboardLastUpdated,
  getLeaderboardHistory,
  getUserRank,
} from '../leaderboardService';

interface QueryRecord {
  table: string;
  select?: string;
  filters: { method: string; args: unknown[] }[];
}

const mockQueue: { data: unknown; error: unknown; count?: number | null }[] = [];
const mockQueries: QueryRecord[] = [];

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
  },
}));

beforeEach(() => {
  mockQueue.length = 0;
  mockQueries.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
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
});

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
    expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
  });
});

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
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('[leaderboardService] getLeaderboardHistory:');
    expect((console.error as jest.Mock).mock.calls[0][1]).toBe(raw);
  });
});

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
