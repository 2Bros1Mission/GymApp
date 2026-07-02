-- Issue #148 follow-up: harden the workout_logs.category column landed in
-- 20260628150000_workout_categories.sql. Bundles three fixes surfaced during
-- PR #164 review:
--
--   (1) [F5] BEFORE INSERT/UPDATE trigger that lowercases and trims
--       category. Any type-bypassing caller (i18n label, raw REST client,
--       admin console) that sends 'Strength' or 'strength ' now normalizes
--       to 'strength' at the boundary instead of raising a cryptic 23514
--       CHECK violation. TS callers going through the WorkoutCategory
--       union are unaffected — the trigger's transform is a no-op on
--       already-lowercase input.
--
--   (2) [F6] Second partial index on (category) WHERE category IS NOT NULL.
--       The base index (user_id, category) WHERE category IS NOT NULL from
--       the parent migration covers per-user filters ("my strength
--       workouts"). This index covers cross-user leaderboard-style scans
--       ("count strength workouts across all participants") that #133/#136
--       leaderboards will issue. Keeping both is cheap; the parent index is
--       kept for the per-user query shape.
--
--   (3) [F3] RLS UPDATE policy on workout_logs — add WITH CHECK to prevent
--       an authenticated owner from re-parenting a row via .update({
--       user_id: '<other>' }). The base_schema policy at line 127-129 only
--       has USING, which validates pre-update visibility but does NOT
--       re-validate the post-update row. Pre-existing gap in base_schema,
--       but this PR makes direct UPDATE the sanctioned write path for
--       category (save_workout does not accept p_category yet — see the
--       parent migration's follow-up companion), which elevates the risk.
--       Policies cannot be ALTERed to add WITH CHECK; drop + recreate.
--
-- Idempotency: matches the parent migration's do $$ ... exception idiom
-- where needed; policy drop uses IF EXISTS.

-- ─── (1) F5: lowercase + trim trigger ──────────────────────────────────

create or replace function public.fn_normalize_workout_log_category()
returns trigger
language plpgsql
-- No SECURITY DEFINER: this trigger fires under the caller's identity;
-- there is no privileged state to touch, only the incoming NEW row.
set search_path = public, pg_temp
as $$
begin
  if new.category is not null then
    new.category := lower(btrim(new.category));
    -- Empty string after trim → NULL, so downstream CHECK ('is null or
    -- in (...)') accepts it as "no category" instead of failing with 23514.
    if new.category = '' then
      new.category := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_workout_log_category on public.workout_logs;

create trigger trg_normalize_workout_log_category
  before insert or update of category on public.workout_logs
  for each row
  execute function public.fn_normalize_workout_log_category();

-- ─── (2) F6: cross-user category index ─────────────────────────────────

create index if not exists idx_workout_logs_category_only
  on public.workout_logs (category)
  where category is not null;

-- ─── (3) F3: RLS UPDATE policy — add WITH CHECK ────────────────────────
--
-- PostgreSQL doesn't support ALTER POLICY ... ADD WITH CHECK, so this is
-- a drop + recreate. The policy name matches the base_schema definition
-- verbatim to keep the pg_policies snapshot stable.

do $$ begin
  if exists (
    select 1 from pg_policies
    where policyname = 'Users can update own workout logs'
      and tablename  = 'workout_logs'
  ) then
    drop policy "Users can update own workout logs" on public.workout_logs;
  end if;
end $$;

create policy "Users can update own workout logs"
  on public.workout_logs for update
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
