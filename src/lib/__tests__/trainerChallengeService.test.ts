import {
  saveTrainerTemplate,
  getTrainerTemplates,
  deleteTrainerTemplate,
  createTrainerChallenge,
  updateClientProgress,
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

  it.each(['', '   '])('rejects trainerId %p before any network call', async (bad) => {
    const res = await saveTrainerTemplate(bad, params);
    expect(res).toEqual({ success: false, error: 'invalid_input' });
    expect(mockQueries).toHaveLength(0);
  });

  it('trims the title in the inserted payload', async () => {
    mockQueue.push({ data: { id: 'tpl-9' }, error: null });
    const res = await saveTrainerTemplate('trainer-1', { ...params, title: '  Weekly Cardio Block  ' });
    expect(res).toEqual({ success: true, id: 'tpl-9' });
    const insertCall = mockQueries[0].filters.find((f) => f.method === 'insert');
    expect((insertCall!.args[0] as Record<string, unknown>).title).toBe('Weekly Cardio Block');
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
