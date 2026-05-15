-- Client goals and trainer suggestions
-- Applied via CI

-- Client-owned goals with measurable targets
create table public.client_goals (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.profiles(id) on delete cascade not null,
  goal_type text not null check (goal_type in ('weight_target', 'lift_target', 'frequency', 'custom')),
  title text not null,
  target_value numeric,
  current_value numeric,
  unit text,
  exercise_name text,
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.client_goals enable row level security;

create policy "Clients can read own goals"
  on public.client_goals for select
  using (client_id = auth.uid());

create policy "Clients can insert own goals"
  on public.client_goals for insert
  with check (client_id = auth.uid());

create policy "Clients can update own goals"
  on public.client_goals for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "Clients can delete own goals"
  on public.client_goals for delete
  using (client_id = auth.uid());

create policy "Trainers can read connected client goals"
  on public.client_goals for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_id = auth.uid()
        and client_id = client_goals.client_id
        and status = 'active'
    )
  );

create index idx_client_goals_client_status on public.client_goals(client_id, status);

-- Trainer suggestions: new goals or adjustments to existing goals
create table public.goal_suggestions (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  target_goal_id uuid references public.client_goals(id) on delete set null,
  suggestion_type text not null check (suggestion_type in ('new_goal', 'adjustment')),
  goal_type text not null check (goal_type in ('weight_target', 'lift_target', 'frequency', 'custom')),
  title text not null,
  target_value numeric,
  unit text,
  exercise_name text,
  deadline date,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'adjusted', 'rejected')),
  client_response_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.goal_suggestions enable row level security;

create policy "Trainers can insert suggestions"
  on public.goal_suggestions for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.trainer_clients
      where trainer_id = auth.uid()
        and client_id = goal_suggestions.client_id
        and status = 'active'
    )
  );

create policy "Trainers can read own suggestions"
  on public.goal_suggestions for select
  using (trainer_id = auth.uid());

create policy "Clients can read own suggestions"
  on public.goal_suggestions for select
  using (client_id = auth.uid());

create policy "Clients can update own suggestions"
  on public.goal_suggestions for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "Trainers can delete own pending suggestions"
  on public.goal_suggestions for delete
  using (trainer_id = auth.uid() and status = 'pending');

create index idx_goal_suggestions_client_status on public.goal_suggestions(client_id, status);
create index idx_goal_suggestions_trainer on public.goal_suggestions(trainer_id);
