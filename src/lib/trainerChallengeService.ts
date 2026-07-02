import { supabase } from './supabase';
import { asNumber, asString } from './rowGuards';
import { mapRowToChallenge } from './challengeService';
import type {
  CreateTrainerChallengeParams,
  SaveTemplateParams,
  TrainerChallengeTemplate,
  TrainerChallengeWithProgress,
} from '../types';

// The generated Database type predates the challenge tables; until it's
// regenerated (#162), work through an untyped view. Row shapes are
// validated at the mapper boundary (rowGuards).
type SupabaseClient = typeof supabase;
type SupabaseFrom = SupabaseClient['from'];
type SupabaseRpc = SupabaseClient['rpc'];
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<SupabaseFrom>;
  rpc: (fn: string, args?: Record<string, unknown>) => ReturnType<SupabaseRpc>;
};

// ─── Row → domain mappers ────────────────────────────────────────────────────

function mapRowToTemplate(row: Record<string, unknown>): TrainerChallengeTemplate {
  return {
    id: asString(row, 'id'),
    trainerId: asString(row, 'trainer_id'),
    title: asString(row, 'title'),
    challengeType: asString(row, 'challenge_type') as TrainerChallengeTemplate['challengeType'],
    targetValue: asNumber(row, 'target_value'),
    category: (row.category as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: asString(row, 'created_at'),
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function saveTrainerTemplate(
  trainerId: string,
  params: SaveTemplateParams,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (typeof trainerId !== 'string' || trainerId.trim().length === 0) {
    return { success: false, error: 'invalid_input' };
  }
  if (params.title.trim().length === 0) {
    return { success: false, error: 'invalid_input' };
  }
  if (!Number.isInteger(params.targetValue) || params.targetValue <= 0 || params.targetValue > 100000) {
    return { success: false, error: 'invalid_input' };
  }
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .insert({
      trainer_id: trainerId,
      title: params.title.trim(),
      challenge_type: params.challengeType,
      target_value: params.targetValue,
      category: params.category ?? null,
      description: params.description ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[trainerChallengeService] saveTrainerTemplate:', error);
    return { success: false, error: 'unknown' };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function getTrainerTemplates(
  trainerId: string,
): Promise<TrainerChallengeTemplate[]> {
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .select('id, trainer_id, title, challenge_type, target_value, category, description, created_at')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[trainerChallengeService] getTrainerTemplates:', error);
    throw new Error('Failed to load templates');
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapRowToTemplate(r));
}

export async function deleteTrainerTemplate(
  templateId: string,
): Promise<{ error?: string }> {
  const { data, error } = await sb
    .from('trainer_challenge_templates')
    .delete()
    .eq('id', templateId)
    .select('id');
  if (error) {
    console.error('[trainerChallengeService] deleteTrainerTemplate:', error);
    return { error: 'unknown' };
  }
  if (!data || (data as unknown[]).length === 0) {
    return { error: 'not_found' };
  }
  return {};
}

// ─── Create ──────────────────────────────────────────────────────────────────

function isValidIntInRange(v: number, min: number, max: number): boolean {
  return Number.isInteger(v) && v >= min && v <= max;
}

export async function createTrainerChallenge(
  params: CreateTrainerChallengeParams,
): Promise<{ success: boolean; challengeId?: string; error?: string }> {
  // Mirrors fn_create_trainer_challenge's validation (S1): reject at
  // the boundary without a round-trip. Dates compare as ISO strings —
  // never new Date('YYYY-MM-DD') (UTC-midnight shift, PR #160).
  const invalid =
    params.title.trim().length === 0 ||
    !isValidIntInRange(params.targetValue, 1, 100000) ||
    params.endDate <= params.startDate ||
    params.participants.length < 1 ||
    params.participants.length > 50 ||
    params.participants.some(
      (p) =>
        p.userId.trim().length === 0 ||
        (p.customTargetValue !== undefined &&
          !isValidIntInRange(p.customTargetValue, 1, 100000)),
    );
  if (invalid) {
    return { success: false, error: 'invalid_input' };
  }

  const { data, error } = await sb.rpc('fn_create_trainer_challenge', {
    p_title: params.title,
    p_title_bg: params.titleBg ?? null,
    p_description: params.description ?? null,
    p_description_bg: params.descriptionBg ?? null,
    p_challenge_type: params.challengeType,
    p_target_value: params.targetValue,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_difficulty: params.difficulty,
    p_category: params.category ?? null,
    p_participants: params.participants,
  });
  if (error) {
    console.error('[trainerChallengeService] createTrainerChallenge:', error);
    return { success: false, error: 'unknown' };
  }
  const result = data as unknown as { ok?: boolean; error?: string; challenge_id?: string } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'unknown' };
  }
  return { success: true, challengeId: result.challenge_id };
}

// ─── Manual progress (custom_self_reported only) ────────────────────────────

export async function updateClientProgress(
  challengeId: string,
  clientId: string,
  value: number,
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  if (!isValidIntInRange(value, 1, 100000)) {
    return { success: false, error: 'invalid_value' };
  }
  const { data, error } = await sb.rpc('fn_trainer_update_progress', {
    p_challenge_id: challengeId,
    p_client_id: clientId,
    p_value: value,
  });
  if (error) {
    console.error('[trainerChallengeService] updateClientProgress:', error);
    return { success: false, error: 'unknown' };
  }
  const result = data as unknown as { ok?: boolean; error?: string; completed?: boolean } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'unknown' };
  }
  return { success: true, completed: result.completed === true };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

interface ParticipantStatsRow {
  user_id: string;
  status: string;
  current_progress: number;
  target_value: number;
}

function participantPct(p: ParticipantStatsRow): number {
  if (p.target_value <= 0) return 0;
  return Math.min(100, Math.round((p.current_progress / p.target_value) * 100));
}

export async function getTrainerChallenges(
  trainerId: string,
  status?: 'active' | 'completed',
): Promise<TrainerChallengeWithProgress[]> {
  let query = sb
    .from('challenges')
    .select('*, challenge_participants(user_id, status, current_progress, target_value)')
    .eq('creator_id', trainerId)
    .eq('source', 'trainer');
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('[trainerChallengeService] getTrainerChallenges:', error);
    throw new Error('Failed to load trainer challenges');
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const participants = (row.challenge_participants as ParticipantStatsRow[] | null) ?? [];
    const completedCount = participants.filter((p) => p.status === 'completed').length;
    const averageProgress = participants.length === 0
      ? 0
      : Math.round(participants.reduce((sum, p) => sum + participantPct(p), 0) / participants.length);
    return {
      challenge: mapRowToChallenge(row),
      participantCount: participants.length,
      completedCount,
      averageProgress,
    };
  });
}
