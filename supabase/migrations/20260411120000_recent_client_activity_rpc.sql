create or replace function get_recent_client_activity(p_trainer_id uuid, p_limit int default 30)
returns table (
  id uuid,
  user_id uuid,
  workout_name text,
  date date,
  duration_seconds int,
  client_name text
)
language sql
stable
security invoker
as $$
  select
    wl.id,
    wl.user_id,
    wl.workout_name,
    wl.date,
    wl.duration_seconds,
    p.name as client_name
  from workout_logs wl
  join trainer_clients tc on tc.client_id = wl.user_id
  join profiles p on p.id = wl.user_id
  where tc.trainer_id = p_trainer_id
    and tc.status = 'active'
    and wl.completed = true
  order by wl.date desc
  limit p_limit;
$$;
