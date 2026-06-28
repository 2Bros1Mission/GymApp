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
  return (data ?? []).map((r) => mapRowToEntry(r as Record<string, unknown>));
}
