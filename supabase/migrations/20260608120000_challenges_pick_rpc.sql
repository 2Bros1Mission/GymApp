-- ============================================================
-- Issue #136: fn_pick_challenge RPC
--
-- Atomic challenge pick: validates active-limit, cooldown,
-- completion-limit, anti-repetition state, and not-already-active,
-- then inserts the challenge_participants row and updates the
-- two state tables (user_challenge_state, challenge_pick_cooldowns).
--
-- Wrapped in a single function (one transaction) to avoid the
-- two-step partial-failure window the service layer would have
-- with direct table writes:
--   1) insert participant
--   2) update state
-- If step 2 fails, the user is enrolled but cooldown / recent_picks
-- aren't recorded, allowing exploit. Doing it server-side closes
-- the window.
--
-- Returns jsonb so the caller gets a structured result without
-- the protocol noise of an OUT-param record:
--   { ok: true,  participant_id: uuid }
--   { ok: false, error: 'cooldown' | 'limit_reached' | 'already_active'
--                     | 'not_found' | 'inactive' | 'not_platform' }
--
-- Side effects on success:
--   * INSERT challenge_participants (status='active', source='discovery')
--   * UPSERT user_challenge_state — last_pick_at = now(), append
--     template_id to recent_template_ids (cap last 10)
--   * UPSERT challenge_pick_cooldowns — picked_at = now()
--
-- Notes on validation order:
--   * not_found / inactive / not_platform first — cheapest checks,
--     and returning these early prevents leaking info via timing
--     for active-limit / cooldown when the challenge isn't even
--     pickable.
--   * already_active before active-limit / cooldown so the user
--     gets an accurate error instead of a misleading "limit_reached".
--   * cooldown before active-limit (cheaper read).
--   * completion-limit last — requires user_challenge_state.
--
-- Concurrency: SELECT ... FOR UPDATE on the user's
-- user_challenge_state row serializes simultaneous picks for the
-- same cadence. The unique (user_id, template_id) PK on
-- challenge_pick_cooldowns and the unique (challenge_id, user_id)
-- on challenge_participants are belt-and-suspenders against any
-- gap in the lock.
--
-- Depends on: #128, #136 cooldown migration above.
-- ============================================================

create or replace function public.fn_pick_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge record;
  v_active_count integer;
  v_max_active integer;
  v_max_completions integer;
  v_state record;
  v_cooldown_picked_at timestamptz;
  v_participant_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- 1. Challenge sanity ----------------------------------------
  select id, template_id, source, status, cadence
  into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_challenge.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  if v_challenge.source <> 'platform' then
    return jsonb_build_object('ok', false, 'error', 'not_platform');
  end if;

  if v_challenge.template_id is null then
    -- Schema constraint should prevent this for platform rows,
    -- but defend anyway — we key cooldown / anti-repetition on
    -- template_id and have nothing to do here without one.
    return jsonb_build_object('ok', false, 'error', 'not_platform');
  end if;

  if v_challenge.cadence not in ('daily', 'weekly', 'monthly') then
    -- 'one_time' is trainer-only by constraint, so this branch
    -- is unreachable, but fail loudly if a future migration
    -- changes that.
    return jsonb_build_object('ok', false, 'error', 'not_platform');
  end if;

  -- 2. Already enrolled / already picked --------------------------
  -- The challenge_participants unique (challenge_id, user_id) treats
  -- completed and abandoned rows as still occupying the slot — so a
  -- user who completed or gave up on this exact challenges.id can't
  -- re-pick it (the INSERT at step 7 would 23505 and surface as
  -- 'unknown'). Catch both cases here for a clean error.
  declare
    v_existing_status text;
  begin
    select status into v_existing_status
    from public.challenge_participants
    where user_id = v_user_id
      and challenge_id = p_challenge_id;

    if found then
      if v_existing_status = 'active' then
        return jsonb_build_object('ok', false, 'error', 'already_active');
      else
        -- 'completed' or 'abandoned' — the slot is taken historically.
        -- Anti-repetition + cooldown make this rare in practice (the
        -- discovery pool wouldn't surface this challenge), but a stale
        -- client could still post it.
        return jsonb_build_object('ok', false, 'error', 'already_picked');
      end if;
    end if;
  end;

  -- 3. Lock the per-cadence state row early to serialize concurrent
  --    picks. UPSERT pattern: insert if missing, then re-select FOR UPDATE.
  insert into public.user_challenge_state (user_id, cadence, period_start)
  values (
    v_user_id,
    v_challenge.cadence,
    (date_trunc('day', (now() at time zone 'Europe/Sofia') - interval '4 hours'))::date
  )
  on conflict (user_id, cadence) do nothing;

  select id, completions_this_period, recent_template_ids
  into v_state
  from public.user_challenge_state
  where user_id = v_user_id and cadence = v_challenge.cadence
  for update;

  -- 4. Cooldown for this template ------------------------------
  select picked_at into v_cooldown_picked_at
  from public.challenge_pick_cooldowns
  where user_id = v_user_id and template_id = v_challenge.template_id;

  if v_cooldown_picked_at is not null
     and v_cooldown_picked_at > now() - interval '1 hour' then
    return jsonb_build_object(
      'ok', false,
      'error', 'cooldown',
      -- Return the timestamptz directly. PostgREST serializes timestamptz
      -- as ISO-8601 UTC. Avoid to_char() — it formats in the session
      -- TimeZone, which we can't assume is UTC; concatenating "Z" onto
      -- a non-UTC formatted value would silently shift the displayed
      -- time on the client.
      'available_at', v_cooldown_picked_at + interval '1 hour'
    );
  end if;

  -- 5. Active limit per cadence (platform challenges only) -----
  v_max_active := case v_challenge.cadence
    when 'daily'   then 1
    when 'weekly'  then 3
    when 'monthly' then 5
  end;

  select count(*) into v_active_count
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  where cp.user_id = v_user_id
    and cp.status = 'active'
    and c.source = 'platform'
    and c.cadence = v_challenge.cadence;

  if v_active_count >= v_max_active then
    return jsonb_build_object('ok', false, 'error', 'limit_reached');
  end if;

  -- 6. Completion limit per period -----------------------------
  v_max_completions := case v_challenge.cadence
    when 'daily'   then 1
    when 'weekly'  then 5
    when 'monthly' then 10
  end;

  if v_state.completions_this_period >= v_max_completions then
    return jsonb_build_object('ok', false, 'error', 'limit_reached');
  end if;

  -- 7. Insert participant --------------------------------------
  insert into public.challenge_participants (
    challenge_id, user_id, current_progress, longest_streak,
    target_value, status, source
  )
  select
    p_challenge_id, v_user_id, 0, 0,
    target_value, 'active', 'discovery'
  from public.challenges where id = p_challenge_id
  returning id into v_participant_id;

  -- 8. Update per-cadence state: last_pick_at + recent_template_ids (cap 10).
  --    Dedupe an earlier occurrence of the same template, keep the
  --    other 9 most recent (in original order), then prepend the new
  --    template at position 0. Without the explicit "limit 9 of the
  --    *kept* set, then prepend", a dedupe at position 1-9 of a full
  --    array would still drop the oldest entry instead of the duplicate.
  update public.user_challenge_state s
  set last_pick_at = now(),
      recent_template_ids = array_prepend(
        v_challenge.template_id,
        coalesce(
          (
            select array_agg(prev_t order by prev_ord)
            from (
              select prev_t, prev_ord
              from unnest(coalesce(s.recent_template_ids, '{}'::uuid[]))
                with ordinality as u(prev_t, prev_ord)
              where prev_t <> v_challenge.template_id
              order by prev_ord
              limit 9
            ) kept
          ),
          '{}'::uuid[]
        )
      )
  where s.id = v_state.id;

  -- 9. Upsert per-template cooldown ----------------------------
  insert into public.challenge_pick_cooldowns (user_id, template_id, picked_at)
  values (v_user_id, v_challenge.template_id, now())
  on conflict (user_id, template_id) do update
    set picked_at = excluded.picked_at;

  return jsonb_build_object('ok', true, 'participant_id', v_participant_id);
end;
$$;

-- Allow authenticated users to call the RPC. The function itself
-- enforces auth.uid() identity, so the role grant is just the
-- supabase plumbing.
grant execute on function public.fn_pick_challenge(uuid) to authenticated;
