-- ============================================================
-- Issue #136: Per-template pick cooldowns (Discovery Service)
--
-- The original schema (#128) tracked one `last_pick_at` per
-- (user, cadence) on user_challenge_state, which only supports
-- a per-cadence cooldown. The product spec calls for per-slot
-- cooldown: when a user picks one challenge from the daily pool,
-- only that slot blurs for 1h; the other 2 daily slots stay
-- pickable.
--
-- This migration adds a small companion table that tracks the
-- last pick time per (user, template_id). Trainer challenges
-- never enter discovery (source='platform' filter), so they
-- have no entries here.
--
-- Design notes:
-- * Keyed on template_id, not challenge_id — the spec's anti-
--   repetition (E3) and difficulty-variant pool rotation both
--   key on templates. Cooldown follows the same key.
-- * Upsert on every pick. We don't bother purging old rows —
--   a row per (user × template) is bounded by the catalog size,
--   which is tiny.
-- * RLS: own rows only. Writes happen via fn_pick_challenge
--   (security definer), but a direct policy is included so the
--   service layer can read its own cooldowns.
--
-- Depends on: #128 (challenge_templates).
-- Blocks: nothing else; consumed by fn_pick_challenge (#136).
-- ============================================================

create table if not exists public.challenge_pick_cooldowns (
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.challenge_templates(id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

alter table public.challenge_pick_cooldowns enable row level security;

-- Discovery filters by user + recent picks; the PK already covers
-- (user_id, template_id), but a partial index on user_id alone
-- would be redundant since the PK is left-anchored on user_id.

-- RLS: own rows only.
do $$ begin
if not exists (
  select 1 from pg_policies
  where policyname = 'Users read own pick cooldowns' and tablename = 'challenge_pick_cooldowns'
) then
  create policy "Users read own pick cooldowns"
    on public.challenge_pick_cooldowns for select
    to authenticated
    using (user_id = auth.uid());
end if;
end $$;

-- No INSERT/UPDATE/DELETE policies for end users — fn_pick_challenge
-- (security definer) is the only writer. Without a write policy,
-- direct client writes are rejected, which matches the design
-- (the RPC is the single source of truth for a pick). Explicit
-- revoke documents intent and defends against `grant all` migrations
-- that might come later.
revoke insert, update, delete on table public.challenge_pick_cooldowns from authenticated;
