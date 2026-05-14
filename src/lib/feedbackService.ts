import { supabase } from './supabase';
import type { WorkoutFeedback, WorkoutDetail, WorkoutDetailExercise, WorkoutDetailSet } from '../types';

interface ProfileJoin {
  name: string;
}

interface ExerciseLogRow {
  id: string;
  exercise_name: string;
  order_index: number;
  set_logs: SetLogRow[];
}

interface SetLogRow {
  id: string;
  set_number: number;
  weight: number;
  reps: number;
  completed: boolean;
}

function mapFeedbackRow(row: Record<string, unknown>): WorkoutFeedback {
  const trainer = row.trainer as unknown as ProfileJoin | null;
  return {
    id: row.id as string,
    workoutLogId: row.workout_log_id as string,
    trainerId: row.trainer_id as string,
    trainerName: trainer?.name,
    message: row.message as string,
    createdAt: row.created_at as string,
  };
}

// ─── Workout Detail ─────────────────────────────────────────────────────────

export async function getWorkoutDetail(workoutLogId: string): Promise<WorkoutDetail> {
  const { data: log, error: logErr } = await supabase
    .from('workout_logs')
    .select('id, workout_name, date, duration_seconds, completed, notes')
    .eq('id', workoutLogId)
    .single();

  if (logErr) throw new Error(logErr.message);

  const { data: exerciseRows, error: exErr } = await supabase
    .from('exercise_logs')
    .select(`
      id, exercise_name, order_index,
      set_logs ( id, set_number, weight, reps, completed )
    `)
    .eq('workout_log_id', workoutLogId)
    .order('order_index', { ascending: true });

  if (exErr) throw new Error(exErr.message);

  const exercises: WorkoutDetailExercise[] = ((exerciseRows ?? []) as unknown as ExerciseLogRow[]).map((ex) => ({
    id: ex.id,
    exerciseName: ex.exercise_name,
    orderIndex: ex.order_index,
    sets: (ex.set_logs ?? []).map((s): WorkoutDetailSet => ({
      id: s.id,
      setNumber: s.set_number,
      weight: s.weight,
      reps: s.reps,
      completed: s.completed,
    })).sort((a, b) => a.setNumber - b.setNumber),
  }));

  const feedback = await getWorkoutFeedback(workoutLogId);

  return {
    id: log.id,
    workoutName: log.workout_name,
    date: log.date,
    durationSeconds: log.duration_seconds,
    completed: log.completed,
    notes: log.notes,
    exercises,
    feedback,
  };
}

// ─── Feedback ───────────────────────────────────────────────────────────────

export async function getWorkoutFeedback(workoutLogId: string): Promise<WorkoutFeedback[]> {
  const { data, error } = await supabase
    .from('workout_feedback')
    .select(`
      *,
      trainer:profiles!workout_feedback_trainer_id_fkey ( name )
    `)
    .eq('workout_log_id', workoutLogId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapFeedbackRow(row as unknown as Record<string, unknown>));
}

export async function addWorkoutFeedback(params: {
  workoutLogId: string;
  trainerId: string;
  message: string;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('workout_feedback')
    .insert({
      workout_log_id: params.workoutLogId,
      trainer_id: params.trainerId,
      message: params.message,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}
