-- ============================================================
-- Challenges & Gamification
-- Creates challenges, challenge_participants, and challenge_rewards
-- tables with RLS policies, indexes, and RPC functions.
-- ============================================================

-- 1. Challenges table
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  title_bg text,
  description text,
  description_bg text,
  challenge_type text not null check (challenge_type in ('frequency', 'streak', 'custom')),
  target_value numeric not null check (target_value > 0),
  start_date date not null,
  end_date date not null check (end_date > start_date),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  reward_type text check (reward_type in ('badge', 'discount', 'battle_pass', 'custom')),
  reward_description text,
  reward_tiers jsonb,
  discount_value numeric,
  discount_type text check (discount_type in ('percentage', 'fixed_amount')),
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

-- Trainer can read their own challenges
drop policy if exists "Trainers can read own challenges" on public.challenges;
create policy "Trainers can read own challenges"
  on public.challenges for select
  using (
    creator_id = auth.uid()
    or exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = challenges.id
        and cp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = challenges.creator_id
        and tc.client_id = auth.uid()
        and tc.status = 'active'
    )
  );

-- Only trainers can create challenges
drop policy if exists "Trainers can create challenges" on public.challenges;
create policy "Trainers can create challenges"
  on public.challenges for insert
  with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

-- No open UPDATE policy on challenges — status transitions handled by
-- complete_challenge RPC (SECURITY DEFINER). If editable fields are needed
-- in the future, add an update_challenge_details RPC.
drop policy if exists "Trainers can update own challenges" on public.challenges;

-- Trainers can delete their own challenges (only if upcoming)
drop policy if exists "Trainers can delete own challenges" on public.challenges;
create policy "Trainers can delete own challenges"
  on public.challenges for delete
  using (creator_id = auth.uid() and status = 'upcoming');

-- 2. Challenge participants table
create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  progress numeric not null default 0,
  rank integer,
  invited_by_trainer boolean not null default false,
  constraint challenge_participants_unique unique (challenge_id, user_id)
);

alter table public.challenge_participants enable row level security;

-- Participants and the challenge creator can read participants
drop policy if exists "Read challenge participants" on public.challenge_participants;
create policy "Read challenge participants"
  on public.challenge_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_participants.challenge_id
        and c.creator_id = auth.uid()
    )
    or exists (
      select 1 from public.challenge_participants cp2
      where cp2.challenge_id = challenge_participants.challenge_id
        and cp2.user_id = auth.uid()
    )
  );

-- Trainer can insert participants (invited) or client can self-join
drop policy if exists "Join challenges" on public.challenge_participants;
create policy "Join challenges"
  on public.challenge_participants for insert
  with check (
    -- Self-join: user is joining themselves AND is a connected client
    (
      user_id = auth.uid()
      and invited_by_trainer = false
      and exists (
        select 1 from public.challenges c
        join public.trainer_clients tc on tc.trainer_id = c.creator_id
        where c.id = challenge_participants.challenge_id
          and tc.client_id = auth.uid()
          and tc.status = 'active'
          and c.status in ('upcoming', 'active')
      )
    )
    or
    -- Trainer invite: creator is adding a connected client
    (
      invited_by_trainer = true
      and exists (
        select 1 from public.challenges c
        where c.id = challenge_participants.challenge_id
          and c.creator_id = auth.uid()
      )
      and exists (
        select 1 from public.trainer_clients tc
        join public.challenges c on c.creator_id = tc.trainer_id
        where c.id = challenge_participants.challenge_id
          and tc.client_id = challenge_participants.user_id
          and tc.status = 'active'
      )
    )
  );

-- No open UPDATE policy on challenge_participants.
-- Updates happen via SECURITY DEFINER RPCs: complete_challenge and update_custom_progress.
drop policy if exists "Trainer updates participant progress" on public.challenge_participants;

-- 3. Challenge rewards table (earned rewards)
create table if not exists public.challenge_rewards (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null check (reward_type in ('badge', 'discount_code', 'tier_reward', 'custom')),
  badge_name text,
  discount_code text,
  discount_value numeric,
  discount_type text check (discount_type in ('percentage', 'fixed_amount')),
  redeemed boolean not null default false,
  redeemed_at timestamptz,
  tier_level integer,
  description text,
  created_at timestamptz not null default now()
);

alter table public.challenge_rewards enable row level security;

-- Users can read their own rewards
drop policy if exists "Users read own rewards" on public.challenge_rewards;
create policy "Users read own rewards"
  on public.challenge_rewards for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_rewards.challenge_id
        and c.creator_id = auth.uid()
    )
  );

-- Only RPC inserts rewards (no direct insert policy for users)
-- No open UPDATE policy — redemption happens via redeem_discount_code RPC.
drop policy if exists "Trainer redeems discount codes" on public.challenge_rewards;

-- 4. Indexes
create index if not exists idx_challenges_creator on public.challenges(creator_id);
create index if not exists idx_challenges_status on public.challenges(status);
create index if not exists idx_challenge_participants_challenge on public.challenge_participants(challenge_id);
create index if not exists idx_challenge_participants_user on public.challenge_participants(user_id);
create index if not exists idx_challenge_rewards_user on public.challenge_rewards(user_id);
create index if not exists idx_challenge_rewards_challenge on public.challenge_rewards(challenge_id);

-- Prevent duplicate non-tier rewards per user per challenge
create unique index if not exists idx_challenge_rewards_unique_non_tier
  on public.challenge_rewards(challenge_id, user_id, reward_type)
  where tier_level is null;

-- Prevent duplicate tier rewards per user per challenge per tier
create unique index if not exists idx_challenge_rewards_unique_tier
  on public.challenge_rewards(challenge_id, user_id, reward_type, tier_level)
  where tier_level is not null;

-- Prevent duplicate discount codes
create unique index if not exists idx_challenge_rewards_discount_code
  on public.challenge_rewards(discount_code)
  where discount_code is not null;

-- 5. RPC: Compute leaderboard rankings from workout_logs
create or replace function public.get_challenge_leaderboard(p_challenge_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
  v_result json;
begin
  -- Get challenge details
  select * into v_challenge from challenges where id = p_challenge_id;
  if not found then
    return json_build_object('success', false, 'error', 'challenge_not_found');
  end if;

  -- Verify caller is a participant or the creator
  if v_challenge.creator_id != auth.uid() and not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) then
    return json_build_object('success', false, 'error', 'not_authorized');
  end if;

  -- Compute rankings based on challenge type
  if v_challenge.challenge_type = 'frequency' then
    select json_build_object('success', true, 'leaderboard', coalesce(json_agg(row_to_json(r) order by r.progress desc), '[]'::json))
    into v_result
    from (
      select
        cp.user_id,
        p.name as user_name,
        coalesce(wc.workout_count, 0) as progress,
        v_challenge.target_value as target
      from challenge_participants cp
      join profiles p on p.id = cp.user_id
      left join lateral (
        select count(*)::numeric as workout_count
        from workout_logs wl
        where wl.user_id = cp.user_id
          and wl.completed = true
          and wl.date >= v_challenge.start_date
          and wl.date <= v_challenge.end_date
      ) wc on true
      where cp.challenge_id = p_challenge_id
    ) r;

  elsif v_challenge.challenge_type = 'streak' then
    select json_build_object('success', true, 'leaderboard', coalesce(json_agg(row_to_json(r) order by r.progress desc), '[]'::json))
    into v_result
    from (
      select
        cp.user_id,
        p.name as user_name,
        coalesce(sc.max_streak, 0) as progress,
        v_challenge.target_value as target
      from challenge_participants cp
      join profiles p on p.id = cp.user_id
      left join lateral (
        select max(streak_len) as max_streak
        from (
          select count(*) as streak_len
          from (
            select wl.date,
                   wl.date - (row_number() over (order by wl.date))::int as grp
            from workout_logs wl
            where wl.user_id = cp.user_id
              and wl.completed = true
              and wl.date >= v_challenge.start_date
              and wl.date <= v_challenge.end_date
            group by wl.date
          ) dated
          group by grp
        ) streaks
      ) sc on true
      where cp.challenge_id = p_challenge_id
    ) r;

  elsif v_challenge.challenge_type = 'custom' then
    -- Custom: just read progress column directly
    select json_build_object('success', true, 'leaderboard', coalesce(json_agg(row_to_json(r) order by r.progress desc), '[]'::json))
    into v_result
    from (
      select
        cp.user_id,
        p.name as user_name,
        cp.progress,
        v_challenge.target_value as target
      from challenge_participants cp
      join profiles p on p.id = cp.user_id
      where cp.challenge_id = p_challenge_id
    ) r;

  else
    return json_build_object('success', false, 'error', 'unknown_challenge_type');
  end if;

  return v_result;
end;
$$;

-- 6. RPC: Complete a challenge — assign ranks, generate rewards
create or replace function public.complete_challenge(p_challenge_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
  v_participant record;
  v_rank integer := 0;
  v_last_progress numeric := null;
  v_code text;
begin
  -- Get challenge, verify ownership
  select * into v_challenge from challenges where id = p_challenge_id;
  if not found then
    return json_build_object('success', false, 'error', 'challenge_not_found');
  end if;
  if v_challenge.creator_id != auth.uid() then
    return json_build_object('success', false, 'error', 'not_authorized');
  end if;
  if v_challenge.status = 'completed' then
    return json_build_object('success', false, 'error', 'already_completed');
  end if;

  -- Update challenge status
  update challenges set status = 'completed' where id = p_challenge_id;

  -- Get leaderboard data and assign ranks
  for v_participant in (
    select
      cp.id as participant_id,
      cp.user_id,
      case
        when v_challenge.challenge_type = 'frequency' then
          coalesce((
            select count(*)::numeric from workout_logs wl
            where wl.user_id = cp.user_id and wl.completed = true
              and wl.date >= v_challenge.start_date and wl.date <= v_challenge.end_date
          ), 0)
        when v_challenge.challenge_type = 'streak' then
          coalesce((
            select max(streak_len)::numeric from (
              select count(*) as streak_len from (
                select wl.date, wl.date - (row_number() over (order by wl.date))::int as grp
                from workout_logs wl
                where wl.user_id = cp.user_id and wl.completed = true
                  and wl.date >= v_challenge.start_date and wl.date <= v_challenge.end_date
                group by wl.date
              ) d group by grp
            ) s
          ), 0)
        else cp.progress
      end as final_progress
    from challenge_participants cp
    where cp.challenge_id = p_challenge_id
    order by final_progress desc
  )
  loop
    -- Dense ranking (tied scores get same rank)
    if v_last_progress is null or v_participant.final_progress < v_last_progress then
      v_rank := v_rank + 1;
    end if;
    v_last_progress := v_participant.final_progress;

    -- Update rank
    update challenge_participants
    set rank = v_rank, progress = v_participant.final_progress
    where id = v_participant.participant_id;

    -- Generate rewards based on reward_type
    if v_challenge.reward_type = 'badge' and v_rank = 1 then
      insert into challenge_rewards (challenge_id, user_id, reward_type, badge_name, description)
      values (p_challenge_id, v_participant.user_id, 'badge',
              v_challenge.title || ' Winner',
              coalesce(v_challenge.reward_description, 'Challenge winner!'))
      on conflict do nothing;

    elsif v_challenge.reward_type = 'discount' and v_rank = 1 then
      v_code := 'GYM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
             || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      insert into challenge_rewards (challenge_id, user_id, reward_type, discount_code,
                                     discount_value, discount_type, description)
      values (p_challenge_id, v_participant.user_id, 'discount_code', v_code,
              v_challenge.discount_value, v_challenge.discount_type,
              coalesce(v_challenge.reward_description, 'Discount reward'))
      on conflict do nothing;

    elsif v_challenge.reward_type = 'custom' and v_rank = 1 then
      insert into challenge_rewards (challenge_id, user_id, reward_type, description)
      values (p_challenge_id, v_participant.user_id, 'custom',
              coalesce(v_challenge.reward_description, 'Challenge reward'))
      on conflict do nothing;

    elsif v_challenge.reward_type = 'battle_pass' then
      -- Battle pass: check each tier
      if v_challenge.reward_tiers is not null then
        declare
          v_tier jsonb;
          v_pct numeric;
        begin
          for v_tier in select jsonb_array_elements(v_challenge.reward_tiers)
          loop
            v_pct := case when v_challenge.target_value > 0
                         then (v_participant.final_progress / v_challenge.target_value) * 100
                         else 0 end;
            if v_pct >= (v_tier->>'threshold')::numeric then
              if (v_tier->>'reward_type')::text = 'discount' then
                v_code := 'GYM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
                       || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
                insert into challenge_rewards (challenge_id, user_id, reward_type, tier_level,
                                               discount_code, discount_value, discount_type, description)
                values (p_challenge_id, v_participant.user_id, 'tier_reward',
                        (v_tier->>'tier')::integer, v_code,
                        (v_tier->>'discount_value')::numeric,
                        (v_tier->>'discount_type')::text,
                        coalesce(v_tier->>'description', 'Tier reward'))
                on conflict do nothing;
              else
                insert into challenge_rewards (challenge_id, user_id, reward_type, tier_level,
                                               badge_name, description)
                values (p_challenge_id, v_participant.user_id, 'tier_reward',
                        (v_tier->>'tier')::integer,
                        v_tier->>'badge_name',
                        coalesce(v_tier->>'description', 'Tier reward'))
                on conflict do nothing;
              end if;
            end if;
          end loop;
        end;
      end if;
    end if;
  end loop;

  return json_build_object('success', true);
end;
$$;

-- 7. Notify challenge leaderboard channel when a workout is logged
create or replace function public.notify_challenge_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
begin
  -- Find active challenges this user participates in
  for v_challenge_id in
    select c.id from challenges c
    join challenge_participants cp on cp.challenge_id = c.id
    where cp.user_id = NEW.user_id
      and c.status = 'active'
      and NEW.date >= c.start_date
      and NEW.date <= c.end_date
  loop
    perform pg_notify('challenge_update', json_build_object(
      'challenge_id', v_challenge_id,
      'user_id', NEW.user_id
    )::text);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_challenge_workout on public.workout_logs;
create trigger trg_notify_challenge_workout
  after insert on public.workout_logs
  for each row
  when (NEW.completed = true)
  execute function notify_challenge_workout();

-- 8. RPC: Update custom challenge progress (trainer only)
create or replace function public.update_custom_progress(
  p_participant_id uuid,
  p_progress numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
begin
  -- Verify the caller is the challenge creator and it's a custom challenge
  select c.* into v_challenge
  from challenges c
  join challenge_participants cp on cp.challenge_id = c.id
  where cp.id = p_participant_id
    and c.creator_id = auth.uid()
    and c.challenge_type = 'custom'
    and c.status = 'active';

  if not found then
    return json_build_object('success', false, 'error', 'not_authorized_or_not_custom');
  end if;

  update challenge_participants
  set progress = p_progress
  where id = p_participant_id;

  return json_build_object('success', true);
end;
$$;

-- 9. RPC: Mark a discount code as redeemed (trainer only)
create or replace function public.redeem_discount_code(p_reward_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller is the challenge creator
  if not exists (
    select 1 from challenge_rewards cr
    join challenges c on c.id = cr.challenge_id
    where cr.id = p_reward_id
      and c.creator_id = auth.uid()
      and cr.redeemed = false
  ) then
    return json_build_object('success', false, 'error', 'not_authorized_or_already_redeemed');
  end if;

  update challenge_rewards
  set redeemed = true, redeemed_at = now()
  where id = p_reward_id;

  return json_build_object('success', true);
end;
$$;

-- 9. RPC: Create a challenge with initial participants (atomic)
create or replace function public.create_challenge(
  p_title text,
  p_title_bg text default null,
  p_description text default null,
  p_description_bg text default null,
  p_challenge_type text default 'frequency',
  p_target_value numeric default 1,
  p_start_date date default current_date,
  p_end_date date default (current_date + 30),
  p_reward_type text default null,
  p_reward_description text default null,
  p_reward_tiers jsonb default null,
  p_discount_value numeric default null,
  p_discount_type text default null,
  p_participant_ids uuid[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_pid uuid;
begin
  -- Verify caller is a trainer
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'trainer'
  ) then
    return json_build_object('success', false, 'error', 'not_trainer');
  end if;

  -- Validate title
  if char_length(trim(p_title)) = 0 then
    return json_build_object('success', false, 'error', 'empty_title');
  end if;

  -- Insert challenge
  insert into challenges (
    creator_id, title, title_bg, description, description_bg,
    challenge_type, target_value, start_date, end_date,
    reward_type, reward_description, reward_tiers,
    discount_value, discount_type
  ) values (
    auth.uid(), p_title, p_title_bg, p_description, p_description_bg,
    p_challenge_type, p_target_value, p_start_date, p_end_date,
    p_reward_type, p_reward_description, p_reward_tiers,
    p_discount_value, p_discount_type
  ) returning id into v_challenge_id;

  -- Insert participants (all verified as connected clients)
  foreach v_pid in array p_participant_ids
  loop
    if exists (
      select 1 from trainer_clients
      where trainer_id = auth.uid() and client_id = v_pid and status = 'active'
    ) then
      insert into challenge_participants (challenge_id, user_id, invited_by_trainer)
      values (v_challenge_id, v_pid, true)
      on conflict do nothing;
    end if;
  end loop;

  return json_build_object('success', true, 'id', v_challenge_id);
end;
$$;
