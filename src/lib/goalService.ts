import { supabase } from './supabase';
import type { Database } from '../types/database';
import type { ClientGoal, GoalSuggestion, GoalType } from '../types';

type ClientGoalUpdate = Database['public']['Tables']['client_goals']['Update'];

interface ProfileJoin {
  name: string;
}

function mapRowToGoal(row: Record<string, unknown>): ClientGoal {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    goalType: row.goal_type as GoalType,
    title: row.title as string,
    targetValue: row.target_value as number | null,
    currentValue: row.current_value as number | null,
    unit: row.unit as string | null,
    exerciseName: row.exercise_name as string | null,
    deadline: row.deadline as string | null,
    status: row.status as ClientGoal['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: row.completed_at as string | null,
  };
}

function mapRowToSuggestion(row: Record<string, unknown>): GoalSuggestion {
  const trainer = row.trainer as unknown as ProfileJoin | null;
  const targetGoal = row.target_goal as unknown as { title: string } | null;
  return {
    id: row.id as string,
    trainerId: row.trainer_id as string,
    clientId: row.client_id as string,
    targetGoalId: row.target_goal_id as string | null,
    suggestionType: row.suggestion_type as GoalSuggestion['suggestionType'],
    goalType: row.goal_type as GoalType,
    title: row.title as string,
    targetValue: row.target_value as number | null,
    unit: row.unit as string | null,
    exerciseName: row.exercise_name as string | null,
    deadline: row.deadline as string | null,
    message: row.message as string | null,
    status: row.status as GoalSuggestion['status'],
    clientResponseAt: row.client_response_at as string | null,
    createdAt: row.created_at as string,
    trainerName: trainer?.name,
    targetGoalTitle: targetGoal?.title,
  };
}

// ─── Client Functions ────────────────────────────────────────────────────────

export async function getClientGoals(clientId: string): Promise<ClientGoal[]> {
  const { data, error } = await supabase
    .from('client_goals')
    .select('*')
    .eq('client_id', clientId)
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToGoal(row as unknown as Record<string, unknown>));
}

export async function createGoal(params: {
  clientId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('client_goals')
    .insert({
      client_id: params.clientId,
      goal_type: params.goalType,
      title: params.title,
      target_value: params.targetValue ?? null,
      current_value: params.currentValue ?? null,
      unit: params.unit ?? null,
      exercise_name: params.exerciseName ?? null,
      deadline: params.deadline ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateGoal(goalId: string, updates: {
  title?: string;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
}): Promise<{ error?: string }> {
  const payload: ClientGoalUpdate = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.targetValue !== undefined) payload.target_value = updates.targetValue;
  if (updates.currentValue !== undefined) payload.current_value = updates.currentValue;
  if (updates.unit !== undefined) payload.unit = updates.unit;
  if (updates.exerciseName !== undefined) payload.exercise_name = updates.exerciseName;
  if (updates.deadline !== undefined) payload.deadline = updates.deadline;

  const { error } = await supabase
    .from('client_goals')
    .update(payload)
    .eq('id', goalId);

  if (error) return { error: error.message };
  return {};
}

export async function deleteGoal(goalId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('client_goals')
    .delete()
    .eq('id', goalId);

  if (error) return { error: error.message };
  return {};
}

export async function completeGoal(goalId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('client_goals')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);

  if (error) return { error: error.message };
  return {};
}

export async function getPendingSuggestions(clientId: string): Promise<GoalSuggestion[]> {
  const { data, error } = await supabase
    .from('goal_suggestions')
    .select(`
      *,
      trainer:profiles!goal_suggestions_trainer_id_fkey ( name ),
      target_goal:client_goals!goal_suggestions_target_goal_id_fkey ( title )
    `)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToSuggestion(row as unknown as Record<string, unknown>));
}

export async function respondToSuggestion(
  suggestionId: string,
  response: 'accepted' | 'adjusted' | 'rejected',
  goalData?: {
    clientId: string;
    goalType: GoalType;
    title: string;
    targetValue?: number | null;
    unit?: string | null;
    exerciseName?: string | null;
    deadline?: string | null;
    targetGoalId?: string | null;
    suggestionType: 'new_goal' | 'adjustment';
  }
): Promise<{ error?: string }> {
  const { error: updateErr } = await supabase
    .from('goal_suggestions')
    .update({
      status: response,
      client_response_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);

  if (updateErr) return { error: updateErr.message };

  if ((response === 'accepted' || response === 'adjusted') && goalData) {
    if (goalData.suggestionType === 'new_goal') {
      const { error: insertErr } = await supabase
        .from('client_goals')
        .insert({
          client_id: goalData.clientId,
          goal_type: goalData.goalType,
          title: goalData.title,
          target_value: goalData.targetValue ?? null,
          unit: goalData.unit ?? null,
          exercise_name: goalData.exerciseName ?? null,
          deadline: goalData.deadline ?? null,
        });
      if (insertErr) return { error: insertErr.message };
    } else if (goalData.suggestionType === 'adjustment' && goalData.targetGoalId) {
      const payload: ClientGoalUpdate = { updated_at: new Date().toISOString() };
      if (goalData.title) payload.title = goalData.title;
      if (goalData.targetValue !== undefined) payload.target_value = goalData.targetValue;
      if (goalData.unit !== undefined) payload.unit = goalData.unit;
      if (goalData.deadline !== undefined) payload.deadline = goalData.deadline;

      const { error: updErr } = await supabase
        .from('client_goals')
        .update(payload)
        .eq('id', goalData.targetGoalId);
      if (updErr) return { error: updErr.message };
    }
  }

  return {};
}

// ─── Trainer Functions ───────────────────────────────────────────────────────

export async function getClientGoalsForTrainer(clientId: string): Promise<ClientGoal[]> {
  const { data, error } = await supabase
    .from('client_goals')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToGoal(row as unknown as Record<string, unknown>));
}

export async function suggestGoal(params: {
  trainerId: string;
  clientId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
  message?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('goal_suggestions')
    .insert({
      trainer_id: params.trainerId,
      client_id: params.clientId,
      suggestion_type: 'new_goal',
      goal_type: params.goalType,
      title: params.title,
      target_value: params.targetValue ?? null,
      unit: params.unit ?? null,
      exercise_name: params.exerciseName ?? null,
      deadline: params.deadline ?? null,
      message: params.message ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function suggestAdjustment(params: {
  trainerId: string;
  clientId: string;
  targetGoalId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
  message?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('goal_suggestions')
    .insert({
      trainer_id: params.trainerId,
      client_id: params.clientId,
      target_goal_id: params.targetGoalId,
      suggestion_type: 'adjustment',
      goal_type: params.goalType,
      title: params.title,
      target_value: params.targetValue ?? null,
      unit: params.unit ?? null,
      exercise_name: params.exerciseName ?? null,
      deadline: params.deadline ?? null,
      message: params.message ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function withdrawSuggestion(suggestionId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('goal_suggestions')
    .delete()
    .eq('id', suggestionId);

  if (error) return { error: error.message };
  return {};
}

// ─── Auto-tracking ───────────────────────────────────────────────────────────

export async function refreshGoalProgress(clientId: string, goals: ClientGoal[]): Promise<ClientGoal[]> {
  if (goals.length === 0) return goals;

  const frequencyGoals = goals.filter((g) => g.goalType === 'frequency' && g.status === 'active');
  const weightGoals = goals.filter((g) => g.goalType === 'weight_target' && g.status === 'active');

  let weeklyCount: number | null = null;
  let latestWeight: number | null = null;

  if (frequencyGoals.length > 0) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    const mondayStr = monday.toISOString().split('T')[0];

    const { count } = await supabase
      .from('workout_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', clientId)
      .eq('completed', true)
      .gte('date', mondayStr);

    weeklyCount = count ?? 0;
  }

  if (weightGoals.length > 0) {
    const { data } = await supabase
      .from('body_metrics')
      .select('weight')
      .eq('user_id', clientId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    latestWeight = data?.weight ?? null;
  }

  return goals.map((g) => {
    if (g.status !== 'active') return g;
    if (g.goalType === 'frequency' && weeklyCount !== null) {
      return { ...g, currentValue: weeklyCount };
    }
    if (g.goalType === 'weight_target' && latestWeight !== null) {
      return { ...g, currentValue: latestWeight };
    }
    return g;
  });
}
