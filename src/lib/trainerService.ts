import { supabase } from './supabase';
import type { TrainerInvite, TrainerClient, CustomWorkout, Exercise, MuscleGroup, DifficultyLevel } from '../types';
import type { Tables, TablesUpdate, Json } from '../types/database';

interface ProfileJoin {
  name: string;
  email: string;
}

/**
 * Generate a random 6-character alphanumeric invite code.
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new invite code for a trainer. Expires in 7 days.
 */
export async function createInviteCode(trainerId: string): Promise<{ code?: string; error?: string }> {
  const code = generateCode();

  const { error } = await supabase
    .from('trainer_invites')
    .insert({ trainer_id: trainerId, code });

  if (error) {
    // Unique constraint collision — extremely rare, retry once
    if (error.code === '23505') {
      const retryCode = generateCode();
      const { error: retryError } = await supabase
        .from('trainer_invites')
        .insert({ trainer_id: trainerId, code: retryCode });
      if (retryError) return { error: retryError.message };
      return { code: retryCode };
    }
    return { error: error.message };
  }

  return { code };
}

/**
 * Get the trainer's active (unused, non-expired) invite codes.
 */
export async function getActiveInvites(trainerId: string): Promise<TrainerInvite[]> {
  const { data, error } = await supabase
    .from('trainer_invites')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    trainerId: row.trainer_id,
    code: row.code,
    expiresAt: row.expires_at,
    used: row.used,
    usedBy: row.used_by ?? undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Client redeems an invite code via the RPC function.
 */
export async function redeemInviteCode(code: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code.toUpperCase() });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success?: boolean; error?: string } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };

  return { success: true };
}

/**
 * Get the trainer's connected clients (active only).
 */
export async function getTrainerClients(trainerId: string): Promise<TrainerClient[]> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      connected_at,
      client:profiles!trainer_clients_client_id_fkey ( name, email )
    `)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('connected_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const client = row.client as unknown as ProfileJoin | null;
    return {
      id: row.id,
      trainerId: row.trainer_id,
      clientId: row.client_id,
      status: row.status as 'active' | 'removed',
      connectedAt: row.connected_at,
      clientName: client?.name,
      clientEmail: client?.email,
    };
  });
}

/**
 * Get the client's trainer (if connected).
 */
export async function getClientTrainer(clientId: string): Promise<TrainerClient | null> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      connected_at,
      trainer:profiles!trainer_clients_trainer_id_fkey ( name, email )
    `)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  if (!data) return null;

  const trainer = data.trainer as unknown as ProfileJoin | null;
  return {
    id: data.id,
    trainerId: data.trainer_id,
    clientId: data.client_id,
    status: data.status as 'active' | 'removed',
    connectedAt: data.connected_at,
    trainerName: trainer?.name,
    trainerEmail: trainer?.email,
  };
}

/**
 * Remove a client-trainer connection (either party can do this).
 */
export async function removeConnection(connectionId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('trainer_clients')
    .update({ status: 'removed' })
    .eq('id', connectionId);

  if (error) return { error: error.message };
  return {};
}

// ─── Custom Workout CRUD ─────────────────────────────────────────────

function mapRowToCustomWorkout(row: Tables<'custom_workouts'>): CustomWorkout {
  return {
    id: row.id,
    creatorId: row.creator_id,
    name: row.name,
    nameBg: row.name_bg ?? '',
    description: row.description ?? '',
    descriptionBg: row.description_bg ?? '',
    difficulty: row.difficulty as DifficultyLevel,
    durationMinutes: row.duration_minutes,
    muscleGroups: (row.muscle_groups ?? []) as MuscleGroup[],
    exercises: (row.exercises ?? []) as unknown as Exercise[],
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all custom workouts created by a trainer.
 */
export async function getCustomWorkouts(creatorId: string): Promise<CustomWorkout[]> {
  const { data, error } = await supabase
    .from('custom_workouts')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(mapRowToCustomWorkout);
}

/**
 * Get a single custom workout by ID.
 */
export async function getCustomWorkout(workoutId: string): Promise<CustomWorkout | null> {
  const { data, error } = await supabase
    .from('custom_workouts')
    .select('*')
    .eq('id', workoutId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  if (!data) return null;
  return mapRowToCustomWorkout(data);
}

/**
 * Create a new custom workout.
 */
export async function createCustomWorkout(workout: {
  creatorId: string;
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;
  difficulty: DifficultyLevel;
  durationMinutes: number;
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  isPublic: boolean;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('custom_workouts')
    .insert({
      creator_id: workout.creatorId,
      name: workout.name,
      name_bg: workout.nameBg,
      description: workout.description,
      description_bg: workout.descriptionBg,
      difficulty: workout.difficulty,
      duration_minutes: workout.durationMinutes,
      muscle_groups: workout.muscleGroups,
      exercises: workout.exercises as unknown as Json,
      is_public: workout.isPublic,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data?.id };
}

/**
 * Update an existing custom workout.
 */
export async function updateCustomWorkout(workoutId: string, updates: {
  name?: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  difficulty?: DifficultyLevel;
  durationMinutes?: number;
  muscleGroups?: MuscleGroup[];
  exercises?: Exercise[];
  isPublic?: boolean;
}): Promise<{ error?: string }> {
  const row: TablesUpdate<'custom_workouts'> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.nameBg !== undefined) row.name_bg = updates.nameBg;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.descriptionBg !== undefined) row.description_bg = updates.descriptionBg;
  if (updates.difficulty !== undefined) row.difficulty = updates.difficulty;
  if (updates.durationMinutes !== undefined) row.duration_minutes = updates.durationMinutes;
  if (updates.muscleGroups !== undefined) row.muscle_groups = updates.muscleGroups;
  if (updates.exercises !== undefined) row.exercises = updates.exercises as unknown as Json;
  if (updates.isPublic !== undefined) row.is_public = updates.isPublic;

  const { error } = await supabase
    .from('custom_workouts')
    .update(row)
    .eq('id', workoutId);

  if (error) return { error: error.message };
  return {};
}

/**
 * Delete a custom workout.
 */
export async function deleteCustomWorkout(workoutId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('custom_workouts')
    .delete()
    .eq('id', workoutId);

  if (error) return { error: error.message };
  return {};
}
