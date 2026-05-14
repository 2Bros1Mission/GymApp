-- Fix #82: Trainer/client names showing as '?' and '--' in connection cards
--
-- Root cause: RLS policies on profiles table were too restrictive.
-- 1. Trainers could only see their own profile (no policy for connected clients)
-- 2. Clients had no policy to see their trainer's profile at all
--
-- The Supabase foreign-key join in getTrainerClients/getPendingRequests/getClientTrainer
-- silently returns null when RLS blocks the joined row, causing the UI to show '--'.

-- Drop policies if they already exist (from original migration 003 or manual application)
drop policy if exists "Trainers can view client profiles" on public.profiles;
drop policy if exists "Clients can view trainer profiles" on public.profiles;

-- Trainers can see profiles of their connected clients (active + pending)
create policy "Trainers can view client profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_clients.trainer_id = auth.uid()
        and trainer_clients.client_id = profiles.id
        and trainer_clients.status in ('active', 'pending')
    )
  );

-- Clients can see their connected trainer's profile
create policy "Clients can view trainer profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.trainer_clients
      where trainer_clients.client_id = auth.uid()
        and trainer_clients.trainer_id = profiles.id
        and trainer_clients.status in ('active', 'pending', 'rejected')
    )
  );
