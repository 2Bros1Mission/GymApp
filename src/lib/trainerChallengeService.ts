import { supabase } from './supabase';
import { asNumber, asString } from './rowGuards';
import type {
  SaveTemplateParams,
  TrainerChallengeTemplate,
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
