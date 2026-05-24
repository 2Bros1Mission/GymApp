-- ============================================================
-- Issue #130: RLS Policies for Challenge Tables
-- Adds access control policies to all 7 challenge-related tables.
-- Tables and RLS were enabled in Issues #128 and #129.
-- No DELETE policies — challenge data uses status changes instead.
-- No UPDATE on challenges — status transitions happen in server-side
-- functions (reset, expiry, completion) that bypass RLS.
-- ============================================================

-- Helper functions (SECURITY DEFINER) to break circular RLS dependencies
-- between challenges and challenge_participants.

create or replace function public.get_my_challenge_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select challenge_id from public.challenge_participants where user_id = auth.uid();
$$;

create or replace function public.get_my_created_challenge_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select id from public.challenges where creator_id = auth.uid();
$$;

-- 1. challenge_templates — Public library, readable by all authenticated users
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Anyone can read challenge templates' and tablename = 'challenge_templates') then
  create policy "Anyone can read challenge templates"
    on public.challenge_templates for select
    to authenticated
    using (true);
end if;
end $$;

-- 2. challenges — Participants + creators can read; trainers can insert
-- For trainer-sourced challenges, the client must be connected to the
-- trainer via trainer_clients (belt-and-suspenders with service layer).
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users read challenges they participate in' and tablename = 'challenges') then
  create policy "Users read challenges they participate in"
    on public.challenges for select
    to authenticated
    using (
      creator_id = auth.uid()
      or (
        id in (select * from public.get_my_challenge_ids())
        and (
          source = 'platform'
          or creator_id in (
            select trainer_id from public.trainer_clients
            where client_id = auth.uid() and status = 'active'
          )
        )
      )
    );
end if;
end $$;

-- Platform challenges are created via discovery RPC (security definer);
-- only trainer-sourced challenges are insertable via direct client calls.
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Trainers can create challenges' and tablename = 'challenges') then
  create policy "Trainers can create challenges"
    on public.challenges for insert
    to authenticated
    with check (
      source = 'trainer'
      and creator_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'trainer'
      )
    );
end if;
end $$;

-- 3. challenge_participants — Own rows + trainer sees connected clients
-- Trainer access is double-gated: must have created the challenge AND
-- be connected to the participant via trainer_clients.
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users read own participations' and tablename = 'challenge_participants') then
  create policy "Users read own participations"
    on public.challenge_participants for select
    to authenticated
    using (
      user_id = auth.uid()
      or (
        challenge_id in (select * from public.get_my_created_challenge_ids())
        and user_id in (
          select client_id from public.trainer_clients
          where trainer_id = auth.uid() and status = 'active'
        )
      )
    );
end if;
end $$;

do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users can join active challenges' and tablename = 'challenge_participants') then
  create policy "Users can join active challenges"
    on public.challenge_participants for insert
    to authenticated
    with check (
      user_id = auth.uid()
      and challenge_id in (
        select id from public.challenges where status = 'active'
      )
    );
end if;
end $$;

do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users can update own participations' and tablename = 'challenge_participants') then
  create policy "Users can update own participations"
    on public.challenge_participants for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
end if;
end $$;

-- 4. user_challenge_state — Own rows only (created on-demand via discovery)
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users manage own challenge state' and tablename = 'user_challenge_state') then
  create policy "Users manage own challenge state"
    on public.user_challenge_state for select
    to authenticated
    using (user_id = auth.uid());
end if;
end $$;

do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users update own challenge state' and tablename = 'user_challenge_state') then
  create policy "Users update own challenge state"
    on public.user_challenge_state for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
end if;
end $$;

do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users insert own challenge state' and tablename = 'user_challenge_state') then
  create policy "Users insert own challenge state"
    on public.user_challenge_state for insert
    to authenticated
    with check (user_id = auth.uid());
end if;
end $$;

-- 5. trainer_challenge_templates — Trainers manage own saved blocks
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Trainers manage own templates' and tablename = 'trainer_challenge_templates') then
  create policy "Trainers manage own templates"
    on public.trainer_challenge_templates for all
    to authenticated
    using (
      trainer_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'trainer'
      )
    )
    with check (
      trainer_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'trainer'
      )
    );
end if;
end $$;

-- 6. leaderboard_snapshot — Top 100 readable by all authenticated users
-- Writes happen via refresh_leaderboard_snapshot() (security definer, Issue #135).
-- Note: exposes user_name intentionally — public leaderboard by design.
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Anyone can read leaderboard' and tablename = 'leaderboard_snapshot') then
  create policy "Anyone can read leaderboard"
    on public.leaderboard_snapshot for select
    to authenticated
    using (true);
end if;
end $$;

-- 7. leaderboard_history — Private monthly archives, own rows only
do $$ begin
if not exists (select 1 from pg_policies where policyname = 'Users read own leaderboard history' and tablename = 'leaderboard_history') then
  create policy "Users read own leaderboard history"
    on public.leaderboard_history for select
    to authenticated
    using (user_id = auth.uid());
end if;
end $$;
