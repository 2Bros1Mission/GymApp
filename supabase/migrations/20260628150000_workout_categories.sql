-- Issue #148 — add category column to workout_logs for category-filtered challenges (#133, #136).
-- Idempotent: safe to re-run on partially applied state.

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
