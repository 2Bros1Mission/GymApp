# Issue #28 — Gamification: Challenges Between Clients

## Status: Design In Progress

Last updated: 2025-05-17

---

## Summary

Trainers create competitive challenges for their connected clients. Clients compete on leaderboards with real-time updates. Challenges reward winners with badges, discount codes, battle pass tiers, and custom rewards.

---

## Decisions Made

### Scope

| Decision | Choice |
|----------|--------|
| Who creates challenges | **Trainers only** |
| Challenge types (v1) | **Workout frequency**, **Streak**, **Custom target** (no total volume) |
| Progress tracking | **Auto-tracked** from `workout_logs` for frequency/streak. Manual for custom. |
| Enrollment model | **Trainer selects initial participants** + any other connected client of that trainer can discover and join |
| Recurrence | **One-time only** (fixed start/end dates). Trainer creates a new challenge when old one ends. |
| Navigation | **New dedicated tab** (5th tab: Challenges) |
| Celebration | **Full celebration screen** with confetti/animation, winner highlight, final standings |
| Leaderboard updates | **Real-time** via Supabase Realtime (like chat) |

### Architecture: Approach A — Computed Leaderboard

Progress is **computed on-the-fly** by querying `workout_logs` when the leaderboard is viewed. No cached progress column, no triggers updating scores, no background jobs.

**Why this approach:**
- Progress is always accurate — no sync issues
- No triggers or background jobs needed
- Single source of truth (`workout_logs`)
- At our scale (10-30 clients per trainer), computing on-read takes milliseconds
- Custom challenges use a simple `progress` column on `challenge_participants` since they're manual
- For Realtime: a lightweight trigger on `workout_logs` broadcasts to a channel so leaderboard screens can refresh

### Reward System (Still Being Designed)

The user wants **all four** reward types:

1. **Badges / Trophies** — Digital badges displayed on the client's profile (e.g., "January Challenge Winner"). Bragging rights.
2. **Discount Codes** — App generates unique codes stored in the database. Integration with a payment provider (Stripe, etc.) deferred to later. Exact implementation TBD (generate-and-store vs. display-only vs. custom text).
3. **Battle Pass / Tier Rewards** — Like a game battle pass: reach milestones during the challenge to unlock rewards at each tier (e.g., tier 1: badge, tier 2: discount, tier 3: free session).
4. **Custom Reward Text** — Trainer writes whatever reward they want as free text. App displays it, fulfillment is between trainer and client.

**Open question:** How discount codes connect to a payment system. Options discussed but not finalized:
- Design code generation now, integrate with Stripe later
- Full Stripe integration now (significant scope)
- Just use custom text for now (trainer manages codes externally)

---

## Preliminary Data Model (Draft)

Based on decisions so far. Subject to change during detailed design.

### `challenges` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `creator_id` | uuid | FK -> profiles (trainer) |
| `title` | text | NOT NULL |
| `title_bg` | text | Bulgarian translation |
| `description` | text | nullable |
| `description_bg` | text | Bulgarian translation |
| `challenge_type` | text | `frequency`, `streak`, `custom` |
| `target_value` | numeric | e.g., "20 workouts" or "14-day streak" |
| `start_date` | date | NOT NULL |
| `end_date` | date | NOT NULL |
| `status` | text | `upcoming`, `active`, `completed` |
| `reward_type` | text | `badge`, `discount`, `battle_pass`, `custom`, nullable |
| `reward_description` | text | Free-text reward details |
| `reward_tiers` | jsonb | Battle pass tiers (nullable) |
| `created_at` | timestamptz | |

### `challenge_participants` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `challenge_id` | uuid | FK -> challenges |
| `user_id` | uuid | FK -> profiles |
| `joined_at` | timestamptz | |
| `progress` | numeric | Only used for custom challenges (manual update) |
| `rank` | integer | nullable, set on challenge completion |
| `invited_by_trainer` | boolean | true if trainer selected, false if self-joined |

### `challenge_rewards` table (earned rewards)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `challenge_id` | uuid | FK -> challenges |
| `user_id` | uuid | FK -> profiles |
| `reward_type` | text | `badge`, `discount_code`, `tier_reward`, `custom` |
| `badge_name` | text | nullable |
| `discount_code` | text | nullable (auto-generated unique code) |
| `tier_level` | integer | nullable (battle pass tier reached) |
| `description` | text | What the reward is |
| `claimed_at` | timestamptz | nullable |
| `created_at` | timestamptz | |

---

## Screens (Planned)

| Screen | Role | Purpose |
|--------|------|---------|
| Challenges tab (list) | Both | Browse active, upcoming, and completed challenges |
| Challenge detail | Both | Leaderboard, progress, time remaining, reward info |
| Create challenge | Trainer | Form: type, title, dates, participants, rewards |
| Celebration modal | Both | Shown when challenge ends: winner, standings, confetti |
| Profile badges section | Both | Display earned badges/trophies |

---

## Service Layer

New file: `src/lib/challengeService.ts`

Expected functions (draft):
- `createChallenge()` — trainer creates a challenge with participants
- `joinChallenge()` — client self-joins a visible challenge
- `getChallenges()` — list challenges (active/upcoming/completed)
- `getChallengeDetail()` — single challenge with participant list
- `getChallengeLeaderboard()` — computed rankings from workout_logs (RPC)
- `updateCustomProgress()` — trainer updates custom challenge progress for a participant
- `getEarnedRewards()` — user's badges and rewards across all challenges
- `completeChallenge()` — finalize challenge, assign ranks and rewards (RPC)

---

## RLS Strategy (Draft)

- Trainers can CRUD challenges they created
- Clients can READ challenges from their connected trainer
- Clients can INSERT themselves as participants (join)
- Leaderboard readable by all participants
- Rewards readable by the earning user
- Custom progress updatable only by the challenge creator (trainer)

---

## Open Items (To Resolve Next Session)

1. **Discount code implementation** — generate-and-store vs. Stripe integration vs. custom text
2. **Battle pass tier structure** — how many tiers, what milestones trigger each tier
3. **Badge design** — what badges look like, where they display on profile
4. **Realtime implementation** — trigger on workout_logs to broadcast to challenge channel
5. **Celebration screen design** — animations, confetti library, layout
6. **Tab bar design** — icon choice for 5th tab, layout for both client/trainer views
7. **Notifications** — which challenge events trigger notifications (joined, milestone, ended, standings change)
8. **i18n** — all BG + EN strings for challenge UI

---

## Technical Notes

- **Follows Approach A (Computed Leaderboard):** No cached scores. `get_challenge_leaderboard` RPC computes rankings from `workout_logs` on each call.
- **Realtime:** Subscribe to a challenge-specific channel. A trigger on `workout_logs` INSERT broadcasts when a participant completes a workout.
- **Consistent with project patterns:** Service layer (ADR-006), RPC for multi-table writes (ADR-005), RLS on all tables (ADR-004), React Context for state (ADR-003).
- **Migration naming:** `20260XXX120000_challenges.sql` (14-digit timestamp)
