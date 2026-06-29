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
// TODO (future issues): #138 owns leaderboard reads; #139 owns trainer
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

// ─── Deadline computation (4AM Europe/Sofia boundary) ──────────────────────
//
// Returns the next deadline timestamp for a given cadence. Implementation
// uses native Date with manual Sofia offset math — Sofia is UTC+2 (EET)
// in winter and UTC+3 (EEST) in summer. We rely on Intl.DateTimeFormat
// for the offset rather than hardcoding DST rules.

// Lazy singleton: constructing Intl.DateTimeFormat is heavy (pulls in tz
// data and compiles a formatter), and the options never vary. Building it
// per call to sofiaOffsetMinutes meant N allocations per render. We
// initialize on first use rather than at module import so that any future
// runtime without 'Europe/Sofia' tz data degrades the My-Challenges screen
// instead of breaking the import for every screen that transitively pulls
// this module.
let sofiaFormatter: Intl.DateTimeFormat | null = null;
function getSofiaFormatter(): Intl.DateTimeFormat {
  if (sofiaFormatter === null) {
    sofiaFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sofia',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
  return sofiaFormatter;
}

function sofiaOffsetMinutes(at: Date): number {
  // Asia approach: format the moment in Sofia and compute UTC delta.
  const sofiaParts = getSofiaFormatter().formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of sofiaParts) if (p.type !== 'literal') m[p.type] = p.value;
  // Reconstruct as if Sofia local time were UTC, then diff against the real UTC.
  const asIfUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour),
    Number(m.minute),
    Number(m.second)
  );
  return Math.round((asIfUtc - at.getTime()) / 60000);
}

// Exported for tests; not part of the public service API. Callers should
// consume `timeRemaining` on ActiveChallengeWithDetails instead of calling
// this directly. Marked with the underscore prefix to signal "internal".
export function _computeDeadlineForTest(
  cadence: 'daily' | 'weekly' | 'monthly' | 'one_time',
  now: Date,
  endDate: string | null
): string | null {
  return computeDeadline(cadence, now, endDate);
}

// Maps a calendar-day end_date ("YYYY-MM-DD") or a full ISO timestamp to
// the hard expiry instant in true UTC. Calendar-day input: treat as the
// LAST playable day under the 4AM Sofia convention → the expiry is the
// next morning at 04:00 Sofia. ISO timestamp input: pass through unchanged
// (it's already a precise instant).
function endOfDaySofia(endDate: string): Date | null {
  // Postgres `date` columns serialize as "YYYY-MM-DD". Anything else (full
  // ISO with 'T') we leave alone — the caller already knows the exact
  // instant they want.
  if (!endDate.includes('T')) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
    if (!match) return null;
    const [, y, mo, d] = match;
    // Construct next-day 04:00 as if it were UTC, then shift to true UTC
    // using the Sofia offset at that instant (handles DST symmetrically
    // with the main computeDeadline logic).
    const nextDayUtcWall = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1, 4, 0, 0)
    );
    const offset = sofiaOffsetMinutes(nextDayUtcWall);
    return new Date(nextDayUtcWall.getTime() - offset * 60000);
  }
  const parsed = new Date(endDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeDeadline(
  cadence: 'daily' | 'weekly' | 'monthly' | 'one_time',
  now: Date,
  endDate: string | null
): string | null {
  if (cadence === 'one_time') {
    // one_time: the challenge's hard expiry IS the end date (under the
    // 4AM Sofia day-boundary convention if end_date is calendar-day).
    if (!endDate) return null;
    const expiry = endOfDaySofia(endDate);
    return expiry ? expiry.toISOString() : null;
  }

  const offsetMin = sofiaOffsetMinutes(now);
  // Convert "now" into a virtual Sofia-local instant by shifting the UTC clock.
  const sofiaNow = new Date(now.getTime() + offsetMin * 60000);
  const sofiaYear = sofiaNow.getUTCFullYear();
  const sofiaMonth = sofiaNow.getUTCMonth();
  const sofiaDate = sofiaNow.getUTCDate();
  const sofiaHour = sofiaNow.getUTCHours();
  const sofiaDow = sofiaNow.getUTCDay(); // 0=Sun..6=Sat

  let target: Date;
  if (cadence === 'daily') {
    // Next 4AM Sofia. If we're past 4AM today, jump to tomorrow.
    const dayOffset = sofiaHour >= 4 ? 1 : 0;
    target = new Date(Date.UTC(sofiaYear, sofiaMonth, sofiaDate + dayOffset, 4, 0, 0));
  } else if (cadence === 'weekly') {
    // Next Monday 4AM Sofia. Monday = 1; if today is Monday after 4AM, jump 7 days.
    const daysUntilMonday = (8 - sofiaDow) % 7 || 7;
    const dayOffset = sofiaDow === 1 && sofiaHour < 4 ? 0 : daysUntilMonday;
    target = new Date(Date.UTC(sofiaYear, sofiaMonth, sofiaDate + dayOffset, 4, 0, 0));
  } else {
    // monthly: 1st of next month at 4AM Sofia.
    target = new Date(Date.UTC(sofiaYear, sofiaMonth + 1, 1, 4, 0, 0));
  }

  // Shift the Sofia-local target back to true UTC. Use the offset at the
  // TARGET instant, not at `now` — otherwise a deadline that crosses the
  // DST boundary (spring or autumn) is off by one hour twice a year.
  const targetOffsetMin = sofiaOffsetMinutes(target);
  const targetUtc = new Date(target.getTime() - targetOffsetMin * 60000);

  // Clamp to challenge.endDate: a daily/weekly/monthly challenge whose end
  // date has passed must not advertise a future "next 4AM" deadline. The
  // participant row can outlive the challenge (no auto-expire trigger), so
  // computeDeadline is the last line of defense for the UI.
  //
  // `challenges.end_date` is a Postgres `date` (calendar day, no time) —
  // PostgREST returns it as "YYYY-MM-DD". The 4AM-Sofia day-boundary
  // convention says a calendar day runs from 04:00 Sofia to 04:00 Sofia
  // next morning, so a challenge with end_date='2026-01-15' is genuinely
  // playable through 2026-01-16T04:00 Sofia. Naive `new Date("2026-01-15")`
  // parses as UTC midnight — 02:00-03:00 Sofia depending on DST — which
  // would show the challenge as already expired on the morning of its
  // actual last day. Compute the true hard expiry instead.
  if (endDate) {
    const expiry = endOfDaySofia(endDate);
    if (expiry !== null && expiry.getTime() < targetUtc.getTime()) {
      return expiry.toISOString();
    }
  }
  return targetUtc.toISOString();
}

// ─── My-Challenges types (#137) ─────────────────────────────────────────────

export interface ActiveChallengeWithDetails {
  participant: ChallengeParticipant;
  challenge: Challenge;
  progressPercentage: number;
  /** ISO 8601 timestamp of the next deadline, or null if no deadline applies. */
  timeRemaining: string | null;
  isStreakBroken: boolean;
  /** Number of streak days lost vs. longest. Null for non-streak challenges. */
  streakComebackDiff: number | null;
}

export interface AbandonResult {
  ok: boolean;
  error?: 'not_active' | 'unknown';
}

export type ReportProgressError =
  | 'not_self_reported'
  | 'not_active'
  | 'invalid_value'
  | 'not_found'
  | 'unauthenticated'
  | 'unknown';

export interface ReportResult {
  ok: boolean;
  newProgress?: number;
  completed?: boolean;
  error?: ReportProgressError;
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

// ─── My Challenges ──────────────────────────────────────────────────────────

/**
 * Returns the user's active challenges with derived UI fields
 * (progress %, deadline, streak-comeback signals). For streak-type
 * challenges, the trigger from #133 writes the current streak count
 * into `current_progress`, so `currentProgress` IS the current streak.
 *
 * Comeback fields are populated only for `challengeType === 'streak'`;
 * for frequency / custom types they are `false` / `null` because
 * `longestStreak` is not meaningful in those contexts.
 */
export async function getActiveChallenges(
  userId: string
): Promise<ActiveChallengeWithDetails[]> {
  const { data, error } = await sb
    .from('challenge_participants')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('getActiveChallenges failed', error);
    throw new Error('Failed to load active challenges');
  }

  const now = new Date();
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows
    // Filter orphans: a participant row whose joined `challenge` is null
    // (FK cascade should make this unreachable, but RLS can hide the parent
    // row in tenancy edge cases). mapRowToParticipant substitutes {} for a
    // missing challenge, which would silently produce wrong cadence and
    // NaN progress downstream.
    .filter((row) => row.challenge != null)
    .map((row) => {
      const participant = mapRowToParticipant(row);
      const challenge = participant.challenge;
      // `target_value > 0` is enforced by CHECK constraints on both
      // challenges and challenge_participants (see
      // 20260601120000_challenges_core_tables.sql), so division here is safe.
      const progressPercentage = Math.min(
        100,
        (participant.currentProgress / participant.targetValue) * 100
      );
      const timeRemaining = computeDeadline(challenge.cadence, now, challenge.endDate);
      const isStreak = challenge.challengeType === 'streak';
      // For streak challenges, surface comeback info in two fields:
      //   - isStreakBroken: strict "you are behind your previous best".
      //   - streakComebackDiff: how far behind, in days.
      //     - positive N: behind by N days
      //     - 0: matched your previous best (UI: "matched your record!")
      //     - null: not applicable — either non-streak, the user has
      //       never built a streak yet (longestStreak === 0; surfacing
      //       "matched your record!" on day zero is misleading), or
      //       they're strictly beating their best (negative diff is
      //       meaningless to render).
      const diff = participant.longestStreak - participant.currentProgress;
      const comebackDiff =
        isStreak && participant.longestStreak > 0 && diff >= 0 ? diff : null;
      return {
        participant,
        challenge,
        progressPercentage,
        timeRemaining,
        isStreakBroken: comebackDiff !== null && comebackDiff > 0,
        streakComebackDiff: comebackDiff,
      };
    });
}

/**
 * Marks an active participation as abandoned. Caller's identity is
 * enforced by RLS (#130) — the UPDATE policy on challenge_participants
 * requires `user_id = auth.uid()` server-side, so an unauthenticated or
 * cross-user attempt simply matches zero rows and returns `not_active`.
 *
 * We deliberately do NOT call supabase.auth.getSession() here: per
 * Supabase docs, getSession() reads local storage without server
 * verification and can return a stale session. Putting it in front of
 * RLS doesn't add defense — RLS catches anything getSession() catches,
 * and adds nothing for valid sessions — while breaking UX during token
 * refresh races. Matches the pickChallenge pattern.
 */
export async function abandonChallenge(challengeId: string): Promise<AbandonResult> {
  const { data, error } = await sb
    .from('challenge_participants')
    .update({ status: 'abandoned' })
    .eq('challenge_id', challengeId)
    .eq('status', 'active')
    .select('id');

  if (error) {
    console.error('abandonChallenge failed', error);
    return { ok: false, error: 'unknown' };
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return { ok: false, error: 'not_active' };
  return { ok: true };
}

/**
 * Reports incremental progress on a `custom_self_reported` challenge.
 * Calls `fn_report_progress` server-side — atomic transaction with row
 * lock prevents double-completion. Returns ReportResult with newProgress
 * (capped at target) and completed flag.
 */
export async function reportProgress(
  challengeId: string,
  value: number
): Promise<ReportResult> {
  // Client-side validation. The TS `number` type does NOT exclude NaN /
  // Infinity / floats at runtime, and JSON.stringify serializes both
  // NaN and Infinity as `null` (ECMA-262 §25.5.2). PostgREST passes JSON
  // null through to the SQL function as NULL, which would slip past the
  // server's `p_value <= 0 or p_value > 100000` guard via three-valued
  // logic (NULL OR NULL → NULL → falsy). Catch it here so the typed
  // error contract is honored.
  if (!Number.isInteger(value) || value <= 0 || value > 100000) {
    return { ok: false, error: 'invalid_value' };
  }

  const { data, error } = await sb.rpc('fn_report_progress', {
    p_challenge_id: challengeId,
    p_value: value,
  });

  if (error) {
    console.error('fn_report_progress failed', error);
    return { ok: false, error: 'unknown' };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    error?: ReportProgressError;
    new_progress?: number;
    completed?: boolean;
  };

  if (result.ok) {
    return {
      ok: true,
      newProgress: result.new_progress,
      completed: result.completed,
    };
  }

  return { ok: false, error: result.error ?? 'unknown' };
}

/**
 * Returns the user's completed and abandoned challenges, newest first.
 * Default limit 20; pass a different value for paginated history views.
 */
export async function getChallengeHistory(
  userId: string,
  limit: number = 20
): Promise<ChallengeParticipant[]> {
  const { data, error } = await sb
    .from('challenge_participants')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .in('status', ['completed', 'abandoned'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('getChallengeHistory failed', error);
    throw new Error('Failed to load challenge history');
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRowToParticipant);
}
