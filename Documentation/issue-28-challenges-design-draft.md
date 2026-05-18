# Issue #28 — Gamification: Challenges Between Clients

## Status: Design Approved — Ready for Implementation Planning

Last updated: 2025-05-18

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

### Reward System

Four reward types, all available in v1:

1. **Badges / Trophies** — Digital badges displayed on the client's profile (e.g., "January Challenge Winner"). Bragging rights.
2. **Discount Codes** — App generates unique codes and stores them in the database. Trainer can copy the code and use it however they want (paste into Stripe, share manually, apply to cash payments, etc.). No payment provider integration in v1. See [Discount Code Roadmap](#discount-code-roadmap) below for the future integration plan.
3. **Battle Pass / Tier Rewards** — Like a game battle pass: reach milestones during the challenge to unlock rewards at each tier (e.g., tier 1: badge, tier 2: discount, tier 3: free session). Trainer defines tiers when creating the challenge.
4. **Custom Reward Text** — Trainer writes whatever reward they want as free text. App displays it, fulfillment is between trainer and client.

---

## Discount Code Roadmap

### What We Build in v1 (Now)

The app generates unique discount codes internally and stores them in the `challenge_rewards` table. No external payment provider is involved.

**How it works:**
1. Trainer creates a challenge and sets the reward type to "discount" (or includes a discount tier in a battle pass)
2. Trainer enters the discount details: percentage or fixed amount, description (e.g., "50% off next month's coaching")
3. When the challenge ends, the `complete_challenge` RPC generates a unique code for each winner/tier earner
4. Code format: `GYM-XXXX-XXXX` (12 chars, alphanumeric, collision-safe via `gen_random_uuid()` truncation)
5. The code is stored in `challenge_rewards.discount_code` and displayed to the winning client
6. Client can view their earned codes on their profile (rewards section)
7. Trainer can view all issued codes on the challenge results screen
8. **Fulfillment is manual** — the trainer sees the code, verifies it when the client claims the discount, and applies it however they handle payments (cash, bank transfer, Stripe dashboard, etc.)

**Database columns (v1):**
```
challenge_rewards.discount_code    -- the generated code (e.g., 'GYM-A3F9-K2M7')
challenge_rewards.discount_value   -- numeric value (e.g., 50)
challenge_rewards.discount_type    -- 'percentage' or 'fixed_amount'
challenge_rewards.redeemed         -- boolean, default false
challenge_rewards.redeemed_at      -- timestamptz, nullable
```

The trainer manually marks a code as redeemed (via a button in the app) when the client uses it.

### What We Build in v2 (Future — Stripe Integration)

When the app adds a payment system (likely Stripe), discount codes become real coupons:

**Prerequisites:**
- Stripe account connected per trainer (Stripe Connect)
- Subscription or one-time payment flow in the app
- Supabase Edge Function or webhook handler for Stripe events

**Integration steps:**
1. **Stripe Coupon API** — when `complete_challenge` RPC generates a code, it also calls `stripe.coupons.create()` via an Edge Function to create a real Stripe coupon with the same code
2. **Stripe Promotion Code** — wraps the coupon in a promotion code that the client can enter at checkout
3. **Auto-apply at checkout** — when a client with an earned discount starts a payment, the app checks for unredeemed codes and offers to apply them
4. **Webhook confirmation** — Stripe webhook fires when a coupon is used, Edge Function updates `challenge_rewards.redeemed = true` and `redeemed_at = now()`
5. **Expiry** — codes get an expiration date (set by trainer or defaulting to 90 days)

**Schema additions for v2:**
```
challenge_rewards.stripe_coupon_id     -- Stripe coupon ID
challenge_rewards.stripe_promo_code_id -- Stripe promotion code ID
challenge_rewards.expires_at           -- timestamptz
```

**Migration path from v1 to v2:**
- Existing codes in the DB get migrated to Stripe coupons via a one-time script
- The `discount_code` column remains as the human-readable code
- New Stripe-specific columns are added (nullable, backwards compatible)
- The manual "mark as redeemed" button stays as a fallback for trainers not on Stripe

### What We Build in v3 (Future — Multi-Provider)

If the app supports multiple payment providers beyond Stripe:
- Abstract the coupon creation behind a `PaymentProvider` interface
- Each provider adapter implements `createCoupon()`, `validateCoupon()`, `onCouponUsed()`
- The `challenge_rewards` table adds a `provider` column (`stripe`, `manual`, etc.)
- Trainer selects their payment provider in settings

This is far out — only relevant if the app expands beyond Stripe.

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
| `discount_code` | text | nullable (auto-generated, format: `GYM-XXXX-XXXX`) |
| `discount_value` | numeric | nullable (e.g., 50) |
| `discount_type` | text | nullable, `percentage` or `fixed_amount` |
| `redeemed` | boolean | default false |
| `redeemed_at` | timestamptz | nullable |
| `tier_level` | integer | nullable (battle pass tier reached) |
| `description` | text | What the reward is |
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
- `completeChallenge()` — finalize challenge, assign ranks, generate discount codes, assign rewards (RPC)
- `redeemDiscountCode()` — trainer marks a discount code as redeemed
- `getIssuedDiscountCodes()` — trainer views all codes issued for a challenge

---

## RLS Strategy (Draft)

- Trainers can CRUD challenges they created
- Clients can READ challenges from their connected trainer
- Clients can INSERT themselves as participants (join)
- Leaderboard readable by all participants
- Rewards readable by the earning user
- Custom progress updatable only by the challenge creator (trainer)

---

## Open Items (To Resolve During Implementation)

1. **Battle pass tier structure** — how many tiers, what milestones trigger each tier
2. **Badge design** — what badges look like, where they display on profile
3. **Realtime implementation** — trigger on workout_logs to broadcast to challenge channel
4. **Celebration screen design** — animations, confetti library, layout
5. **Tab bar design** — icon choice for 5th tab, layout for both client/trainer views
6. **Notifications** — which challenge events trigger notifications (joined, milestone, ended, standings change)
7. **i18n** — all BG + EN strings for challenge UI

---

## Technical Notes

- **Follows Approach A (Computed Leaderboard):** No cached scores. `get_challenge_leaderboard` RPC computes rankings from `workout_logs` on each call.
- **Realtime:** Subscribe to a challenge-specific channel. A trigger on `workout_logs` INSERT broadcasts when a participant completes a workout.
- **Consistent with project patterns:** Service layer (ADR-006), RPC for multi-table writes (ADR-005), RLS on all tables (ADR-004), React Context for state (ADR-003).
- **Migration naming:** `20260XXX120000_challenges.sql` (14-digit timestamp)
