import {
  pickChallenge,
  getUserChallengeState,
  getUserChallengeProgress,
  getDiscoveryPool,
  getActiveChallenges,
  abandonChallenge,
  reportProgress,
  getChallengeHistory,
  _computeDeadlineForTest as computeDeadline,
} from '../challengeService';

// Supabase mock — use a per-table mockQueue of results so each .from()
// call returns the next prepared response. Each call records its
// chain so tests can assert filters/select shape.
//
// Names beginning with `mock` so Jest's hoisted jest.mock() factory
// is allowed to reference them.

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
  chain.select = (sel: string) => {
    record.select = sel;
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    record.filters.push({ method: 'eq', args });
    return chain;
  };
  chain.in = (...args: unknown[]) => {
    record.filters.push({ method: 'in', args });
    return chain;
  };
  chain.order = (...args: unknown[]) => {
    record.filters.push({ method: 'order', args });
    return chain;
  };
  chain.limit = (...args: unknown[]) => {
    record.filters.push({ method: 'limit', args });
    return chain;
  };
  chain.update = (..._args: unknown[]) => {
    record.filters.push({ method: 'update', args: _args });
    return chain;
  };
  chain.maybeSingle = () => Promise.resolve(mockQueue.shift() ?? { data: null, error: null });
  // Awaitable directly: when service does `await sb.from(...).eq(...)...`
  // the chain resolves to the next queued response.
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(mockQueue.shift() ?? { data: null, error: null }).then(resolve);
  return chain;
}

const mockGetSession = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => mockMakeChain(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

beforeEach(() => {
  mockQueue.length = 0;
  mockQueries.length = 0;
  mockRpc.mockReset();
  mockGetSession.mockReset();
  // Default to an authenticated session — individual tests can override.
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'session-user' } } },
  });
});

// ─── pickChallenge ──────────────────────────────────────────────────────────

describe('pickChallenge', () => {
  it('calls fn_pick_challenge RPC with the challenge id', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, participant_id: 'p-1' },
      error: null,
    });

    const res = await pickChallenge('ch-1');

    expect(mockRpc).toHaveBeenCalledWith('fn_pick_challenge', { p_challenge_id: 'ch-1' });
    expect(res).toEqual({ ok: true, participantId: 'p-1' });
  });

  it('returns cooldown reason with availableAt from RPC payload', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: 'cooldown', available_at: '2026-06-12T15:30:00Z' },
      error: null,
    });

    const res = await pickChallenge('ch-1');

    expect(res).toEqual({
      ok: false,
      error: 'cooldown',
      availableAt: '2026-06-12T15:30:00Z',
    });
  });

  it('does not leak availableAt onto non-cooldown errors', async () => {
    // RPC defensively never includes available_at for limit_reached, but
    // pin the contract: even if it leaked one, the service strips it.
    mockRpc.mockResolvedValue({
      data: { ok: false, error: 'limit_reached', available_at: '2026-06-12T15:30:00Z' },
      error: null,
    });

    const res = await pickChallenge('ch-1');

    expect(res).toEqual({ ok: false, error: 'limit_reached' });
    expect(res.availableAt).toBeUndefined();
  });

  it('surfaces already_picked when re-picking a finished challenge', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: 'already_picked' },
      error: null,
    });

    const res = await pickChallenge('ch-1');

    expect(res).toEqual({ ok: false, error: 'already_picked' });
  });

  it('falls back to unknown when RPC payload omits an error reason', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false }, error: null });

    const res = await pickChallenge('ch-1');

    expect(res).toEqual({ ok: false, error: 'unknown' });
  });

  it('returns generic error when RPC itself fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } });

    const res = await pickChallenge('ch-1');

    expect(res.ok).toBe(false);
    expect(res.error).toBe('unknown');
  });
});

// ─── getUserChallengeState ──────────────────────────────────────────────────

describe('getUserChallengeState', () => {
  it('returns one entry per cadence with limits filled in', async () => {
    // First call: user_challenge_state
    mockQueue.push({
      data: [
        { cadence: 'daily', completions_this_period: 0, last_pick_at: null },
        {
          cadence: 'weekly',
          completions_this_period: 3,
          last_pick_at: '2026-06-12T14:00:00Z',
        },
      ],
      error: null,
    });
    // Second call: challenge_participants joined to challenges
    mockQueue.push({
      data: [
        { challenges: { cadence: 'weekly', source: 'platform' } },
        { challenges: { cadence: 'weekly', source: 'platform' } },
        { challenges: { cadence: 'monthly', source: 'trainer' } }, // ignored
      ],
      error: null,
    });

    const out = await getUserChallengeState('user-1');

    expect(out).toHaveLength(3);
    const daily = out.find((s) => s.cadence === 'daily');
    const weekly = out.find((s) => s.cadence === 'weekly');
    const monthly = out.find((s) => s.cadence === 'monthly');

    expect(daily).toMatchObject({
      completionsThisPeriod: 0,
      maxCompletions: 1,
      activeCount: 0,
      maxActive: 1,
      lastPickAt: null,
      cooldownEndsAt: null,
    });
    expect(weekly).toMatchObject({
      completionsThisPeriod: 3,
      maxCompletions: 5,
      activeCount: 2,
      maxActive: 3,
      lastPickAt: '2026-06-12T14:00:00Z',
    });
    // 1h after lastPickAt
    expect(weekly?.cooldownEndsAt).toBe('2026-06-12T15:00:00.000Z');
    expect(monthly).toMatchObject({
      completionsThisPeriod: 0,
      maxCompletions: 10,
      activeCount: 0, // trainer source filtered out
      maxActive: 5,
    });
  });

  it('zeroes cadences the user has never touched', async () => {
    mockQueue.push({ data: [], error: null });
    mockQueue.push({ data: [], error: null });

    const out = await getUserChallengeState('user-1');

    expect(out).toHaveLength(3);
    expect(out.every((s) => s.completionsThisPeriod === 0 && s.activeCount === 0)).toBe(true);
  });
});

// ─── getUserChallengeProgress ───────────────────────────────────────────────

describe('getUserChallengeProgress', () => {
  it('returns null when no participation row exists', async () => {
    mockQueue.push({ data: null, error: null });
    const out = await getUserChallengeProgress('user-1', 'ch-1');
    expect(out).toBeNull();
  });

  it('maps row + nested challenge into ChallengeParticipant', async () => {
    mockQueue.push({
      data: {
        id: 'p-1',
        challenge_id: 'ch-1',
        user_id: 'user-1',
        current_progress: 2,
        longest_streak: 2,
        target_value: 5,
        status: 'active',
        joined_at: '2026-06-10T10:00:00Z',
        completed_at: null,
        source: 'discovery',
        created_at: '2026-06-10T10:00:00Z',
        challenge: {
          id: 'ch-1',
          template_id: 't-1',
          creator_id: null,
          source: 'platform',
          title: '5 workouts',
          title_bg: null,
          description: null,
          description_bg: null,
          challenge_type: 'frequency',
          cadence: 'weekly',
          difficulty: 'medium',
          target_value: 5,
          points: 10,
          category: null,
          status: 'active',
          start_date: '2026-06-08',
          end_date: null,
          created_at: '2026-06-08T00:00:00Z',
        },
      },
      error: null,
    });

    const out = await getUserChallengeProgress('user-1', 'ch-1');

    expect(out).not.toBeNull();
    expect(out?.id).toBe('p-1');
    expect(out?.currentProgress).toBe(2);
    expect(out?.challenge.id).toBe('ch-1');
    expect(out?.challenge.cadence).toBe('weekly');
    expect(out?.challenge.targetValue).toBe(5);
  });
});

// ─── getDiscoveryPool ───────────────────────────────────────────────────────

describe('getDiscoveryPool', () => {
  // Fixed 2026-06-12T12:00:00Z so cooldown math is deterministic.
  const NOW = new Date('2026-06-12T12:00:00Z').getTime();
  const realNow = Date.now;
  beforeAll(() => {
    Date.now = () => NOW;
  });
  afterAll(() => {
    Date.now = realNow;
  });

  function challenge(id: string, cadence: 'daily' | 'weekly' | 'monthly', templateId: string) {
    return {
      id,
      template_id: templateId,
      creator_id: null,
      source: 'platform',
      title: `Challenge ${id}`,
      title_bg: null,
      description: null,
      description_bg: null,
      challenge_type: 'frequency',
      cadence,
      difficulty: 'easy',
      target_value: 1,
      points: 10,
      category: null,
      status: 'active',
      start_date: '2026-06-01',
      end_date: null,
      created_at: '2026-06-01T00:00:00Z',
    };
  }

  it('groups available cards by cadence and respects pool size caps', async () => {
    // Order in challengeService is: active participants, state, cooldowns, pool.
    mockQueue.push({ data: [], error: null });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      data: [
        challenge('d1', 'daily', 't-d1'),
        challenge('d2', 'daily', 't-d2'),
        challenge('d3', 'daily', 't-d3'),
        challenge('d4', 'daily', 't-d4'), // fourth daily — should be dropped (cap=3)
        challenge('w1', 'weekly', 't-w1'),
        challenge('m1', 'monthly', 't-m1'),
      ],
      error: null,
    });

    const out = await getDiscoveryPool('user-1');

    expect(out.daily).toHaveLength(3);
    expect(out.weekly).toHaveLength(1);
    expect(out.monthly).toHaveLength(1);
    expect(out.daily.every((c) => c.state === 'available')).toBe(true);

    // Pin the .limit(110) on the pool query — without it the entire active
    // platform catalog is fetched on every call (only 11 cards are visible).
    const poolQuery = mockQueries.find((q) => q.table === 'challenges');
    expect(poolQuery?.filters).toContainEqual({ method: 'limit', args: [110] });
  });

  it('filters out challenges the user already has active', async () => {
    mockQueue.push({
      data: [
        // Already enrolled in d1.
        { challenge_id: 'd1', challenges: { cadence: 'daily', source: 'platform' } },
      ],
      error: null,
    });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      data: [challenge('d1', 'daily', 't-d1'), challenge('d2', 'daily', 't-d2')],
      error: null,
    });

    const out = await getDiscoveryPool('user-1');

    // d1 filtered, d2 still pickable. Active count for daily is 1 (== max),
    // so d2 should show as limit_reached.
    expect(out.daily).toHaveLength(1);
    expect(out.daily[0].challenge.id).toBe('d2');
    expect(out.daily[0].state).toBe('limit_reached');
  });

  it('marks template-cooldown cards as cooldown with availableAt', async () => {
    mockQueue.push({ data: [], error: null });
    mockQueue.push({ data: [], error: null });
    // Picked t-d1 30 min ago — cooldown expires in 30 min.
    mockQueue.push({
      data: [{ template_id: 't-d1', picked_at: new Date(NOW - 30 * 60 * 1000).toISOString() }],
      error: null,
    });
    mockQueue.push({
      data: [challenge('d1', 'daily', 't-d1'), challenge('d2', 'daily', 't-d2')],
      error: null,
    });

    const out = await getDiscoveryPool('user-1');

    const d1 = out.daily.find((c) => c.challenge.id === 'd1');
    const d2 = out.daily.find((c) => c.challenge.id === 'd2');
    expect(d1?.state).toBe('cooldown');
    expect(d1?.availableAt).toBe(new Date(NOW + 30 * 60 * 1000).toISOString());
    expect(d2?.state).toBe('available');
  });

  it('filters templates in recent_template_ids (anti-repetition)', async () => {
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      data: [
        {
          cadence: 'daily',
          completions_this_period: 0,
          recent_template_ids: ['t-d1'],
        },
      ],
      error: null,
    });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      data: [challenge('d1', 'daily', 't-d1'), challenge('d2', 'daily', 't-d2')],
      error: null,
    });

    const out = await getDiscoveryPool('user-1');

    expect(out.daily.map((c) => c.challenge.id)).toEqual(['d2']);
  });

  it('marks all cards as limit_reached when cadence completion limit hit', async () => {
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      // Daily: 1/1 completed → freeze.
      data: [{ cadence: 'daily', completions_this_period: 1, recent_template_ids: [] }],
      error: null,
    });
    mockQueue.push({ data: [], error: null });
    mockQueue.push({
      data: [challenge('d1', 'daily', 't-d1'), challenge('d2', 'daily', 't-d2')],
      error: null,
    });

    const out = await getDiscoveryPool('user-1');

    expect(out.daily.every((c) => c.state === 'limit_reached')).toBe(true);
  });
});

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

  it('returns null streakComebackDiff when the user is strictly beating their record', async () => {
    // currentProgress (8) > longestStreak (7) → not in comeback mode AND
    // diff is negative ("−1 days lost"), which is nonsense to surface.
    // Null is the right signal for "not applicable".
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 8,
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
    expect(result[0].isStreakBroken).toBe(false);
    expect(result[0].streakComebackDiff).toBeNull();
  });

  it('returns streakComebackDiff=0 when the user is exactly at their record', async () => {
    // currentProgress (7) === longestStreak (7) → not broken, but
    // the at-record case is meaningful: the UI can render a "matched
    // your record!" badge. Distinguished from null (non-streak or
    // beating record) by being a real number.
    mockQueue.push({
      data: [
        {
          id: 'p1',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 7,
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
    expect(result[0].isStreakBroken).toBe(false);
    expect(result[0].streakComebackDiff).toBe(0);
  });

  it('returns null streakComebackDiff for never-streaked users (longestStreak=0)', async () => {
    // F2 regression: a brand-new streak participant has longestStreak=0
    // and currentProgress=0 → diff=0. Without the longestStreak>0 gate,
    // comebackDiff would be 0 and the UI would render "matched your
    // record!" on day zero of someone's first streak attempt. Null is
    // the right "not applicable, you have no record to match yet" signal.
    mockQueue.push({
      data: [
        {
          id: 'p-fresh',
          challenge_id: 'c1',
          user_id: 'user-1',
          current_progress: 0,
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
    expect(result[0].isStreakBroken).toBe(false);
    expect(result[0].streakComebackDiff).toBeNull();
  });

  it('filters out orphan participants whose joined challenge row is null', async () => {
    // Defense against RLS hiding the parent challenge row while the
    // participant row remains visible (or any FK-cascade edge case).
    // Before the filter, mapRowToParticipant would substitute {} and
    // downstream computeDeadline / progressPercentage would emit
    // wrong-cadence deadlines and NaN%. Now the row is dropped.
    mockQueue.push({
      data: [
        {
          id: 'orphan',
          challenge_id: 'missing',
          user_id: 'user-1',
          current_progress: 1,
          longest_streak: 0,
          target_value: 5,
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          completed_at: null,
          source: 'discovery',
          created_at: '2026-01-01T00:00:00Z',
          challenge: null,
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    expect(result).toEqual([]);
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
            // Postgres `date` column → PostgREST returns "YYYY-MM-DD".
            end_date: '2026-12-31',
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      error: null,
    });
    const result = await getActiveChallenges('user-1');
    // end_date='2026-12-31' means the challenge is playable through that
    // calendar day; under the 4AM Sofia convention, the hard expiry is
    // 2027-01-01 04:00 Sofia = 2027-01-01 02:00Z (winter EET, UTC+2).
    expect(result[0].timeRemaining).toBe('2027-01-01T02:00:00.000Z');
  });

  it('computes daily timeRemaining across the spring DST boundary using the target offset', async () => {
    // Sofia spring forward (EET→EEST) is the last Sunday of March at 03:00 local.
    // 2026: that's 2026-03-29. "Now" = 2026-03-28 20:00 UTC (22:00 Sofia EET, UTC+2),
    // so today's 4AM has passed → next 4AM is 2026-03-29 04:00 Sofia, which is
    // EEST (UTC+3) → 2026-03-29 01:00Z. Using the `now` offset (+120) would
    // incorrectly produce 02:00Z.
    jest.useFakeTimers().setSystemTime(new Date('2026-03-28T20:00:00Z'));
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
          source: 'discovery',
          created_at: '2026-01-01T00:00:00Z',
          challenge: {
            id: 'c1',
            template_id: 't1',
            creator_id: null,
            source: 'platform',
            title: 'D',
            title_bg: null,
            description: null,
            description_bg: null,
            challenge_type: 'frequency',
            cadence: 'daily',
            difficulty: 'easy',
            target_value: 1,
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
    try {
      const result = await getActiveChallenges('user-1');
      expect(result[0].timeRemaining).toBe('2026-03-29T01:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });
});

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

  it('returns unknown when the supabase call errors', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueue.push({ data: null, error: { message: 'boom' } });
    const result = await abandonChallenge('c1');
    expect(result).toEqual({ ok: false, error: 'unknown' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('does not call auth.getSession — relies on RLS for ownership', async () => {
    // We dropped the client-side getSession() defense-in-depth: per
    // Supabase docs, getSession() reads local storage without server
    // verification and adds nothing in front of RLS. abandonChallenge
    // should issue the UPDATE directly with no session resolution.
    mockQueue.push({ data: [{ id: 'p1' }], error: null });
    await abandonChallenge('c1');
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('does NOT filter by user_id client-side (RLS enforces it)', async () => {
    mockQueue.push({ data: [{ id: 'p1' }], error: null });
    await abandonChallenge('c1');
    const userIdFilter = mockQueries[0].filters.find(
      (f) => f.method === 'eq' && f.args[0] === 'user_id'
    );
    expect(userIdFilter).toBeUndefined();
  });
});

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
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const result = await reportProgress('c1', 1);
    expect(result).toEqual({ ok: false, error: 'unknown' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // Client-side validation: TS `number` type does NOT exclude NaN /
  // Infinity / floats at runtime, and JSON.stringify(NaN) === 'null'
  // per ECMA-262 §25.5.2 — passing one of these to the RPC would
  // surface as opaque 'unknown' from the column NOT NULL constraint.
  // Catch them at the boundary instead.
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
    ['float', 1.5],
    ['too large', 100001],
  ] as const)('returns invalid_value (and skips the RPC) for %s', async (_label, value) => {
    const result = await reportProgress('c1', value);
    expect(result).toEqual({ ok: false, error: 'invalid_value' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

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

describe('computeDeadline (4AM Sofia boundary)', () => {
  // All `now` instants are UTC. Sofia = UTC+2 (EET) winter, UTC+3 (EEST) summer.
  // Spring-forward 2026: last Sun of March = 2026-03-29.
  // Fall-back 2026: last Sun of October = 2026-10-25.

  describe('daily', () => {
    it('before 4AM Sofia → today 4AM', () => {
      // 2026-02-10 01:00 Sofia (EET, UTC+2) = 2025... wait, 2026-02-09 23:00 UTC.
      // 4AM Sofia today = 2026-02-10 04:00 EET = 2026-02-10 02:00 UTC.
      const now = new Date('2026-02-09T23:00:00Z');
      expect(computeDeadline('daily', now, null)).toBe('2026-02-10T02:00:00.000Z');
    });

    it('after 4AM Sofia → tomorrow 4AM (winter, UTC+2)', () => {
      // 2026-02-10 10:00 Sofia = 2026-02-10 08:00 UTC. Tomorrow 4AM Sofia = 2026-02-11 02:00 UTC.
      const now = new Date('2026-02-10T08:00:00Z');
      expect(computeDeadline('daily', now, null)).toBe('2026-02-11T02:00:00.000Z');
    });

    it('after 4AM Sofia → tomorrow 4AM (summer, UTC+3)', () => {
      // 2026-07-15 10:00 Sofia (EEST) = 2026-07-15 07:00 UTC. Tomorrow 4AM Sofia = 2026-07-16 01:00 UTC.
      const now = new Date('2026-07-15T07:00:00Z');
      expect(computeDeadline('daily', now, null)).toBe('2026-07-16T01:00:00.000Z');
    });
  });

  describe('weekly', () => {
    it('Tuesday → next Monday 4AM Sofia (summer)', () => {
      // 2026-07-14 (Tue) 10:00 Sofia EEST = 2026-07-14 07:00 UTC.
      // Next Mon = 2026-07-20 04:00 Sofia EEST = 2026-07-20 01:00 UTC.
      const now = new Date('2026-07-14T07:00:00Z');
      expect(computeDeadline('weekly', now, null)).toBe('2026-07-20T01:00:00.000Z');
    });

    it('Sunday → next Monday 4AM Sofia (winter)', () => {
      // 2026-02-15 (Sun) 14:00 Sofia EET = 2026-02-15 12:00 UTC.
      // Next Mon = 2026-02-16 04:00 Sofia EET = 2026-02-16 02:00 UTC.
      const now = new Date('2026-02-15T12:00:00Z');
      expect(computeDeadline('weekly', now, null)).toBe('2026-02-16T02:00:00.000Z');
    });

    it('Monday before 4AM Sofia → today 4AM (not next week)', () => {
      // 2026-02-16 (Mon) 02:00 Sofia EET = 2026-02-16 00:00 UTC.
      // Today 4AM Sofia EET = 2026-02-16 02:00 UTC.
      const now = new Date('2026-02-16T00:00:00Z');
      expect(computeDeadline('weekly', now, null)).toBe('2026-02-16T02:00:00.000Z');
    });

    it('Monday after 4AM Sofia → next Monday 4AM (7 days later)', () => {
      // 2026-02-16 (Mon) 10:00 Sofia EET = 2026-02-16 08:00 UTC.
      // Next Mon = 2026-02-23 04:00 Sofia EET = 2026-02-23 02:00 UTC.
      const now = new Date('2026-02-16T08:00:00Z');
      expect(computeDeadline('weekly', now, null)).toBe('2026-02-23T02:00:00.000Z');
    });
  });

  describe('monthly', () => {
    it('mid-month → 1st of next month 4AM (winter)', () => {
      // 2026-02-15 12:00 Sofia EET = 2026-02-15 10:00 UTC.
      // Next 1st = 2026-03-01 04:00 Sofia EET = 2026-03-01 02:00 UTC.
      const now = new Date('2026-02-15T10:00:00Z');
      expect(computeDeadline('monthly', now, null)).toBe('2026-03-01T02:00:00.000Z');
    });

    it('mid-month → 1st of next month 4AM (summer)', () => {
      // 2026-07-15 12:00 Sofia EEST = 2026-07-15 09:00 UTC.
      // Next 1st = 2026-08-01 04:00 Sofia EEST = 2026-08-01 01:00 UTC.
      const now = new Date('2026-07-15T09:00:00Z');
      expect(computeDeadline('monthly', now, null)).toBe('2026-08-01T01:00:00.000Z');
    });

    it('December → January 1 of next year', () => {
      // 2026-12-15 12:00 Sofia EET = 2026-12-15 10:00 UTC.
      // Next 1st = 2027-01-01 04:00 Sofia EET = 2027-01-01 02:00 UTC.
      const now = new Date('2026-12-15T10:00:00Z');
      expect(computeDeadline('monthly', now, null)).toBe('2027-01-01T02:00:00.000Z');
    });
  });

  describe('DST boundaries (target offset, not now offset)', () => {
    it('spring forward: daily across last Sunday of March', () => {
      // 2026-03-28 (Sat) 20:00 UTC = 22:00 Sofia EET (UTC+2, pre-DST).
      // Today's 4AM already past → tomorrow 4AM Sofia EEST (UTC+3) = 2026-03-29 01:00 UTC.
      // Using `now` offset (+120) would produce 02:00 UTC — that's the bug we fixed.
      const now = new Date('2026-03-28T20:00:00Z');
      expect(computeDeadline('daily', now, null)).toBe('2026-03-29T01:00:00.000Z');
    });

    it('fall back: daily across last Sunday of October', () => {
      // 2026-10-24 (Sat) 20:00 UTC = 23:00 Sofia EEST (UTC+3, pre-fallback).
      // Today's 4AM already past → tomorrow 4AM Sofia EET (UTC+2) = 2026-10-25 02:00 UTC.
      // Using `now` offset (+180) would produce 01:00 UTC.
      const now = new Date('2026-10-24T20:00:00Z');
      expect(computeDeadline('daily', now, null)).toBe('2026-10-25T02:00:00.000Z');
    });

    it('spring forward: monthly across April 1 returns EEST UTC', () => {
      // 2026-03-15 mid-month EET → next 1st is 2026-04-01 04:00 EEST = 2026-04-01 01:00 UTC.
      const now = new Date('2026-03-15T10:00:00Z');
      expect(computeDeadline('monthly', now, null)).toBe('2026-04-01T01:00:00.000Z');
    });
  });

  describe('one_time', () => {
    it('returns 4AM Sofia next-day for a calendar-day end_date (DB "YYYY-MM-DD")', () => {
      // Postgres `date` column → PostgREST returns "2026-12-31". Hard
      // expiry under the 4AM Sofia convention is the next morning at
      // 04:00 Sofia → 2027-01-01 02:00Z (winter EET, UTC+2).
      expect(
        computeDeadline('one_time', new Date('2026-01-01T00:00:00Z'), '2026-12-31')
      ).toBe('2027-01-01T02:00:00.000Z');
    });

    it('passes a full ISO timestamp through as the exact instant', () => {
      // Callers that already know the exact UTC instant (not from a `date`
      // column) get that instant back without further offset math.
      expect(
        computeDeadline(
          'one_time',
          new Date('2026-01-01T00:00:00Z'),
          '2026-12-31T15:30:00Z'
        )
      ).toBe('2026-12-31T15:30:00.000Z');
    });

    it('returns null when endDate is null', () => {
      expect(computeDeadline('one_time', new Date('2026-01-01T00:00:00Z'), null)).toBeNull();
    });
  });

  describe('endDate clamp (R1 — daily/weekly/monthly past challenge end)', () => {
    // A daily/weekly/monthly challenge whose end_date has passed should
    // surface the challenge's end as the deadline, not "next 4AM" rolling
    // forward forever. Participant rows can outlive the challenge if no
    // auto-expire trigger has fired yet.
    it('daily: returns endDate when it is before next 4AM', () => {
      const now = new Date('2026-02-10T08:00:00Z'); // weeks past end
      expect(computeDeadline('daily', now, '2026-01-15T00:00:00Z')).toBe(
        '2026-01-15T00:00:00.000Z'
      );
    });

    it('weekly: returns endDate when it is before next Monday 4AM', () => {
      const now = new Date('2026-02-15T12:00:00Z');
      expect(computeDeadline('weekly', now, '2026-01-15T00:00:00Z')).toBe(
        '2026-01-15T00:00:00.000Z'
      );
    });

    it('monthly: returns endDate when it is before 1st of next month', () => {
      const now = new Date('2026-03-15T10:00:00Z');
      expect(computeDeadline('monthly', now, '2026-02-01T00:00:00Z')).toBe(
        '2026-02-01T00:00:00.000Z'
      );
    });

    it('daily: returns computed deadline when endDate is far in the future', () => {
      const now = new Date('2026-02-09T23:00:00Z');
      // Next 4AM Sofia = 2026-02-10T02:00:00Z; endDate is 2027 → use the computed one.
      expect(computeDeadline('daily', now, '2027-12-31T00:00:00Z')).toBe(
        '2026-02-10T02:00:00.000Z'
      );
    });

    // F1 regression: end_date is a Postgres `date` column (YYYY-MM-DD).
    // Naive new Date('2026-01-15') is UTC midnight = 02:00-03:00 Sofia,
    // which would tell the user the challenge expired BEFORE the start
    // of its actual last day in their timezone. The fix anchors the
    // expiry to the 4AM-Sofia day-boundary convention: a challenge
    // ending 2026-01-15 is playable through 2026-01-16T04:00 Sofia.
    it('daily: calendar-day end_date is treated as end-of-day Sofia (4AM next morning)', () => {
      // 2026-01-15 09:00 Sofia EET (UTC+2) = 2026-01-15 07:00 UTC.
      // User opens the app on the morning of the LAST playable day.
      const now = new Date('2026-01-15T07:00:00Z');
      // Without the fix: clamp returns 2026-01-15T00:00:00.000Z (7 hours
      // in the past on the user's clock). With the fix: 2026-01-16
      // 04:00 Sofia EET = 2026-01-16 02:00 UTC.
      expect(computeDeadline('daily', now, '2026-01-15')).toBe(
        '2026-01-16T02:00:00.000Z'
      );
    });

    it('daily: calendar-day end_date deep in the past clamps to that day, not midnight', () => {
      const now = new Date('2026-02-10T08:00:00Z');
      // end_date '2026-01-15' (calendar day) → hard expiry 2026-01-16T02:00:00Z.
      expect(computeDeadline('daily', now, '2026-01-15')).toBe(
        '2026-01-16T02:00:00.000Z'
      );
    });
  });
});
