-- Workout assignments: trainers assign custom workouts to clients
-- Applied via CI
create table public.workout_assignments (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  workout_id uuid references public.custom_workouts(id) on delete cascade not null,
  assigned_at timestamptz not null default now(),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  notes text,
  unique(client_id, workout_id, status)
);

alter table public.workout_assignments enable row level security;

-- Trainers can manage assignments for their connected clients
create policy "Trainers can insert assignments"
  on public.workout_assignments for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.trainer_clients
      where trainer_id = auth.uid()
        and client_id = workout_assignments.client_id
        and status = 'active'
    )
  );

create policy "Trainers can view own assignments"
  on public.workout_assignments for select
  using (trainer_id = auth.uid());

create policy "Trainers can delete own assignments"
  on public.workout_assignments for delete
  using (trainer_id = auth.uid());

-- Clients can view their own assignments
create policy "Clients can view own assignments"
  on public.workout_assignments for select
  using (client_id = auth.uid());

-- Clients can update status of their own assignments (mark completed/skipped)
create policy "Clients can update own assignment status"
  on public.workout_assignments for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- Clients can read custom_workouts referenced by their assignments
create policy "Clients can read assigned workouts"
  on public.custom_workouts for select
  using (
    exists (
      select 1 from public.workout_assignments
      where workout_id = custom_workouts.id
        and client_id = auth.uid()
        and status = 'pending'
    )
    or creator_id = auth.uid()
    or is_public = true
  );
