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
