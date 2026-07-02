-- Issue #148 — add category column to workout_logs for category-filtered challenges (#133, #136).
-- Idempotent: safe to re-run on partially applied state.
--
-- Backfill scope: DELIBERATELY NONE. Historical workout_logs rows keep
-- category IS NULL forever — the partial index below (`where category
-- is not null`) excludes them, and the challenge progress trigger
-- (post-#148 wire-up) uses `is distinct from` semantics such that a
-- NULL workout category never matches a categorized challenge. There
-- is no reliable workout_id -> category mapping in the codebase today
-- (the workout catalog lives in-app, not in Postgres), so any backfill
-- would either guess wrong or duplicate that mapping in SQL. Callers
-- of challenge leaderboards that need historical category-bucketed
-- aggregates must supplement with an app-layer backfill pass keyed on
-- the workout_id at the point where the workout catalog is known.

do $$ begin
  alter table public.workout_logs add column category text;
exception
  when duplicate_column then null;
end $$;

do $$ begin
  alter table public.workout_logs
    add constraint workout_logs_category_check
    check (category is null or category in (
      'strength', 'cardio', 'flexibility', 'hiit', 'sports', 'other'
    ));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_workout_logs_category
  on public.workout_logs (user_id, category)
  where category is not null;
