-- ============================================================
-- Issue #137 follow-up #1: fn_get_user_rank_info RPC
--
-- Atomic 1-round-trip read for the My Rank widget. Replaces the
-- previous 2-statement client-side composition in
-- leaderboardService.getUserRank, which was vulnerable to read-skew
-- across the 30-min refresh_leaderboard_snapshot() boundary
-- (TRUNCATE + INSERT is itself atomic via ACCESS EXCLUSIVE, but the
-- 2 client HTTP calls are 2 separate transactions and can land on
-- opposite sides of the refresh — manifesting as "rank 5 of 100"
-- with neighbors at ranks 30-34).
--
-- Two semantic upgrades vs. the client-side version:
--
--  (a) Off-board rank is computed instead of returning NULL.
--      Documentation/Gamification.md §372/§383 prescribes
--      "User's own rank — Always visible (even if outside top 100)"
--      via COUNT(*) FROM profiles WHERE leaderboard_points > $mine.
--      Index idx_profiles_leaderboard_points (#129) covers it.
--
--  (b) total_participants is the count of profiles with
--      leaderboard_points > 0, NOT the snapshot size (which is
--      hard-capped at 100 by refresh_leaderboard_snapshot's
--      LIMIT 100 — see 20260606120000_challenges_scheduled_fns.sql).
--      Showing "rank 47 of 100" to a user in a 50,000-participant
--      system is off by three orders of magnitude.
--
-- Tiebreaker matches refresh_leaderboard_snapshot exactly:
-- leaderboard_points DESC, leaderboard_points_updated_at ASC,
-- name ASC, id ASC. A user tied at $mine but who reached that
-- score earlier ranks above us.
-- ============================================================

create or replace function public.fn_get_user_rank_info(
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_own record;
  v_me_profile record;
  v_higher_count integer;
  v_total integer;
  v_neighbors jsonb;
begin
  if v_caller_id is null then
    return jsonb_build_object(
      'rank', null,
      'points', 0,
      'total_participants', 0,
      'neighbors', '[]'::jsonb,
      'refreshed_at', null
    );
  end if;

  -- Total participants — count of profiles with non-zero points.
  -- Matches the filter used in refresh_leaderboard_snapshot, so the
  -- on-board denominator and off-board denominator agree.
  select count(*)::integer into v_total
  from public.profiles
  where leaderboard_points > 0;

  -- Own snapshot row, if any. Single statement = atomic against the
  -- TRUNCATE+INSERT in refresh_leaderboard_snapshot.
  select rank, user_id, user_name, points, refreshed_at
    into v_own
  from public.leaderboard_snapshot
  where user_id = p_user_id;

  if found then
    -- On-board: gather the rank-2..rank+2 window with SQL-side
    -- self-exclusion (spec line 16: "Single query, no JS-side
    -- filtering"). Pull at most 4 neighbours and order ascending.
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'rank', n.rank,
        'user_id', n.user_id,
        'user_name', n.user_name,
        'points', n.points,
        'refreshed_at', n.refreshed_at
      ) order by n.rank
    ), '[]'::jsonb)
      into v_neighbors
    from public.leaderboard_snapshot n
    where n.rank between greatest(1, v_own.rank - 2) and v_own.rank + 2
      and n.user_id <> p_user_id;

    return jsonb_build_object(
      'rank', v_own.rank,
      'points', v_own.points,
      'total_participants', v_total,
      'neighbors', v_neighbors,
      'refreshed_at', v_own.refreshed_at
    );
  end if;

  -- Off-board: rank via live COUNT over profiles, points via
  -- profiles.leaderboard_points. Tiebreaker matches the snapshot
  -- ordering so a user tied at $mine but who reached that score
  -- earlier outranks us — exactly the same rule the snapshot's
  -- row_number() uses.
  select id, name, leaderboard_points, leaderboard_points_updated_at
    into v_me_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    -- No auth user implies no profile (handle_new_user trigger
    -- guarantees the inverse). Reaching here means manual deletion
    -- or a bypassed trigger — log via the caller's console.warn
    -- path. Return shape consistent with off-board zero-point.
    return jsonb_build_object(
      'rank', null,
      'points', 0,
      'total_participants', v_total,
      'neighbors', '[]'::jsonb,
      'refreshed_at', null,
      'profile_missing', true
    );
  end if;

  select count(*)::integer + 1 into v_higher_count
  from public.profiles p
  where p.leaderboard_points > v_me_profile.leaderboard_points
     or (p.leaderboard_points = v_me_profile.leaderboard_points
         and (p.leaderboard_points_updated_at, p.name, p.id)
             < (v_me_profile.leaderboard_points_updated_at,
                v_me_profile.name, v_me_profile.id));

  return jsonb_build_object(
    'rank', v_higher_count,
    'points', v_me_profile.leaderboard_points,
    'total_participants', v_total,
    'neighbors', '[]'::jsonb,
    'refreshed_at', null
  );
end;
$$;

-- Lock down the function surface. The auth.uid() guard above
-- short-circuits to a zero shape for anon callers, but we revoke
-- PUBLIC explicitly so a future GRANT TO public on schema cannot
-- accidentally expose this RPC.
revoke execute on function public.fn_get_user_rank_info(uuid) from public;
grant execute on function public.fn_get_user_rank_info(uuid) to authenticated;
