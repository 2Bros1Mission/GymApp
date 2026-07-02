import { supabase } from './supabase';
import type { WorkoutCategory } from '../types';

interface SetData {
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}

interface ExerciseData {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: SetData[];
}

interface SaveWorkoutParams {
  userId: string;
  workoutId: string;
  workoutName: string;
  durationSeconds: number;
  exercises: ExerciseData[];
  notes?: string;
  // Optional per-workout category. The DB layer normalizes (lower+trim
  // via BEFORE INSERT trigger) and validates (CHECK constraint over the
  // 6-value whitelist) before commit, so callers get a clean 23514 if
  // they somehow bypass the WorkoutCategory type at the boundary.
  category?: WorkoutCategory | null;
}

export async function saveWorkoutLog(params: SaveWorkoutParams): Promise<{ error: string | null; workoutLogId?: string }> {
  const { userId, workoutId, workoutName, durationSeconds, exercises, notes, category } = params;

  const { data, error } = await supabase.rpc('save_workout', {
    p_user_id: userId,
    p_workout_id: workoutId,
    p_workout_name: workoutName,
    p_duration_seconds: durationSeconds,
    p_notes: notes ?? undefined,
    // Undefined (not null) so the RPC's `default null` kicks in for
    // callers who don't pass a category — keeps the wire payload
    // symmetric with the pre-#148 shape.
    p_category: category ?? undefined,
    p_exercises: exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      orderIndex: ex.orderIndex,
      sets: ex.sets.map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        completed: s.completed,
      })),
    })),
  });

  if (error) {
    console.error('Error saving workout (atomic):', error);
    return { error: error.message };
  }

  return { error: null, workoutLogId: data as string };
}

export async function getWorkoutHistory(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getWorkoutStats(userId: string) {
  const { data: allLogs, error } = await supabase
    .from('workout_logs')
    .select('id, date, duration_seconds')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching workout stats:', error);
    throw new Error(error.message);
  }

  if (!allLogs || allLogs.length === 0) {
    return { totalWorkouts: 0, streak: 0, thisWeek: 0, weekDays: [] as boolean[] };
  }

  const totalWorkouts = allLogs.length;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekDays: boolean[] = [false, false, false, false, false, false, false];
  let thisWeek = 0;

  for (const log of allLogs) {
    const logDate = new Date(log.date);
    if (logDate >= monday) {
      const logDay = logDate.getDay();
      const dayIndex = logDay === 0 ? 6 : logDay - 1;
      weekDays[dayIndex] = true;
      thisWeek++;
    }
  }

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = new Set(allLogs.map((l) => l.date));

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (dates.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return { totalWorkouts, streak, thisWeek, weekDays };
}

export async function getExerciseHistory(userId: string, exerciseId: string, limit = 10) {
  const { data, error } = await supabase
    .from('exercise_logs')
    .select(`
      *,
      workout_log:workout_logs!inner(user_id, date),
      sets:set_logs(*)
    `)
    .eq('exercise_id', exerciseId)
    .eq('workout_log.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveBodyMetric(userId: string, weight: number, notes?: string) {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('body_metrics')
    .upsert({
      user_id: userId,
      date: today,
      weight,
      notes,
    }, {
      onConflict: 'user_id,date',
    });

  return { error: error?.message ?? null };
}

export async function getBodyMetrics(userId: string, limit = 30) {
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
