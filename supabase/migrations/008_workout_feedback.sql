-- Workout feedback: conversation-style trainer comments on client workouts

create table public.workout_feedback (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references public.workout_logs(id) on delete cascade not null,
  trainer_id uuid references public.profiles(id) on delete cascade not null,
  message text not null check (char_length(message) > 0 and char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create index idx_workout_feedback_log on public.workout_feedback(workout_log_id, created_at);
create index idx_workout_feedback_trainer on public.workout_feedback(trainer_id);

alter table public.workout_feedback enable row level security;

-- Trainers can insert feedback on connected clients' workouts
create policy "Trainers can insert feedback on client workouts"
  on public.workout_feedback for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.workout_logs
      join public.trainer_clients on trainer_clients.client_id = workout_logs.user_id
      where workout_logs.id = workout_feedback.workout_log_id
        and trainer_clients.trainer_id = auth.uid()
        and trainer_clients.status = 'active'
    )
  );

-- Trainers can read their own feedback
create policy "Trainers can read own feedback"
  on public.workout_feedback for select
  using (trainer_id = auth.uid());

-- Clients can read feedback on their own workouts
create policy "Clients can read feedback on own workouts"
  on public.workout_feedback for select
  using (
    exists (
      select 1 from public.workout_logs
      where workout_logs.id = workout_feedback.workout_log_id
        and workout_logs.user_id = auth.uid()
    )
  );
