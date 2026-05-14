-- Allow trainers to READ their connected clients' workout data
-- Pattern: trainer can see data where the row's user_id is one of their active clients

-- Trainers can view their clients' workout logs
create policy "Trainers can view client workout logs"
  on public.workout_logs for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_clients.trainer_id = auth.uid()
        and trainer_clients.client_id = workout_logs.user_id
        and trainer_clients.status = 'active'
    )
  );

-- Trainers can view their clients' exercise logs (via workout_logs join)
create policy "Trainers can view client exercise logs"
  on public.exercise_logs for select
  using (
    exists (
      select 1 from public.workout_logs
      join public.trainer_clients on trainer_clients.client_id = workout_logs.user_id
      where workout_logs.id = exercise_logs.workout_log_id
        and trainer_clients.trainer_id = auth.uid()
        and trainer_clients.status = 'active'
    )
  );

-- Trainers can view their clients' set logs (via exercise_logs + workout_logs join)
create policy "Trainers can view client set logs"
  on public.set_logs for select
  using (
    exists (
      select 1 from public.exercise_logs
      join public.workout_logs on workout_logs.id = exercise_logs.workout_log_id
      join public.trainer_clients on trainer_clients.client_id = workout_logs.user_id
      where exercise_logs.id = set_logs.exercise_log_id
        and trainer_clients.trainer_id = auth.uid()
        and trainer_clients.status = 'active'
    )
  );

-- Trainers can view their clients' body metrics
create policy "Trainers can view client body metrics"
  on public.body_metrics for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_clients.trainer_id = auth.uid()
        and trainer_clients.client_id = body_metrics.user_id
        and trainer_clients.status = 'active'
    )
  );

-- Trainers can view their clients' profiles (name, weight, height, goal)
create policy "Trainers can view client profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_clients.trainer_id = auth.uid()
        and trainer_clients.client_id = profiles.id
        and trainer_clients.status = 'active'
    )
  );
