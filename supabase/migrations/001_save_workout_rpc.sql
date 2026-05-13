-- Migration: Atomic workout save RPC function
-- Run this in Supabase SQL Editor if you already have the base schema

create or replace function public.save_workout(
  p_user_id uuid,
  p_workout_id text,
  p_workout_name text,
  p_duration_seconds integer,
  p_notes text default null,
  p_exercises jsonb default '[]'::jsonb
)
returns uuid as $$
declare
  v_workout_log_id uuid;
  v_exercise_log_id uuid;
  v_exercise jsonb;
  v_set jsonb;
begin
  -- Insert workout log
  insert into public.workout_logs (
    user_id, workout_id, workout_name, duration_seconds, completed, end_time, notes
  ) values (
    p_user_id, p_workout_id, p_workout_name, p_duration_seconds, true, now(), p_notes
  )
  returning id into v_workout_log_id;

  -- Loop through exercises
  for v_exercise in select * from jsonb_array_elements(p_exercises)
  loop
    -- Insert exercise log
    insert into public.exercise_logs (
      workout_log_id, exercise_id, exercise_name, order_index
    ) values (
      v_workout_log_id,
      v_exercise->>'exerciseId',
      v_exercise->>'exerciseName',
      (v_exercise->>'orderIndex')::integer
    )
    returning id into v_exercise_log_id;

    -- Insert all sets for this exercise
    for v_set in select * from jsonb_array_elements(v_exercise->'sets')
    loop
      insert into public.set_logs (
        exercise_log_id, set_number, weight, reps, completed
      ) values (
        v_exercise_log_id,
        (v_set->>'setNumber')::integer,
        (v_set->>'weight')::real,
        (v_set->>'reps')::integer,
        (v_set->>'completed')::boolean
      );
    end loop;
  end loop;

  return v_workout_log_id;
end;
$$ language plpgsql security definer;
