import { supabase } from './supabase';
import type {
  Challenge,
  ChallengeParticipant,
  DiscoveryCard,
  UserChallengeState,
} from '../types';

// The generated `Database` type in src/types/database.ts predates the
// challenge tables (#128 / #129 / this issue's #136 cooldowns) and the
// fn_pick_challenge RPC. Until database.ts is regenerated, work through
// an untyped view of the client for these calls. Row-level shapes are
// validated at the mapper boundary (mapRowToChallenge etc.).
type SupabaseClient = typeof supabase;
type SupabaseFrom = SupabaseClient['from'];
type SupabaseRpc = SupabaseClient['rpc'];
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<SupabaseFrom>;
  rpc: (fn: string, args?: Record<string, unknown>) => ReturnType<SupabaseRpc>;
};

// ─── Constants from design spec (Documentation/Gamification.md) ──────────────
//
// Source of truth for the per-cadence pool / active / completion limits.
// Changing these here is a behavior change — keep in sync with the
// matching CASE expressions in fn_pick_challenge (#136 RPC migration)
// and the freeze check in fn_workout_log_challenge_progress (#133).
//
// userId parameter contract: read functions (`getDiscoveryPool`,
// `getUserChallengeProgress`, `getUserChallengeState`) take a userId
// and use it as an explicit `eq('user_id', ...)` filter. RLS (#130)
// additionally enforces `auth.uid() = user_id`, so a caller that
// passes a userId that doesn't match the authenticated session will
// silently get back empty results. Callers are expected to thread
// the auth user (matches the pattern in goalService.ts /
// feedbackService.ts). Mutations (`pickChallenge`) do NOT take a
// userId — they go through the RPC which reads `auth.uid()` directly.
//
// TODO (future issues): #137 owns getActiveChallenges, abandonChallenge,
// reportProgress; #138 owns leaderboard reads; #139 owns trainer
// challenge writes. This file will accumulate them.

const POOL_SIZE = { daily: 3, weekly: 3, monthly: 5 } as const;
const MAX_ACTIVE = { daily: 1, weekly: 3, monthly: 5 } as const;
const MAX_COMPLETIONS = { daily: 1, weekly: 5, monthly: 10 } as const;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

type Cadence = 'daily' | 'weekly' | 'monthly';

// ─── Row → domain mappers ────────────────────────────────────────────────────

function mapRowToChallenge(row: Record<string, unknown>): Challenge {
  return {
    id: row.id as string,
    templateId: (row.template_id as string | null) ?? null,
    creatorId: (row.creator_id as string | null) ?? null,
    source: row.source as Challenge['source'],
    title: row.title as string,
    titleBg: (row.title_bg as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    descriptionBg: (row.description_bg as string | null) ?? null,
    challengeType: row.challenge_type as Challenge['challengeType'],
    cadence: row.cadence as Challenge['cadence'],
    difficulty: (row.difficulty as Challenge['difficulty']) ?? null,
    targetValue: row.target_value as number,
    points: row.points as number,
    category: (row.category as string | null) ?? null,
    status: row.status as Challenge['status'],
    startDate: row.start_date as string,
    endDate: (row.end_date as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapRowToParticipant(row: Record<string, unknown>): ChallengeParticipant {
  const challengeRow = row.challenge as Record<string, unknown> | null;
  return {
    id: row.id as string,
    challengeId: row.challenge_id as string,
    userId: row.user_id as string,
    currentProgress: row.current_progress as number,
    longestStreak: row.longest_streak as number,
    targetValue: row.target_value as number,
    status: row.status as ChallengeParticipant['status'],
    joinedAt: row.joined_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    source: row.source as ChallengeParticipant['source'],
    createdAt: row.created_at as string,
    challenge: challengeRow ? mapRowToChallenge(challengeRow) : ({} as Challenge),
  };
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * Returns the current pool of available platform challenges for the user,
 * grouped by cadence. Filters out:
 *   - challenges the user already has active (no point in showing them)
 *   - templates in the user's recent_template_ids (anti-repetition, E3)
 *
 * Cards are tagged with their state:
 *   - 'available': pickable
 *   - 'cooldown': template was picked < 1h ago, blurred with countdown
 *   - 'limit_reached': cadence-level active or completion limit hit;
 *     blurred with countdown to next reset
 *
 * Pool is capped at POOL_SIZE per cadence. Order is current
 * `created_at` order — content rotation is an admin concern; this
 * service just reads what's currently `status='active'`.
 */
export async function getDiscoveryPool(
  userId: string
): Promise<{ daily: DiscoveryCard[]; weekly: DiscoveryCard[]; monthly: DiscoveryCard[] }> {
  // Pull everything we need in parallel — these queries don't depend
  // on each other and Supabase fans them out over the same connection.
  const [activeChallengesRes, stateRes, cooldownsRes, poolRes] = await Promise.all([
    sb
      .from('challenge_participants')
      .select('challenge_id, status, challenges!inner(cadence, source)')
      .eq('user_id', userId)
      .eq('status', 'active'),
    sb
      .from('user_challenge_state')
      .select('cadence, completions_this_period, recent_template_ids')
      .eq('user_id', userId),
    sb
      .from('challenge_pick_cooldowns')
      .select('template_id, picked_at')
      .eq('user_id', userId),
    sb
      .from('challenges')
      .select('*')
      .eq('status', 'active')
      .eq('source', 'platform')
      .in('cadence', ['daily', 'weekly', 'monthly'])
      // Pool caps at 3+3+5=11 visible cards. Anti-repetition + active-filter
      // can drop entries before the cap is reached, so fetch a small superset
      // (10× cap) to leave headroom without loading the entire active catalog.
      // If the catalog grows large enough that even 10× isn't enough, the
      // discovery view will silently show fewer cards in some cadences —
      // acceptable v1 behavior; revisit when content rotation lands.
      .order('created_at', { ascending: true })
      .limit(110),
  ]);

  if (activeChallengesRes.error) throw new Error(activeChallengesRes.error.message);
  if (stateRes.error) throw new Error(stateRes.error.message);
  if (cooldownsRes.error) throw new Error(cooldownsRes.error.message);
  if (poolRes.error) throw new Error(poolRes.error.message);

  const activeRows = (activeChallengesRes.data ?? []) as {
    challenge_id: string;
    challenges: { cadence: Cadence; source: string };
  }[];
  const stateRows = (stateRes.data ?? []) as {
    cadence: Cadence;
    completions_this_period: number;
    recent_template_ids: string[] | null;
  }[];
  const cooldownRows = (cooldownsRes.data ?? []) as {
    template_id: string;
    picked_at: string;
  }[];
  const allChallenges = (poolRes.data ?? []).map((r: unknown) =>
    mapRowToChallenge(r as Record<string, unknown>)
  );

  // Active challenge ids — used to filter out "already have it" cards.
  const activeChallengeIds = new Set(activeRows.map((r) => r.challenge_id));

  // Active platform-challenge counts per cadence — for limit_reached state.
  const activeCountByCadence: Record<Cadence, number> = { daily: 0, weekly: 0, monthly: 0 };
  for (const row of activeRows) {
    if (row.challenges.source === 'platform') {
      activeCountByCadence[row.challenges.cadence] += 1;
    }
  }

  // State lookup tables.
  const completionsByCadence: Record<Cadence, number> = { daily: 0, weekly: 0, monthly: 0 };
  const recentByCadence: Record<Cadence, Set<string>> = {
    daily: new Set(),
    weekly: new Set(),
    monthly: new Set(),
  };
  for (const row of stateRows) {
    completionsByCadence[row.cadence] = row.completions_this_period;
    recentByCadence[row.cadence] = new Set(row.recent_template_ids ?? []);
  }

  const cooldownByTemplate = new Map<string, number>();
  for (const row of cooldownRows) {
    cooldownByTemplate.set(row.template_id, new Date(row.picked_at).getTime());
  }

  const now = Date.now();

  const buildCard = (challenge: Challenge): DiscoveryCard | null => {
    if (challenge.cadence === 'one_time') return null;
    const cadence = challenge.cadence as Cadence;

    // Filter: already enrolled in this exact challenge.
    if (activeChallengeIds.has(challenge.id)) return null;

    // Filter: anti-repetition (E3).
    if (challenge.templateId && recentByCadence[cadence].has(challenge.templateId)) {
      return null;
    }

    // State: cooldown (per-template, 1h after last pick of that template).
    if (challenge.templateId) {
      const pickedAt = cooldownByTemplate.get(challenge.templateId);
      if (pickedAt !== undefined && now - pickedAt < COOLDOWN_MS) {
        return {
          challenge,
          state: 'cooldown',
          availableAt: new Date(pickedAt + COOLDOWN_MS).toISOString(),
        };
      }
    }

    // State: limit_reached if cadence is at active OR completion limit.
    // availableAt is null because the next-reset time depends on calendar
    // math the UI computes (Daily=4AM tomorrow, Weekly=next Monday 4AM,
    // Monthly=1st 4AM). The service exposes the state; the UI formats
    // the countdown.
    const atActiveLimit = activeCountByCadence[cadence] >= MAX_ACTIVE[cadence];
    const atCompletionLimit = completionsByCadence[cadence] >= MAX_COMPLETIONS[cadence];
    if (atActiveLimit || atCompletionLimit) {
      return { challenge, state: 'limit_reached', availableAt: null };
    }

    return { challenge, state: 'available', availableAt: null };
  };

  // Group, drop nulls, cap at POOL_SIZE per cadence.
  const grouped: { daily: DiscoveryCard[]; weekly: DiscoveryCard[]; monthly: DiscoveryCard[] } = {
    daily: [],
    weekly: [],
    monthly: [],
  };
  for (const challenge of allChallenges) {
    if (challenge.cadence === 'one_time') continue;
    const cadence = challenge.cadence as Cadence;
    if (grouped[cadence].length >= POOL_SIZE[cadence]) continue;
    const card = buildCard(challenge);
    if (card) grouped[cadence].push(card);
  }

  return grouped;
}

// ─── Pick ────────────────────────────────────────────────────────────────────

export type PickChallengeError =
  | 'not_found'
  | 'inactive'
  | 'not_platform'
  | 'already_active'
  | 'already_picked'
  | 'cooldown'
  | 'limit_reached'
  | 'unauthenticated'
  | 'unknown';

export interface PickChallengeResult {
  ok: boolean;
  error?: PickChallengeError;
  participantId?: string;
  /** ISO timestamp when the cooldown ends, present when error === 'cooldown'. */
  availableAt?: string;
}

/**
 * Atomically pick a platform challenge from the discovery pool.
 *
 * The RPC reads `auth.uid()` server-side, so this function does not take
 * a userId parameter — the calling user is whoever the supabase client
 * is currently authenticated as.
 *
 * All validation and writes happen server-side in fn_pick_challenge —
 * see `supabase/migrations/20260608120000_challenges_pick_rpc.sql`.
 * The RPC enforces cooldown, active-limit, completion-limit,
 * already-active, and already-picked-and-finished checks under a row
 * lock, and updates user_challenge_state.recent_template_ids +
 * challenge_pick_cooldowns in the same transaction.
 */
export async function pickChallenge(challengeId: string): Promise<PickChallengeResult> {
  const { data, error } = await sb.rpc('fn_pick_challenge', {
    p_challenge_id: challengeId,
  });

  if (error) {
    return { ok: false, error: 'unknown' };
  }

  // RPC returns jsonb. Supabase JS surfaces it as the `data` field.
  const result = (data ?? {}) as {
    ok?: boolean;
    error?: PickChallengeError;
    participant_id?: string;
    available_at?: string;
  };

  if (result.ok) {
    return { ok: true, participantId: result.participant_id };
  }
  // `availableAt` is only meaningful for the 'cooldown' error; don't
  // leak it onto other error shapes (limit_reached / not_found / ...).
  const err: PickChallengeError = result.error ?? 'unknown';
  if (err === 'cooldown' && result.available_at) {
    return { ok: false, error: 'cooldown', availableAt: result.available_at };
  }
  return { ok: false, error: err };
}

// ─── Per-challenge participation lookup ──────────────────────────────────────

export async function getUserChallengeProgress(
  userId: string,
  challengeId: string
): Promise<ChallengeParticipant | null> {
  const { data, error } = await sb
    .from('challenge_participants')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowToParticipant(data as unknown as Record<string, unknown>);
}

// ─── Per-cadence state (Discovery header / pre-validation) ───────────────────

/**
 * Returns the user's per-cadence state: completion counts, active counts,
 * cooldown end (per-cadence), and the limits that gate them. Used by the
 * Discovery header and as a pre-validation before opening the detail
 * sheet (final check still runs in fn_pick_challenge).
 *
 * The returned `cooldownEndsAt` is the latest per-cadence pick — informational
 * for the header; per-template cooldown for individual cards is computed
 * inside `getDiscoveryPool`.
 *
 * Always returns one entry per cadence. Cadences the user has never
 * touched come back zeroed.
 */
export async function getUserChallengeState(userId: string): Promise<UserChallengeState[]> {
  const [stateRes, activeRes] = await Promise.all([
    sb
      .from('user_challenge_state')
      .select('cadence, completions_this_period, last_pick_at')
      .eq('user_id', userId),
    sb
      .from('challenge_participants')
      .select('challenges!inner(cadence, source)')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  if (stateRes.error) throw new Error(stateRes.error.message);
  if (activeRes.error) throw new Error(activeRes.error.message);

  const stateByCadence = new Map<Cadence, { completions: number; lastPickAt: string | null }>();
  for (const row of (stateRes.data ?? []) as {
    cadence: Cadence;
    completions_this_period: number;
    last_pick_at: string | null;
  }[]) {
    stateByCadence.set(row.cadence, {
      completions: row.completions_this_period,
      lastPickAt: row.last_pick_at,
    });
  }

  const activeCounts: Record<Cadence, number> = { daily: 0, weekly: 0, monthly: 0 };
  for (const row of (activeRes.data ?? []) as {
    challenges: { cadence: Cadence; source: string };
  }[]) {
    if (row.challenges.source === 'platform') {
      activeCounts[row.challenges.cadence] += 1;
    }
  }

  const cadences: Cadence[] = ['daily', 'weekly', 'monthly'];
  return cadences.map((cadence) => {
    const s = stateByCadence.get(cadence);
    const lastPickAt = s?.lastPickAt ?? null;
    const cooldownEndsAt = lastPickAt
      ? new Date(new Date(lastPickAt).getTime() + COOLDOWN_MS).toISOString()
      : null;
    return {
      cadence,
      completionsThisPeriod: s?.completions ?? 0,
      maxCompletions: MAX_COMPLETIONS[cadence],
      activeCount: activeCounts[cadence],
      maxActive: MAX_ACTIVE[cadence],
      lastPickAt,
      cooldownEndsAt,
    };
  });
}
