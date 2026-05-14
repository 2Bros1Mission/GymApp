import { saveWorkoutLog, getWorkoutStats, getWorkoutHistory } from '../workoutService';

// Mock the supabase client
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Helper to set up chained query mocks
function setupQueryChain(result: { data: unknown; error: unknown }) {
  mockLimit.mockReturnValue(result);
  mockOrder.mockReturnValue({ limit: mockLimit, ...result });
  mockEq.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveWorkoutLog', () => {
  const params = {
    userId: 'user-123',
    workoutId: 'workout-1',
    workoutName: 'Push Day',
    durationSeconds: 3600,
    exercises: [
      {
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [
          { setNumber: 1, weight: 80, reps: 10, completed: true },
          { setNumber: 2, weight: 85, reps: 8, completed: true },
        ],
      },
    ],
  };

  it('should call supabase.rpc with correct parameters', async () => {
    mockRpc.mockResolvedValue({ data: 'log-id-123', error: null });

    const result = await saveWorkoutLog(params);

    expect(mockRpc).toHaveBeenCalledWith('save_workout', {
      p_user_id: 'user-123',
      p_workout_id: 'workout-1',
      p_workout_name: 'Push Day',
      p_duration_seconds: 3600,
      p_notes: undefined,
      p_exercises: [
        {
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          orderIndex: 0,
          sets: [
            { setNumber: 1, weight: 80, reps: 10, completed: true },
            { setNumber: 2, weight: 85, reps: 8, completed: true },
          ],
        },
      ],
    });
    expect(result.error).toBeNull();
    expect(result.workoutLogId).toBe('log-id-123');
  });

  it('should return error on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Database error' } });

    const result = await saveWorkoutLog(params);

    expect(result.error).toBe('Database error');
    expect(result.workoutLogId).toBeUndefined();
  });

  it('should pass notes when provided', async () => {
    mockRpc.mockResolvedValue({ data: 'log-id-456', error: null });

    await saveWorkoutLog({ ...params, notes: 'Felt strong today' });

    expect(mockRpc).toHaveBeenCalledWith('save_workout', expect.objectContaining({
      p_notes: 'Felt strong today',
    }));
  });
});

describe('getWorkoutStats', () => {
  it('should return zero stats when no logs exist', async () => {
    setupQueryChain({ data: [], error: null });

    const stats = await getWorkoutStats('user-123');

    expect(stats.totalWorkouts).toBe(0);
    expect(stats.streak).toBe(0);
    expect(stats.thisWeek).toBe(0);
  });

  it('should throw on Supabase error', async () => {
    setupQueryChain({ data: null, error: { message: 'Network error' } });

    await expect(getWorkoutStats('user-123')).rejects.toThrow('Network error');
  });

  it('should calculate totalWorkouts correctly', async () => {
    const today = new Date().toISOString().split('T')[0];
    setupQueryChain({
      data: [
        { id: '1', date: today, duration_seconds: 3600 },
        { id: '2', date: today, duration_seconds: 1800 },
      ],
      error: null,
    });

    const stats = await getWorkoutStats('user-123');

    expect(stats.totalWorkouts).toBe(2);
  });
});

describe('getWorkoutHistory', () => {
  it('should throw on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Error' } });

    await expect(getWorkoutHistory('user-123')).rejects.toThrow('Error');
  });

  it('should return workout logs', async () => {
    const logs = [
      { id: '1', workout_name: 'Push Day', date: '2026-05-13', duration_seconds: 3600 },
    ];
    setupQueryChain({ data: logs, error: null });

    const history = await getWorkoutHistory('user-123');

    expect(history).toEqual(logs);
  });
});
