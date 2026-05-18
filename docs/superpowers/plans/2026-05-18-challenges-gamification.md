# Challenges & Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a challenge/competition system where trainers create challenges for their clients, with real-time leaderboards, auto-tracked progress, and a reward system (badges, discount codes, battle pass tiers, custom text).

**Architecture:** Three new database tables (`challenges`, `challenge_participants`, `challenge_rewards`) with RLS policies, two RPC functions (`get_challenge_leaderboard`, `complete_challenge`), a new service file (`challengeService.ts`), and five new screens (challenges list, detail/leaderboard, create challenge, celebration modal, profile badges). Leaderboard progress is computed on-the-fly from `workout_logs` (Approach A). Real-time updates via Supabase Realtime channel subscriptions.

**Tech Stack:** React Native (Expo SDK 54), TypeScript 5.9, expo-router v6, Supabase (PostgreSQL + RLS + Realtime), Ionicons

**Design spec:** `Documentation/issue-28-challenges-design-draft.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260412120000_challenges.sql` | Tables, RLS policies, indexes, RPC functions |
| `src/types/challenges.ts` | TypeScript interfaces for challenges, participants, rewards |
| `src/lib/challengeService.ts` | All challenge CRUD, leaderboard, rewards, Realtime |
| `app/(tabs)/challenges.tsx` | Challenges list tab (active, upcoming, completed) |
| `app/challenge-detail.tsx` | Challenge detail with leaderboard + Realtime |
| `app/create-challenge.tsx` | Trainer creates a challenge (form) |
| `src/components/CelebrationModal.tsx` | Full-screen celebration with confetti |
| `src/components/BadgeDisplay.tsx` | Badge/trophy rendering component |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Re-export from `challenges.ts` |
| `src/constants/i18n.ts` | Add BG + EN strings for all challenge UI |
| `app/(tabs)/_layout.tsx` | Add 5th "Challenges" tab for both roles |
| `src/components/Sidebar.tsx` | Add challenges nav item for both roles |
| `app/(tabs)/profile.tsx` | Add earned badges section |

---

## Task 1: Database Migration — Tables, RLS, Indexes

**Files:**
- Create: `supabase/migrations/20260412120000_challenges.sql`

- [ ] **Step 1: Write the challenges table**

```sql
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

-- Trainers can update their own challenges
drop policy if exists "Trainers can update own challenges" on public.challenges;
create policy "Trainers can update own challenges"
  on public.challenges for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- Trainers can delete their own challenges (only if upcoming)
drop policy if exists "Trainers can delete own challenges" on public.challenges;
create policy "Trainers can delete own challenges"
  on public.challenges for delete
  using (creator_id = auth.uid() and status = 'upcoming');
```

- [ ] **Step 2: Write the challenge_participants table**

```sql
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

-- Only challenge creator can update (for custom progress, rank)
drop policy if exists "Trainer updates participant progress" on public.challenge_participants;
create policy "Trainer updates participant progress"
  on public.challenge_participants for update
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_participants.challenge_id
        and c.creator_id = auth.uid()
    )
  );
```

- [ ] **Step 3: Write the challenge_rewards table**

```sql
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
-- Trainer can update redeemed status
drop policy if exists "Trainer redeems discount codes" on public.challenge_rewards;
create policy "Trainer redeems discount codes"
  on public.challenge_rewards for update
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_rewards.challenge_id
        and c.creator_id = auth.uid()
    )
  );
```

- [ ] **Step 4: Write indexes**

```sql
-- 4. Indexes
create index if not exists idx_challenges_creator on public.challenges(creator_id);
create index if not exists idx_challenges_status on public.challenges(status);
create index if not exists idx_challenge_participants_challenge on public.challenge_participants(challenge_id);
create index if not exists idx_challenge_participants_user on public.challenge_participants(user_id);
create index if not exists idx_challenge_rewards_user on public.challenge_rewards(user_id);
create index if not exists idx_challenge_rewards_challenge on public.challenge_rewards(challenge_id);
```

- [ ] **Step 5: Write the get_challenge_leaderboard RPC**

```sql
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
```

- [ ] **Step 6: Write the complete_challenge RPC**

```sql
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
  -- For frequency/streak, compute from workout_logs; for custom, use progress column
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
              coalesce(v_challenge.reward_description, 'Challenge winner!'));

    elsif v_challenge.reward_type = 'discount' and v_rank = 1 then
      v_code := 'GYM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
             || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      insert into challenge_rewards (challenge_id, user_id, reward_type, discount_code,
                                     discount_value, discount_type, description)
      values (p_challenge_id, v_participant.user_id, 'discount_code', v_code,
              v_challenge.discount_value, v_challenge.discount_type,
              coalesce(v_challenge.reward_description, 'Discount reward'));

    elsif v_challenge.reward_type = 'custom' and v_rank = 1 then
      insert into challenge_rewards (challenge_id, user_id, reward_type, description)
      values (p_challenge_id, v_participant.user_id, 'custom',
              coalesce(v_challenge.reward_description, 'Challenge reward'));

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
```

- [ ] **Step 7: Write the Realtime notification trigger**

```sql
-- 7. Notify challenge leaderboard channel when a workout is logged
-- (lightweight: just triggers a refresh, no data in payload)
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
```

- [ ] **Step 8: Verify the migration file is valid**

Run: `npx supabase db lint --level warning` (if available) or visually review for syntax errors.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260412120000_challenges.sql
git commit -m "feat(db): add challenges tables, RLS, leaderboard and completion RPCs

Closes part of #28"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/challenges.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/challenges.ts

export type ChallengeType = 'frequency' | 'streak' | 'custom';
export type ChallengeStatus = 'upcoming' | 'active' | 'completed';
export type RewardType = 'badge' | 'discount' | 'battle_pass' | 'custom';
export type DiscountType = 'percentage' | 'fixed_amount';
export type ChallengeRewardKind = 'badge' | 'discount_code' | 'tier_reward' | 'custom';

export interface BattlePassTier {
  tier: number;
  threshold: number; // percentage of target_value (e.g., 50 = 50%)
  reward_type: 'badge' | 'discount';
  badge_name?: string;
  discount_value?: number;
  discount_type?: DiscountType;
  description: string;
}

export interface Challenge {
  id: string;
  creatorId: string;
  title: string;
  titleBg: string | null;
  description: string | null;
  descriptionBg: string | null;
  challengeType: ChallengeType;
  targetValue: number;
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  rewardType: RewardType | null;
  rewardDescription: string | null;
  rewardTiers: BattlePassTier[] | null;
  discountValue: number | null;
  discountType: DiscountType | null;
  createdAt: string;
  // Joined
  participantCount?: number;
  creatorName?: string;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  joinedAt: string;
  progress: number;
  rank: number | null;
  invitedByTrainer: boolean;
  // Joined
  userName?: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  progress: number;
  target: number;
}

export interface ChallengeReward {
  id: string;
  challengeId: string;
  userId: string;
  rewardType: ChallengeRewardKind;
  badgeName: string | null;
  discountCode: string | null;
  discountValue: number | null;
  discountType: DiscountType | null;
  redeemed: boolean;
  redeemedAt: string | null;
  tierLevel: number | null;
  description: string | null;
  createdAt: string;
  // Joined
  challengeTitle?: string;
}
```

- [ ] **Step 2: Re-export from index**

Add to the bottom of `src/types/index.ts`:

```typescript
export type {
  ChallengeType,
  ChallengeStatus,
  RewardType,
  DiscountType,
  ChallengeRewardKind,
  BattlePassTier,
  Challenge,
  ChallengeParticipant,
  LeaderboardEntry,
  ChallengeReward,
} from './challenges';
```

- [ ] **Step 3: Commit**

```bash
git add src/types/challenges.ts src/types/index.ts
git commit -m "feat(types): add Challenge, ChallengeParticipant, ChallengeReward types"
```

---

## Task 3: Challenge Service — CRUD & Leaderboard

**Files:**
- Create: `src/lib/challengeService.ts`

- [ ] **Step 1: Write the service file with mapper functions and CRUD**

```typescript
// src/lib/challengeService.ts
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Challenge,
  ChallengeParticipant,
  LeaderboardEntry,
  ChallengeReward,
  ChallengeType,
  RewardType,
  DiscountType,
  BattlePassTier,
} from '../types';

// ─── Mappers ────────────────────────────────────────────────────────────────

function mapRowToChallenge(row: Record<string, unknown>): Challenge {
  return {
    id: row.id as string,
    creatorId: row.creator_id as string,
    title: row.title as string,
    titleBg: row.title_bg as string | null,
    description: row.description as string | null,
    descriptionBg: row.description_bg as string | null,
    challengeType: row.challenge_type as ChallengeType,
    targetValue: row.target_value as number,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    status: row.status as Challenge['status'],
    rewardType: row.reward_type as RewardType | null,
    rewardDescription: row.reward_description as string | null,
    rewardTiers: row.reward_tiers as BattlePassTier[] | null,
    discountValue: row.discount_value as number | null,
    discountType: row.discount_type as DiscountType | null,
    createdAt: row.created_at as string,
    participantCount: (row.participant_count as number) ?? undefined,
    creatorName: (row.creator as { name: string } | null)?.name ?? undefined,
  };
}

function mapRowToReward(row: Record<string, unknown>): ChallengeReward {
  const challenge = row.challenge as { title: string } | null;
  return {
    id: row.id as string,
    challengeId: row.challenge_id as string,
    userId: row.user_id as string,
    rewardType: row.reward_type as ChallengeReward['rewardType'],
    badgeName: row.badge_name as string | null,
    discountCode: row.discount_code as string | null,
    discountValue: row.discount_value as number | null,
    discountType: row.discount_type as DiscountType | null,
    redeemed: row.redeemed as boolean,
    redeemedAt: row.redeemed_at as string | null,
    tierLevel: row.tier_level as number | null,
    description: row.description as string | null,
    createdAt: row.created_at as string,
    challengeTitle: challenge?.title,
  };
}

// ─── Challenge CRUD ─────────────────────────────────────────────────────────

export async function getChallenges(userId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*, creator:profiles!creator_id(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToChallenge(row as unknown as Record<string, unknown>));
}

export async function getChallengeDetail(challengeId: string): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*, creator:profiles!creator_id(name)')
    .eq('id', challengeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowToChallenge(data as unknown as Record<string, unknown>);
}

export async function createChallenge(params: {
  creatorId: string;
  title: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  challengeType: ChallengeType;
  targetValue: number;
  startDate: string;
  endDate: string;
  rewardType?: RewardType;
  rewardDescription?: string;
  rewardTiers?: BattlePassTier[];
  discountValue?: number;
  discountType?: DiscountType;
  participantIds: string[];
}): Promise<{ id?: string; error?: string }> {
  // Insert challenge
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      creator_id: params.creatorId,
      title: params.title,
      title_bg: params.titleBg ?? null,
      description: params.description ?? null,
      description_bg: params.descriptionBg ?? null,
      challenge_type: params.challengeType,
      target_value: params.targetValue,
      start_date: params.startDate,
      end_date: params.endDate,
      reward_type: params.rewardType ?? null,
      reward_description: params.rewardDescription ?? null,
      reward_tiers: params.rewardTiers ?? null,
      discount_value: params.discountValue ?? null,
      discount_type: params.discountType ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  const challengeId = data.id;

  // Insert initial participants
  if (params.participantIds.length > 0) {
    const rows = params.participantIds.map((uid) => ({
      challenge_id: challengeId,
      user_id: uid,
      invited_by_trainer: true,
    }));
    const { error: pError } = await supabase
      .from('challenge_participants')
      .insert(rows);
    if (pError) return { id: challengeId, error: pError.message };
  }

  return { id: challengeId };
}

export async function deleteChallenge(challengeId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', challengeId);
  if (error) return { error: error.message };
  return {};
}

// ─── Participation ──────────────────────────────────────────────────────────

export async function joinChallenge(challengeId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenge_participants')
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      invited_by_trainer: false,
    });
  if (error) return { error: error.message };
  return {};
}

export async function getParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('*, user:profiles!user_id(name)')
    .eq('challenge_id', challengeId)
    .order('rank', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    progress: row.progress,
    rank: row.rank,
    invitedByTrainer: row.invited_by_trainer,
    userName: (row.user as { name: string } | null)?.name ?? undefined,
  }));
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function getChallengeLeaderboard(challengeId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_leaderboard', {
    p_challenge_id: challengeId,
  });

  if (error) throw new Error(error.message);
  const result = data as unknown as {
    success: boolean;
    leaderboard?: Array<{
      user_id: string;
      user_name: string;
      progress: number;
      target: number;
    }>;
    error?: string;
  };
  if (!result?.success) throw new Error(result?.error ?? 'leaderboard_failed');
  return (result.leaderboard ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    progress: r.progress,
    target: r.target,
  }));
}

// ─── Custom Progress ────────────────────────────────────────────────────────

export async function updateCustomProgress(
  participantId: string,
  progress: number,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenge_participants')
    .update({ progress })
    .eq('id', participantId);
  if (error) return { error: error.message };
  return {};
}

// ─── Challenge Completion ───────────────────────────────────────────────────

export async function completeChallenge(challengeId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('complete_challenge', {
    p_challenge_id: challengeId,
  });

  if (error) return { success: false, error: error.message };
  const result = data as unknown as { success: boolean; error?: string };
  return result;
}

// ─── Rewards ────────────────────────────────────────────────────────────────

export async function getEarnedRewards(userId: string): Promise<ChallengeReward[]> {
  const { data, error } = await supabase
    .from('challenge_rewards')
    .select('*, challenge:challenges!challenge_id(title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToReward(row as unknown as Record<string, unknown>));
}

export async function getIssuedDiscountCodes(challengeId: string): Promise<ChallengeReward[]> {
  const { data, error } = await supabase
    .from('challenge_rewards')
    .select('*, challenge:challenges!challenge_id(title)')
    .eq('challenge_id', challengeId)
    .in('reward_type', ['discount_code', 'tier_reward'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToReward(row as unknown as Record<string, unknown>));
}

export async function redeemDiscountCode(rewardId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('challenge_rewards')
    .update({ redeemed: true, redeemed_at: new Date().toISOString() })
    .eq('id', rewardId);
  if (error) return { error: error.message };
  return {};
}

// ─── Realtime ───────────────────────────────────────────────────────────────

export function subscribeToChallengeUpdates(
  challengeId: string,
  onUpdate: () => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`challenge:${challengeId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'workout_logs',
      },
      () => {
        // Any new workout log triggers a leaderboard refresh
        onUpdate();
      },
    )
    .subscribe();

  return channel;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/challengeService.ts
git commit -m "feat(service): add challengeService with CRUD, leaderboard, rewards, realtime"
```

---

## Task 4: i18n Strings

**Files:**
- Modify: `src/constants/i18n.ts`

- [ ] **Step 1: Add BG challenge strings**

Add to the `bg` section in `translations`:

```typescript
    // Challenges
    'tab.challenges': 'Предизвикателства',
    'challenges.title': 'Предизвикателства',
    'challenges.active': 'Активни',
    'challenges.upcoming': 'Предстоящи',
    'challenges.completed': 'Завършени',
    'challenges.empty': 'Няма предизвикателства',
    'challenges.join': 'Присъедини се',
    'challenges.joined': 'Участваш',
    'challenges.create': 'Създай предизвикателство',
    'challenges.type': 'Тип',
    'challenges.frequency': 'Брой тренировки',
    'challenges.streak': 'Поредни дни',
    'challenges.custom': 'По избор',
    'challenges.target': 'Цел',
    'challenges.startDate': 'Начална дата',
    'challenges.endDate': 'Крайна дата',
    'challenges.participants': 'Участници',
    'challenges.selectClients': 'Избери клиенти',
    'challenges.reward': 'Награда',
    'challenges.rewardType': 'Тип награда',
    'challenges.badge': 'Значка',
    'challenges.discount': 'Отстъпка',
    'challenges.battlePass': 'Боен пропуск',
    'challenges.customReward': 'По избор',
    'challenges.rewardDescription': 'Описание на наградата',
    'challenges.discountValue': 'Стойност на отстъпката',
    'challenges.percentage': 'Процент',
    'challenges.fixedAmount': 'Фиксирана сума',
    'challenges.leaderboard': 'Класация',
    'challenges.rank': 'Място',
    'challenges.progress': 'Прогрес',
    'challenges.daysLeft': 'дни до края',
    'challenges.ended': 'Приключи',
    'challenges.complete': 'Приключи предизвикателството',
    'challenges.winner': 'Победител',
    'challenges.congratulations': 'Поздравления!',
    'challenges.yourRank': 'Твоето място',
    'challenges.rewards': 'Награди',
    'challenges.discountCode': 'Код за отстъпка',
    'challenges.redeemed': 'Използван',
    'challenges.markRedeemed': 'Маркирай като използван',
    'challenges.noRewards': 'Няма награди',
    'challenges.earnedBadges': 'Спечелени значки',
    'challenges.deleteConfirm': 'Сигурни ли сте, че искате да изтриете това предизвикателство?',
    'challenges.completeConfirm': 'Сигурни ли сте, че искате да приключите това предизвикателство? Ще бъдат раздадени награди.',
```

- [ ] **Step 2: Add EN challenge strings**

Add to the `en` section in `translations`:

```typescript
    // Challenges
    'tab.challenges': 'Challenges',
    'challenges.title': 'Challenges',
    'challenges.active': 'Active',
    'challenges.upcoming': 'Upcoming',
    'challenges.completed': 'Completed',
    'challenges.empty': 'No challenges yet',
    'challenges.join': 'Join',
    'challenges.joined': 'Joined',
    'challenges.create': 'Create Challenge',
    'challenges.type': 'Type',
    'challenges.frequency': 'Workout Frequency',
    'challenges.streak': 'Consecutive Days',
    'challenges.custom': 'Custom',
    'challenges.target': 'Target',
    'challenges.startDate': 'Start Date',
    'challenges.endDate': 'End Date',
    'challenges.participants': 'Participants',
    'challenges.selectClients': 'Select Clients',
    'challenges.reward': 'Reward',
    'challenges.rewardType': 'Reward Type',
    'challenges.badge': 'Badge',
    'challenges.discount': 'Discount',
    'challenges.battlePass': 'Battle Pass',
    'challenges.customReward': 'Custom',
    'challenges.rewardDescription': 'Reward Description',
    'challenges.discountValue': 'Discount Value',
    'challenges.percentage': 'Percentage',
    'challenges.fixedAmount': 'Fixed Amount',
    'challenges.leaderboard': 'Leaderboard',
    'challenges.rank': 'Rank',
    'challenges.progress': 'Progress',
    'challenges.daysLeft': 'days left',
    'challenges.ended': 'Ended',
    'challenges.complete': 'Complete Challenge',
    'challenges.winner': 'Winner',
    'challenges.congratulations': 'Congratulations!',
    'challenges.yourRank': 'Your Rank',
    'challenges.rewards': 'Rewards',
    'challenges.discountCode': 'Discount Code',
    'challenges.redeemed': 'Redeemed',
    'challenges.markRedeemed': 'Mark as Redeemed',
    'challenges.noRewards': 'No rewards yet',
    'challenges.earnedBadges': 'Earned Badges',
    'challenges.deleteConfirm': 'Are you sure you want to delete this challenge?',
    'challenges.completeConfirm': 'Are you sure you want to complete this challenge? Rewards will be distributed.',
```

- [ ] **Step 3: Verify no duplicate keys**

Run: `grep -c "challenges\." src/constants/i18n.ts` — should show the expected count for each language block.

- [ ] **Step 4: Commit**

```bash
git add src/constants/i18n.ts
git commit -m "feat(i18n): add BG + EN strings for challenges UI"
```

---

## Task 5: Navigation — Add Challenges Tab

**Files:**
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `src/components/Sidebar.tsx`
- Create: `app/(tabs)/challenges.tsx` (placeholder)

- [ ] **Step 1: Create the challenges tab placeholder**

Create `app/(tabs)/challenges.tsx` with minimal content so the tab works:

```typescript
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { FontSize, Spacing } from '../../src/constants/theme';

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: Spacing.lg }}>
        <Text style={{ fontSize: FontSize.xl, fontWeight: '700', color: colors.text }}>
          {t('challenges.title')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Add the tab to _layout.tsx**

In `app/(tabs)/_layout.tsx`, add the Challenges tab after Progress (for clients) and after Dashboard (for trainers). Insert before the `{/* Shared */}` comment:

```typescript
          {/* Challenges - both roles */}
          <Tabs.Screen
            name="challenges"
            options={{
              title: t('tab.challenges'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="trophy" size={size} color={color} />
              ),
            }}
          />
```

- [ ] **Step 3: Add challenges to Sidebar.tsx**

In `src/components/Sidebar.tsx`, add to both `CLIENT_NAV_ITEMS` and `TRAINER_NAV_ITEMS` arrays (before the profile item):

```typescript
  { route: '/(tabs)/challenges', segment: 'challenges', labelKey: 'tab.challenges', icon: 'trophy-outline', iconActive: 'trophy' },
```

- [ ] **Step 4: Verify the app builds**

Run: `npx tsc --noEmit && npx expo export --platform web`

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/challenges.tsx app/(tabs)/_layout.tsx src/components/Sidebar.tsx
git commit -m "feat(nav): add Challenges tab for both client and trainer roles"
```

---

## Task 6: Challenges List Screen

**Files:**
- Modify: `app/(tabs)/challenges.tsx`

- [ ] **Step 1: Implement the full challenges list screen**

Replace the placeholder with the full implementation. The screen shows three sections (active, upcoming, completed) with challenge cards. Trainers see a "Create" button. Clients see "Join" on challenges they haven't joined.

Follow the patterns from `app/goals.tsx`:
- `useFocusAsyncData` for data fetching
- `makeStyles(colors)` with `useMemo`
- `useOfflineGuard().guardAction()` for mutations
- `confirmAction()` for destructive actions
- `useAuth()` for user/profile
- `useTranslation()` for i18n
- `formatDate()` for dates

The screen should show each challenge card with: title, type badge, date range, participant count, progress bar (if active), reward info. Tapping a card navigates to `challenge-detail`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/challenges.tsx
git commit -m "feat(screen): implement challenges list screen with sections"
```

---

## Task 7: Challenge Detail & Leaderboard Screen

**Files:**
- Create: `app/challenge-detail.tsx`

- [ ] **Step 1: Implement challenge detail screen**

Create `app/challenge-detail.tsx` that shows:
- Challenge header (title, type, dates, status, reward info)
- Real-time leaderboard (ranked list with progress bars)
- Join button (for clients not yet participating)
- Complete button (for trainer, when challenge is active)
- Reward details section
- For completed challenges: final standings with ranks

Use `subscribeToChallengeUpdates()` from challengeService for real-time leaderboard refreshes. Follow the pattern from `app/chat.tsx` for Realtime subscriptions (subscribe in useEffect, cleanup on unmount via `supabase.removeChannel(channel)`).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/challenge-detail.tsx
git commit -m "feat(screen): implement challenge detail with real-time leaderboard"
```

---

## Task 8: Create Challenge Screen

**Files:**
- Create: `app/create-challenge.tsx`

- [ ] **Step 1: Implement the create challenge form**

Create `app/create-challenge.tsx` with a multi-step form:
1. Basic info: title (EN + BG), description (EN + BG), type picker, target value
2. Date range: start date, end date
3. Participants: checkboxes for connected clients (fetched via `getTrainerClients()`)
4. Reward: type picker (badge/discount/battle_pass/custom), description, and type-specific fields (discount value/type, battle pass tiers)

Use `useOfflineGuard().guardAction()` for the submit action. On success, navigate back to the challenges list.

Follow the form patterns from `app/goals.tsx` (overlay form card, input labels, type chip pickers).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/create-challenge.tsx
git commit -m "feat(screen): implement create challenge form with reward configuration"
```

---

## Task 9: Celebration Modal

**Files:**
- Create: `src/components/CelebrationModal.tsx`

- [ ] **Step 1: Implement celebration modal**

Create a full-screen modal component that displays:
- Confetti animation (use `react-native-reanimated` which is already installed for simple particle effects, or a simple CSS/JS confetti if web-compatible)
- Winner name highlighted with trophy icon
- Final leaderboard standings (top 3 with medal icons)
- Earned rewards display
- "Close" button

Props:
```typescript
interface CelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  challengeTitle: string;
  leaderboard: LeaderboardEntry[];
  rewards: ChallengeReward[];
  currentUserId: string;
}
```

Keep the confetti simple — animated circles falling down using `Animated` from React Native (no extra dependencies needed).

- [ ] **Step 2: Integrate into challenge-detail.tsx**

Show the CelebrationModal when a challenge transitions to "completed" (after the trainer clicks "Complete Challenge" and the RPC succeeds).

- [ ] **Step 3: Commit**

```bash
git add src/components/CelebrationModal.tsx app/challenge-detail.tsx
git commit -m "feat(ui): add celebration modal with confetti and winner display"
```

---

## Task 10: Badge Display & Profile Integration

**Files:**
- Create: `src/components/BadgeDisplay.tsx`
- Modify: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Create BadgeDisplay component**

A reusable component that renders a badge/trophy:

```typescript
interface BadgeDisplayProps {
  badgeName: string;
  challengeTitle?: string;
  earnedAt: string;
}
```

Render as a card with a trophy icon (`Ionicons name="trophy"`), badge name, challenge title, and date earned. Use `makeStyles(colors)` pattern.

- [ ] **Step 2: Add earned badges section to profile**

In `app/(tabs)/profile.tsx`, add a section after the existing content that:
1. Fetches rewards via `getEarnedRewards(userId)`
2. Filters for badge-type rewards
3. Renders them using `BadgeDisplay`
4. Shows "No badges yet" empty state

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/BadgeDisplay.tsx app/(tabs)/profile.tsx
git commit -m "feat(ui): add badge display component and profile badges section"
```

---

## Task 11: Final Verification & CI

**Files:** None (verification only)

- [ ] **Step 1: Run linter**

Run: `npx eslint .`
Fix any lint errors.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Fix any type errors.

- [ ] **Step 3: Run tests**

Run: `npx jest --passWithNoTests`
All tests must pass.

- [ ] **Step 4: Run web export**

Run: `npx expo export --platform web`
Must complete without errors.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/type errors from challenges feature"
```

---

## Task 12: Create PR

- [ ] **Step 1: Create feature branch and PR**

```bash
git checkout -b feat/28-challenges-gamification
git push -u origin feat/28-challenges-gamification
```

Create PR with:
- Title: `feat: add challenges & gamification system (#28)`
- Description: summary of all changes, new files, modified files, test plan
- Reference: `Closes #28`

- [ ] **Step 2: Run pre-PR reviews**

Run `/security-review` on the branch.
Run `/pr-review-toolkit:review-pr` on the PR.
Run `/review` on the PR.

Address any findings before merging.
