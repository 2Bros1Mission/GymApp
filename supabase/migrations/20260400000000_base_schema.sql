-- ============================================================
-- Base Schema (migration zero)
-- Originally applied via SQL Editor; converted to migration
-- so Supabase Preview branches can run the full migration chain.
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
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
create table if not exists public.workout_logs (
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
create table if not exists public.exercise_logs (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references public.workout_logs on delete cascade not null,
  exercise_id text not null,
  exercise_name text not null,
  order_index integer not null,
  created_at timestamptz not null default now()
);

-- Set logs (each set within an exercise)
create table if not exists public.set_logs (
  id uuid default gen_random_uuid() primary key,
  exercise_log_id uuid references public.exercise_logs on delete cascade not null,
  set_number integer not null,
  weight real not null default 0,
  reps integer not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- User body metrics (weight tracking over time)
create table if not exists public.body_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  date date not null default current_date,
  weight real,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Indexes for performance
create index if not exists idx_workout_logs_user on public.workout_logs (user_id, date desc);
create index if not exists idx_exercise_logs_workout on public.exercise_logs (workout_log_id);
create index if not exists idx_set_logs_exercise on public.set_logs (exercise_log_id);
create index if not exists idx_body_metrics_user on public.body_metrics (user_id, date desc);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.workout_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.set_logs enable row level security;
alter table public.body_metrics enable row level security;

-- Profiles policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own profile' and tablename = 'profiles') then
    create policy "Users can view own profile"
      on public.profiles for select
      using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own profile' and tablename = 'profiles') then
    create policy "Users can update own profile"
      on public.profiles for update
      using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own profile' and tablename = 'profiles') then
    create policy "Users can insert own profile"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end $$;

-- Workout logs policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own workout logs' and tablename = 'workout_logs') then
    create policy "Users can view own workout logs"
      on public.workout_logs for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own workout logs' and tablename = 'workout_logs') then
    create policy "Users can insert own workout logs"
      on public.workout_logs for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own workout logs' and tablename = 'workout_logs') then
    create policy "Users can update own workout logs"
      on public.workout_logs for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- Exercise logs policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own exercise logs' and tablename = 'exercise_logs') then
    create policy "Users can view own exercise logs"
      on public.exercise_logs for select
      using (
        exists (
          select 1 from public.workout_logs
          where workout_logs.id = exercise_logs.workout_log_id
          and workout_logs.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own exercise logs' and tablename = 'exercise_logs') then
    create policy "Users can insert own exercise logs"
      on public.exercise_logs for insert
      with check (
        exists (
          select 1 from public.workout_logs
          where workout_logs.id = exercise_logs.workout_log_id
          and workout_logs.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Set logs policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own set logs' and tablename = 'set_logs') then
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
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own set logs' and tablename = 'set_logs') then
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
  end if;
end $$;

-- Body metrics policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own metrics' and tablename = 'body_metrics') then
    create policy "Users can view own metrics"
      on public.body_metrics for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own metrics' and tablename = 'body_metrics') then
    create policy "Users can insert own metrics"
      on public.body_metrics for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own metrics' and tablename = 'body_metrics') then
    create policy "Users can update own metrics"
      on public.body_metrics for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- Trainer invite codes
create table if not exists public.trainer_invites (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles on delete cascade not null,
  code text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used boolean not null default false,
  used_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- Trainer-client relationships
create table if not exists public.trainer_clients (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references public.profiles on delete cascade not null,
  client_id uuid references public.profiles on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'removed')),
  connected_at timestamptz not null default now(),
  unique (trainer_id, client_id)
);

-- Indexes
create index if not exists idx_trainer_invites_code on public.trainer_invites (code);
create index if not exists idx_trainer_invites_trainer on public.trainer_invites (trainer_id);
create index if not exists idx_trainer_clients_trainer on public.trainer_clients (trainer_id);
create index if not exists idx_trainer_clients_client on public.trainer_clients (client_id);

-- RLS
alter table public.trainer_invites enable row level security;
alter table public.trainer_clients enable row level security;

-- Trainer invites policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Trainers can manage own invites' and tablename = 'trainer_invites') then
    create policy "Trainers can manage own invites"
      on public.trainer_invites for all
      using (auth.uid() = trainer_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Anyone can read invite by code' and tablename = 'trainer_invites') then
    create policy "Anyone can read invite by code"
      on public.trainer_invites for select
      using (true);
  end if;
end $$;

-- Trainer clients policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Trainers can view own clients' and tablename = 'trainer_clients') then
    create policy "Trainers can view own clients"
      on public.trainer_clients for select
      using (auth.uid() = trainer_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Clients can view own trainer' and tablename = 'trainer_clients') then
    create policy "Clients can view own trainer"
      on public.trainer_clients for select
      using (auth.uid() = client_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'System can insert trainer_clients' and tablename = 'trainer_clients') then
    create policy "System can insert trainer_clients"
      on public.trainer_clients for insert
      with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Trainer can update own client relationships' and tablename = 'trainer_clients') then
    create policy "Trainer can update own client relationships"
      on public.trainer_clients for update
      using (auth.uid() = trainer_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Client can update own trainer relationship' and tablename = 'trainer_clients') then
    create policy "Client can update own trainer relationship"
      on public.trainer_clients for update
      using (auth.uid() = client_id);
  end if;
end $$;

-- RPC: Redeem invite code
create or replace function public.redeem_invite_code(p_code text)
returns jsonb as $$
declare
  v_invite record;
  v_client_id uuid;
  v_client_role text;
begin
  v_client_id := auth.uid();

  select role into v_client_role from public.profiles where id = v_client_id;
  if v_client_role != 'client' then
    return jsonb_build_object('success', false, 'error', 'only_clients');
  end if;

  select * into v_invite from public.trainer_invites
  where code = upper(p_code)
    and used = false
    and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if exists (
    select 1 from public.trainer_clients
    where trainer_id = v_invite.trainer_id
      and client_id = v_client_id
      and status = 'active'
  ) then
    return jsonb_build_object('success', false, 'error', 'already_connected');
  end if;

  insert into public.trainer_clients (trainer_id, client_id, status)
  values (v_invite.trainer_id, v_client_id, 'active')
  on conflict (trainer_id, client_id)
  do update set status = 'active', connected_at = now();

  update public.trainer_invites
  set used = true, used_by = v_client_id
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'trainer_id', v_invite.trainer_id);
end;
$$ language plpgsql security definer;

-- Custom workouts (trainer-created workout templates)
create table if not exists public.custom_workouts (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references public.profiles on delete cascade not null,
  name text not null,
  name_bg text not null default '',
  description text not null default '',
  description_bg text not null default '',
  difficulty text not null default 'intermediate' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  duration_minutes integer not null default 30,
  muscle_groups text[] not null default '{}',
  exercises jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_workouts_creator on public.custom_workouts (creator_id);
create index if not exists idx_custom_workouts_public on public.custom_workouts (is_public) where is_public = true;

alter table public.custom_workouts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Creators can manage own custom workouts' and tablename = 'custom_workouts') then
    create policy "Creators can manage own custom workouts"
      on public.custom_workouts for all
      using (auth.uid() = creator_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Public workouts are readable by all' and tablename = 'custom_workouts') then
    create policy "Public workouts are readable by all"
      on public.custom_workouts for select
      using (is_public = true);
  end if;
end $$;

-- Atomic workout save RPC
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
  insert into public.workout_logs (
    user_id, workout_id, workout_name, duration_seconds, completed, end_time, notes
  ) values (
    p_user_id, p_workout_id, p_workout_name, p_duration_seconds, true, now(), p_notes
  )
  returning id into v_workout_log_id;

  for v_exercise in select * from jsonb_array_elements(p_exercises)
  loop
    insert into public.exercise_logs (
      workout_log_id, exercise_id, exercise_name, order_index
    ) values (
      v_workout_log_id,
      v_exercise->>'exerciseId',
      v_exercise->>'exerciseName',
      (v_exercise->>'orderIndex')::integer
    )
    returning id into v_exercise_log_id;

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

-- Trigger to auto-create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
