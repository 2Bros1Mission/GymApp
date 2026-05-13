import { supabase } from './supabase';

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
}

export async function saveWorkoutLog(params: SaveWorkoutParams) {
  const { userId, workoutId, workoutName, durationSeconds, exercises, notes } = params;

  const { data: workoutLog, error: wError } = await supabase
    .from('workout_logs')
    .insert({
      user_id: userId,
      workout_id: workoutId,
      workout_name: workoutName,
      duration_seconds: durationSeconds,
      completed: true,
      end_time: new Date().toISOString(),
      notes,
    })
    .select()
    .single();

  if (wError || !workoutLog) {
    console.error('Error saving workout log:', wError);
    return { error: wError?.message ?? 'Failed to save workout' };
  }

  for (const exercise of exercises) {
    const { data: exerciseLog, error: eError } = await supabase
      .from('exercise_logs')
      .insert({
        workout_log_id: workoutLog.id,
        exercise_id: exercise.exerciseId,
        exercise_name: exercise.exerciseName,
        order_index: exercise.orderIndex,
      })
      .select()
      .single();

    if (eError || !exerciseLog) {
      console.error('Error saving exercise log:', eError);
      continue;
    }

    const setRows = exercise.sets.map((set) => ({
      exercise_log_id: exerciseLog.id,
      set_number: set.setNumber,
      weight: set.weight,
      reps: set.reps,
      completed: set.completed,
    }));

    const { error: sError } = await supabase
      .from('set_logs')
      .insert(setRows);

    if (sError) {
      console.error('Error saving set logs:', sError);
    }
  }

  return { error: null, workoutLogId: workoutLog.id };
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
    console.error('Error fetching workout history:', error);
    return [];
  }
  return data ?? [];
}

export async function getWorkoutStats(userId: string) {
  const { data: allLogs } = await supabase
    .from('workout_logs')
    .select('id, date, duration_seconds')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('date', { ascending: false });

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
  const { data } = await supabase
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
  const { data } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  return data ?? [];
}
