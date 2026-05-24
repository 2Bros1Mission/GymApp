-- ============================================================
-- Issue #130: RLS Policies for Challenge Tables
-- Adds access control policies to all 7 challenge-related tables.
-- Tables and RLS were enabled in Issues #128 and #129.
-- No DELETE policies — challenge data uses status changes instead.
-- No UPDATE on challenges — status transitions happen in server-side
-- functions (reset, expiry, completion) that bypass RLS.
-- ============================================================

-- 1. challenge_templates — Public library, readable by all authenticated users
create policy "Anyone can read challenge templates"
  on public.challenge_templates for select
  to authenticated
  using (true);

-- 2. challenges — Participants + creators can read; trainers can insert
-- For trainer-sourced challenges, the client must be connected to the
-- trainer via trainer_clients (belt-and-suspenders with service layer).
create policy "Users read challenges they participate in"
  on public.challenges for select
  to authenticated
  using (
    creator_id = auth.uid()
    or (
      id in (select challenge_id from public.challenge_participants where user_id = auth.uid())
      and (
        source = 'platform'
        or creator_id in (
          select trainer_id from public.trainer_clients
          where client_id = auth.uid() and status = 'active'
        )
      )
    )
  );

-- Platform challenges are created via discovery RPC (security definer);
-- only trainer-sourced challenges are insertable via direct client calls.
create policy "Trainers can create challenges"
  on public.challenges for insert
  to authenticated
  with check (source = 'trainer' and creator_id = auth.uid());

-- 3. challenge_participants — Own rows + trainer sees connected clients
-- Trainer access is double-gated: must have created the challenge AND
-- be connected to the participant via trainer_clients.
create policy "Users read own participations"
  on public.challenge_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      challenge_id in (select id from public.challenges where creator_id = auth.uid())
      and user_id in (
        select client_id from public.trainer_clients
        where trainer_id = auth.uid() and status = 'active'
      )
    )
  );

create policy "Users can join challenges via discovery"
  on public.challenge_participants for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own participations"
  on public.challenge_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. user_challenge_state — Own rows only (created on-demand via discovery)
create policy "Users manage own challenge state"
  on public.user_challenge_state for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users update own challenge state"
  on public.user_challenge_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users insert own challenge state"
  on public.user_challenge_state for insert
  to authenticated
  with check (user_id = auth.uid());

-- 5. trainer_challenge_templates — Trainers manage own saved blocks
create policy "Trainers manage own templates"
  on public.trainer_challenge_templates for all
  to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

-- 6. leaderboard_snapshot — Top 100 readable by all authenticated users
-- Writes happen via refresh_leaderboard_snapshot() (security definer, Issue #135).
create policy "Anyone can read leaderboard"
  on public.leaderboard_snapshot for select
  to authenticated
  using (true);

-- 7. leaderboard_history — Private monthly archives, own rows only
create policy "Users read own leaderboard history"
  on public.leaderboard_history for select
  to authenticated
  using (user_id = auth.uid());
