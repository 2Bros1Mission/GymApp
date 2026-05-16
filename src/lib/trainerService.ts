import { supabase } from './supabase';
import type { TrainerClient, CustomWorkout, Exercise, MuscleGroup, DifficultyLevel, ClientProgress, RecentActivity, WorkoutAssignment } from '../types';
import type { Tables, TablesUpdate, Json } from '../types/database';

interface ProfileJoin {
  name: string;
  email: string;
}

/**
 * Get the trainer's permanent invite code from their profile.
 */
export async function getTrainerCode(trainerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('trainer_code')
    .eq('id', trainerId)
    .single();

  if (error) throw new Error(error.message);
  return data?.trainer_code ?? null;
}

/**
 * Client redeems an invite code via the RPC function.
 * Returns trainer info so the client can confirm the connection.
 */
export async function redeemInviteCode(code: string): Promise<{
  success: boolean;
  error?: string;
  connectionId?: string;
  trainerName?: string;
}> {
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code.toUpperCase() });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as {
    success?: boolean;
    error?: string;
    connection_id?: string;
    trainer_name?: string;
  } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };

  return {
    success: true,
    connectionId: result.connection_id,
    trainerName: result.trainer_name,
  };
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
      client_confirmed,
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
      status: row.status as TrainerClient['status'],
      clientConfirmed: row.client_confirmed,
      connectedAt: row.connected_at,
      clientName: client?.name,
      clientEmail: client?.email,
    };
  });
}

/**
 * Get pending connection requests for a trainer (client_confirmed = true).
 */
export async function getPendingRequests(trainerId: string): Promise<TrainerClient[]> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      client_confirmed,
      connected_at,
      client:profiles!trainer_clients_client_id_fkey ( name, email )
    `)
    .eq('trainer_id', trainerId)
    .eq('status', 'pending')
    .eq('client_confirmed', true)
    .order('connected_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const client = row.client as unknown as ProfileJoin | null;
    return {
      id: row.id,
      trainerId: row.trainer_id,
      clientId: row.client_id,
      status: row.status as TrainerClient['status'],
      clientConfirmed: row.client_confirmed,
      connectedAt: row.connected_at,
      clientName: client?.name,
      clientEmail: client?.email,
    };
  });
}

/**
 * Get the client's trainer (active or pending connection).
 */
export async function getClientTrainer(clientId: string): Promise<TrainerClient | null> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      id,
      trainer_id,
      client_id,
      status,
      client_confirmed,
      connected_at,
      trainer:profiles!trainer_clients_trainer_id_fkey ( name )
    `)
    .eq('client_id', clientId)
    .in('status', ['active', 'pending', 'rejected'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  if (!data) return null;

  const trainer = data.trainer as unknown as ProfileJoin | null;
  return {
    id: data.id,
    trainerId: data.trainer_id,
    clientId: data.client_id,
    status: data.status as TrainerClient['status'],
    clientConfirmed: data.client_confirmed,
    connectedAt: data.connected_at,
    trainerName: trainer?.name,
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

/**
 * Client confirms they want to connect with the trainer.
 */
export async function confirmConnection(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('confirm_connection', { p_connection_id: connectionId });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success?: boolean; error?: string } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };
  return { success: true };
}

/**
 * Trainer approves a pending (client-confirmed) connection request.
 */
export async function approveConnection(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('approve_connection', { p_connection_id: connectionId });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success?: boolean; error?: string } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };
  return { success: true };
}

/**
 * Trainer rejects a pending connection request.
 */
export async function rejectConnection(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('reject_connection', { p_connection_id: connectionId });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success?: boolean; error?: string } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'unknown' };
  return { success: true };
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

// ─── Recent Client Activity ────────────────────────────────────────

export async function getRecentClientActivity(trainerId: string, limit = 30): Promise<RecentActivity[]> {
  const { data: clients, error: clientsError } = await supabase
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  if (clientsError) throw new Error(clientsError.message);

  const clientIds = (clients ?? []).map((c) => c.client_id);
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('workout_logs')
    .select(`
      id,
      workout_name,
      date,
      duration_seconds,
      user_id,
      client:profiles!workout_logs_user_id_fkey ( name )
    `)
    .in('user_id', clientIds)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const client = row.client as unknown as { name: string } | null;
    return {
      id: row.id,
      clientId: row.user_id,
      clientName: client?.name ?? '--',
      workoutName: row.workout_name,
      date: row.date,
      durationSeconds: row.duration_seconds,
    };
  });
}

// ─── Client Progress Monitoring ─────────────────────────────────────

/**
 * Get a client's profile info (trainer must be connected).
 */
export async function getClientProfile(clientId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, weight, height, goal')
    .eq('id', clientId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get a client's recent workout logs (trainer must be connected via RLS).
 */
export async function getClientWorkoutLogs(clientId: string, limit = 20) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('id, workout_name, date, duration_seconds, completed')
    .eq('user_id', clientId)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    workoutName: row.workout_name,
    date: row.date,
    durationSeconds: row.duration_seconds,
    completed: row.completed,
  }));
}

/**
 * Get a client's body metrics history (trainer must be connected via RLS).
 */
export async function getClientBodyMetrics(clientId: string, limit = 30) {
  const { data, error } = await supabase
    .from('body_metrics')
    .select('date, weight')
    .eq('user_id', clientId)
    .order('date', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    date: row.date,
    weight: row.weight,
  }));
}

/**
 * Calculate a client's current workout streak (consecutive days ending today/yesterday).
 */
function calculateStreak(workoutDates: string[]): number {
  if (workoutDates.length === 0) return 0;

  const uniqueDates = [...new Set(workoutDates)].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const firstDate = new Date(uniqueDates[0]);
  firstDate.setHours(0, 0, 0, 0);

  // Streak must start from today or yesterday
  if (firstDate.getTime() !== today.getTime() && firstDate.getTime() !== yesterday.getTime()) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Get weekly activity (Mon–Sun) for the current week.
 */
function getWeeklyActivity(workoutDates: string[]): boolean[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(12, 0, 0, 0);

  const activity: boolean[] = [false, false, false, false, false, false, false];
  for (const d of workoutDates) {
    const date = new Date(d);
    date.setHours(12, 0, 0, 0);
    const diff = Math.round((date.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      activity[diff] = true;
    }
  }
  return activity;
}

/**
 * Get full client progress data for the detail screen.
 */
export async function getClientProgress(clientId: string): Promise<ClientProgress> {
  const [profile, workouts, metrics, countResult] = await Promise.all([
    getClientProfile(clientId),
    getClientWorkoutLogs(clientId, 50),
    getClientBodyMetrics(clientId, 30),
    supabase
      .from('workout_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', clientId)
      .eq('completed', true),
  ]);

  const workoutDates = workouts.map((w) => w.date);
  const streak = calculateStreak(workoutDates);
  const weeklyActivity = getWeeklyActivity(workoutDates);

  return {
    clientId,
    clientName: profile.name,
    clientEmail: profile.email,
    weight: profile.weight,
    height: profile.height,
    goal: profile.goal as ClientProgress['goal'],
    totalWorkouts: countResult.count ?? workouts.length,
    currentStreak: streak,
    lastWorkoutDate: workouts.length > 0 ? workouts[0].date : null,
    recentWorkouts: workouts.slice(0, 10),
    bodyMetrics: metrics,
    weeklyActivity,
  };
}

// ─── Workout Assignments ──────────────────────────────────────────────

export async function assignWorkout(params: {
  trainerId: string;
  clientId: string;
  workoutId: string;
  dueDate?: string;
  notes?: string;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('workout_assignments')
    .insert({
      trainer_id: params.trainerId,
      client_id: params.clientId,
      workout_id: params.workoutId,
      due_date: params.dueDate ?? null,
      notes: params.notes ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data?.id };
}

export async function unassignWorkout(assignmentId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('workout_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) return { error: error.message };
  return {};
}

export async function getTrainerAssignments(trainerId: string, clientId?: string): Promise<WorkoutAssignment[]> {
  let query = supabase
    .from('workout_assignments')
    .select(`
      id,
      trainer_id,
      client_id,
      workout_id,
      assigned_at,
      due_date,
      status,
      completed_at,
      notes,
      workout:custom_workouts!workout_assignments_workout_id_fkey ( name, name_bg ),
      client:profiles!workout_assignments_client_id_fkey ( name )
    `)
    .eq('trainer_id', trainerId)
    .order('assigned_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const workout = row.workout as unknown as { name: string; name_bg: string | null } | null;
    const client = row.client as unknown as { name: string } | null;
    return {
      id: row.id,
      trainerId: row.trainer_id,
      clientId: row.client_id,
      workoutId: row.workout_id,
      assignedAt: row.assigned_at,
      dueDate: row.due_date,
      status: row.status as WorkoutAssignment['status'],
      completedAt: row.completed_at,
      notes: row.notes,
      workoutName: workout?.name,
      workoutNameBg: workout?.name_bg ?? undefined,
      clientName: client?.name,
    };
  });
}

export async function getClientAssignments(clientId: string): Promise<WorkoutAssignment[]> {
  const { data, error } = await supabase
    .from('workout_assignments')
    .select(`
      id,
      trainer_id,
      client_id,
      workout_id,
      assigned_at,
      due_date,
      status,
      completed_at,
      notes,
      workout:custom_workouts!workout_assignments_workout_id_fkey ( name, name_bg ),
      trainer:profiles!workout_assignments_trainer_id_fkey ( name )
    `)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('assigned_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const workout = row.workout as unknown as { name: string; name_bg: string | null } | null;
    const trainer = row.trainer as unknown as { name: string } | null;
    return {
      id: row.id,
      trainerId: row.trainer_id,
      clientId: row.client_id,
      workoutId: row.workout_id,
      assignedAt: row.assigned_at,
      dueDate: row.due_date,
      status: row.status as WorkoutAssignment['status'],
      completedAt: row.completed_at,
      notes: row.notes,
      workoutName: workout?.name,
      workoutNameBg: workout?.name_bg ?? undefined,
      trainerName: trainer?.name,
    };
  });
}

export async function completeAssignment(assignmentId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('workout_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', assignmentId);

  if (error) return { error: error.message };
  return {};
}
