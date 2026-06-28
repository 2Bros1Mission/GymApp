import { supabase } from './supabase';
import type {
  LeaderboardEntry,
  LeaderboardHistoryEntry,
  UserRankInfo,
} from '../types';

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

function mapRowToHistory(row: Record<string, unknown>): LeaderboardHistoryEntry {
  return {
    month: row.month as string,
    rank: row.final_rank as number,
    points: row.final_points as number,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
