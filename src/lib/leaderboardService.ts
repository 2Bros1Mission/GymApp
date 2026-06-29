import { supabase } from './supabase';
import type {
  LeaderboardEntry,
  LeaderboardHistoryEntry,
  UserRankInfo,
} from '../types';

// The generated Database type predates the leaderboard tables; until it's
// regenerated, work through an untyped view for these reads. Row-level
// shapes are validated at the mapper boundary (asString / asNumber /
// validateRankPayload).
//
// TODO(#138-followup): once `supabase gen types typescript` is rerun against
// migrations 20260601..20260629 the launder + per-call casts here can go.
type SupabaseClient = typeof supabase;
type SupabaseFrom = SupabaseClient['from'];
type SupabaseRpc = SupabaseClient['rpc'];
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<SupabaseFrom>;
  rpc: (fn: string, params?: Record<string, unknown>) => ReturnType<SupabaseRpc>;
};

// ─── Limits ──────────────────────────────────────────────────────────────────

// refresh_leaderboard_snapshot() caps the snapshot at top 100 rows
// (20260606120000_challenges_scheduled_fns.sql:317). Allowing limit > 100
// from the client silently truncates without telling the caller, so the
// validator is aligned with the actual data ceiling.
const LEADERBOARD_MAX_LIMIT = 100;

// History retention is 12 months (Issue #134); UI never needs more than that.
const HISTORY_MAX_LIMIT = 24;

const SNAPSHOT_COLUMNS = 'rank, user_id, user_name, points, refreshed_at';

// ─── Runtime validators ──────────────────────────────────────────────────────

function asNumber(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}

function asString(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v !== 'string') {
    throw new Error(`malformed_row:${key}`);
  }
  return v;
}

function assertNonEmptyUserId(userId: unknown): string {
  if (typeof userId !== 'string') throw new Error('invalid_user_id');
  const trimmed = userId.trim();
  if (trimmed.length === 0) throw new Error('invalid_user_id');
  return trimmed;
}

function assertLimit(limit: number, max: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new Error('invalid_limit');
  }
}

// ─── Error helper ────────────────────────────────────────────────────────────
//
// Every read path follows the same shape: log the raw PostgrestError under a
// stable prefix (so a debugger can find the failing leg) and throw a generic
// user-facing message (so policy / constraint names never reach the UI).

function expectOk(label: string, err: unknown, userMessage: string): void {
  if (!err) return;
  console.error(`[leaderboardService] ${label}:`, err);
  throw new Error(userMessage);
}

// ─── Row → domain mappers ────────────────────────────────────────────────────

function mapRowToEntry(row: Record<string, unknown>): LeaderboardEntry {
  return {
    rank: asNumber(row, 'rank'),
    userId: asString(row, 'user_id'),
    userName: asString(row, 'user_name'),
    points: asNumber(row, 'points'),
    refreshedAt: asString(row, 'refreshed_at'),
  };
}

function mapRowToHistory(row: Record<string, unknown>): LeaderboardHistoryEntry {
  // leaderboard_history.month is a Postgres `date` with CHECK day = 1, so
  // PostgREST serializes it as 'YYYY-MM-01'. The public contract is
  // 'YYYY-MM' (LeaderboardHistoryEntry.month), so slice off the day part
  // here at the boundary instead of leaking the 10-char form to consumers.
  // Validate the shape before slicing — if PostgREST ever serializes the
  // column differently (timezone-converted timestamp, alt year format) the
  // slice would silently produce garbage like '26-05-0'.
  const raw = asString(row, 'month');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('malformed_row:month');
  }
  return {
    month: raw.slice(0, 7),
    rank: asNumber(row, 'final_rank'),
    points: asNumber(row, 'final_points'),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getLeaderboard(
  limit: number = LEADERBOARD_MAX_LIMIT,
): Promise<LeaderboardEntry[]> {
  assertLimit(limit, LEADERBOARD_MAX_LIMIT);
  const { data, error } = await sb
    .from('leaderboard_snapshot')
    .select(SNAPSHOT_COLUMNS)
    .order('rank', { ascending: true })
    .limit(limit);
  expectOk('getLeaderboard', error, 'Failed to load leaderboard');
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToEntry(r));
}

// NOTE: getLeaderboardLastUpdated() was removed in the #137 follow-up.
// refresh_leaderboard_snapshot() does TRUNCATE+INSERT in a single transaction
// with now(), so every row carries the same refreshed_at. Callers can read
// the freshness off any entry from getLeaderboard()[0]?.refreshedAt — a
// dedicated freshness query is redundant.

export async function getLeaderboardHistory(
  userId: string,
  limit: number = 6,
): Promise<LeaderboardHistoryEntry[]> {
  const safeUserId = assertNonEmptyUserId(userId);
  assertLimit(limit, HISTORY_MAX_LIMIT);
  const { data, error } = await sb
    .from('leaderboard_history')
    .select('month, final_rank, final_points')
    .eq('user_id', safeUserId)
    .order('month', { ascending: false })
    .limit(limit);
  expectOk('getLeaderboardHistory', error, 'Failed to load leaderboard history');
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToHistory(r));
}

// RPC return shape — single source of truth for fn_get_user_rank_info's
// payload. Kept local; mirrors the jsonb_build_object in the SQL function.
interface RankInfoPayload {
  rank: number | null;
  points: number;
  total_participants: number;
  neighbors: Record<string, unknown>[];
  refreshed_at: string | null;
  profile_missing?: boolean;
}

// Validate the RPC payload at the mapper boundary, same discipline as
// mapRowToEntry / mapRowToHistory — if fn_get_user_rank_info ever returns
// malformed jsonb (missing total_participants, neighbors as object instead
// of array, etc.), surface it as a clean malformed_row error rather than
// letting `undefined as number` poison downstream math or .map() crash on
// a non-array.
function validateRankPayload(data: Record<string, unknown>): RankInfoPayload {
  const rank = data.rank;
  if (rank !== null && (typeof rank !== 'number' || !Number.isFinite(rank))) {
    throw new Error('malformed_row:rank');
  }
  const points = data.points;
  if (typeof points !== 'number' || !Number.isFinite(points)) {
    throw new Error('malformed_row:points');
  }
  const total = data.total_participants;
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    throw new Error('malformed_row:total_participants');
  }
  if (!Array.isArray(data.neighbors)) {
    throw new Error('malformed_row:neighbors');
  }
  const refreshed = data.refreshed_at;
  if (refreshed !== null && typeof refreshed !== 'string') {
    throw new Error('malformed_row:refreshed_at');
  }
  return {
    rank,
    points,
    total_participants: total,
    neighbors: data.neighbors as Record<string, unknown>[],
    refreshed_at: refreshed,
    profile_missing: data.profile_missing === true,
  };
}

export async function getUserRank(userId: string): Promise<UserRankInfo> {
  const safeUserId = assertNonEmptyUserId(userId);

  // Single RPC: own-row + total + neighbors all computed against ONE
  // snapshot version inside one transaction, closing the read-skew race
  // that a 2-statement client composition had across the 30-min
  // refresh_leaderboard_snapshot() boundary. Off-board rank is also
  // computed server-side via COUNT(*) over profiles, per
  // Documentation/Gamification.md §372/§383 — UI no longer needs to
  // special-case `rank: null` for users outside the top 100.
  const { data, error } = (await sb.rpc('fn_get_user_rank_info', {
    p_user_id: safeUserId,
  })) as unknown as { data: Record<string, unknown> | null; error: unknown };

  expectOk('getUserRank', error, 'Failed to load user rank');

  if (!data) {
    // Defensive: SECURITY DEFINER function with a non-null path always
    // returns a row. Reaching here means the rpc layer dropped it.
    throw new Error('Failed to load user rank');
  }

  const payload = validateRankPayload(data);

  if (payload.profile_missing) {
    // handle_new_user trigger invariant: every auth user has a profile.
    // Reaching this branch means the invariant was violated (manual
    // delete bypassing CASCADE, trigger disabled). Surface it as a
    // warning so on-call notices, but don't crash the leaderboard UI.
    console.warn('[leaderboardService] getUserRank: profile row missing for', safeUserId);
  }

  return {
    rank: payload.rank,
    points: payload.points,
    totalParticipants: payload.total_participants,
    neighbors: payload.neighbors.map((n) => {
      if (n === null || typeof n !== 'object') {
        throw new Error('malformed_row:neighbors[]');
      }
      return mapRowToEntry(n as Record<string, unknown>);
    }),
  };
}
