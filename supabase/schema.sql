-- GymApp Database Schema
-- Run this in your Supabase SQL Editor (supabase.com > your project > SQL Editor)

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text not null default 'client' check (role in ('client', 'trainer')),
  language text not null default 'bg' check (language in ('bg', 'en')),
  weight real,
  height real,
  goal text check (goal in ('lose_weight', 'build_muscle', 'get_stronger', 'stay_healthy', 'improve_endurance')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Workout logs (each time a user does a workout)
create table public.workout_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  workout_id text not null,
  workout_name text not null,
  date date not null default current_date,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer,
  completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- Exercise logs (each exercise within a workout log)
create table public.exercise_logs (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references public.workout_logs on delete cascade not null,
  exercise_id text not null,
  exercise_name text not null,
  order_index integer not null,
  created_at timestamptz not null default now()
);

-- Set logs (each set within an exercise)
create table public.set_logs (
  id uuid default gen_random_uuid() primary key,
  exercise_log_id uuid references public.exercise_logs on delete cascade not null,
  set_number integer not null,
  weight real not null default 0,
  reps integer not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- User body metrics (weight tracking over time)
create table public.body_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  date date not null default current_date,
  weight real,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Indexes for performance
create index idx_workout_logs_user on public.workout_logs (user_id, date desc);
create index idx_exercise_logs_workout on public.exercise_logs (workout_log_id);
create index idx_set_logs_exercise on public.set_logs (exercise_log_id);
create index idx_body_metrics_user on public.body_metrics (user_id, date desc);

-- Row Level Security (RLS) - users can only see their own data
alter table public.profiles enable row level security;
alter table public.workout_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.set_logs enable row level security;
alter table public.body_metrics enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Workout logs policies
create policy "Users can view own workout logs"
  on public.workout_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own workout logs"
  on public.workout_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workout logs"
  on public.workout_logs for update
  using (auth.uid() = user_id);

-- Exercise logs policies
create policy "Users can view own exercise logs"
  on public.exercise_logs for select
  using (
    exists (
      select 1 from public.workout_logs
      where workout_logs.id = exercise_logs.workout_log_id
      and workout_logs.user_id = auth.uid()
    )
  );

create policy "Users can insert own exercise logs"
  on public.exercise_logs for insert
  with check (
    exists (
      select 1 from public.workout_logs
      where workout_logs.id = exercise_logs.workout_log_id
      and workout_logs.user_id = auth.uid()
    )
  );

-- Set logs policies
create policy "Users can view own set logs"
  on public.set_logs for select
  using (
    exists (
      select 1 from public.exercise_logs
      join public.workout_logs on workout_logs.id = exercise_logs.workout_log_id
      where exercise_logs.id = set_logs.exercise_log_id
      and workout_logs.user_id = auth.uid()
    )
  );

create policy "Users can insert own set logs"
  on public.set_logs for insert
  with check (
    exists (
      select 1 from public.exercise_logs
      join public.workout_logs on workout_logs.id = exercise_logs.workout_log_id
      where exercise_logs.id = set_logs.exercise_log_id
      and workout_logs.user_id = auth.uid()
    )
  );

-- Body metrics policies
create policy "Users can view own metrics"
  on public.body_metrics for select
  using (auth.uid() = user_id);

create policy "Users can insert own metrics"
  on public.body_metrics for insert
  with check (auth.uid() = user_id);

create policy "Users can update own metrics"
  on public.body_metrics for update
  using (auth.uid() = user_id);

-- Trainer invite codes (trainer generates a 6-char code to share with clients)
create table public.trainer_invites (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles on delete cascade not null,
  code text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used boolean not null default false,
  used_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- Trainer-client relationships
create table public.trainer_clients (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles on delete cascade not null,
  client_id uuid references public.profiles on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'removed')),
  connected_at timestamptz not null default now(),
  unique (trainer_id, client_id)
);

-- Indexes
create index idx_trainer_invites_code on public.trainer_invites (code);
create index idx_trainer_invites_trainer on public.trainer_invites (trainer_id);
create index idx_trainer_clients_trainer on public.trainer_clients (trainer_id);
create index idx_trainer_clients_client on public.trainer_clients (client_id);

-- RLS
alter table public.trainer_invites enable row level security;
alter table public.trainer_clients enable row level security;

-- Trainer invites: trainers see their own, anyone can read by code (for redeeming)
create policy "Trainers can manage own invites"
  on public.trainer_invites for all
  using (auth.uid() = trainer_id);

create policy "Anyone can read invite by code"
  on public.trainer_invites for select
  using (true);

-- Trainer clients: trainers see their clients, clients see their trainer
create policy "Trainers can view own clients"
  on public.trainer_clients for select
  using (auth.uid() = trainer_id);

create policy "Clients can view own trainer"
  on public.trainer_clients for select
  using (auth.uid() = client_id);

create policy "System can insert trainer_clients"
  on public.trainer_clients for insert
  with check (true);

create policy "Trainer can update own client relationships"
  on public.trainer_clients for update
  using (auth.uid() = trainer_id);

create policy "Client can update own trainer relationship"
  on public.trainer_clients for update
  using (auth.uid() = client_id);

-- RPC: Redeem invite code (atomic: validate code, create relationship, mark used)
create or replace function public.redeem_invite_code(p_code text)
returns jsonb as $$
declare
  v_invite record;
  v_client_id uuid;
  v_client_role text;
begin
  v_client_id := auth.uid();

  -- Check client role
  select role into v_client_role from public.profiles where id = v_client_id;
  if v_client_role != 'client' then
    return jsonb_build_object('success', false, 'error', 'only_clients');
  end if;

  -- Find valid invite
  select * into v_invite from public.trainer_invites
  where code = upper(p_code)
    and used = false
    and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  -- Check not already connected
  if exists (
    select 1 from public.trainer_clients
    where trainer_id = v_invite.trainer_id
      and client_id = v_client_id
      and status = 'active'
  ) then
    return jsonb_build_object('success', false, 'error', 'already_connected');
  end if;

  -- Create relationship
  insert into public.trainer_clients (trainer_id, client_id, status)
  values (v_invite.trainer_id, v_client_id, 'active')
  on conflict (trainer_id, client_id)
  do update set status = 'active', connected_at = now();

  -- Mark invite as used
  update public.trainer_invites
  set used = true, used_by = v_client_id
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'trainer_id', v_invite.trainer_id);
end;
$$ language plpgsql security definer;

-- Atomic workout save RPC (single transaction for workout_log + exercise_logs + set_logs)
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

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function on new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
