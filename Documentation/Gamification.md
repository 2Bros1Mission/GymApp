# Gamification: Challenges & Leaderboard

## Status: Design In Progress

Last updated: 2026-05-20

---

## Summary

A challenge system with two sources: **platform challenges** (pre-designed, rotating daily/weekly/monthly) and **trainer challenges** (assembled from pre-defined blocks, assigned to specific clients). A single global leaderboard tracks accumulated points from platform challenges only.

---

## Decisions Made

### Topic 1: Scope & Architecture

| Decision | Choice |
|----------|--------|
| Challenge sources | **Platform** (pre-designed, rotating) + **Trainer** (assembled from blocks, assigned) |
| Who creates challenges | **Us (platform)** and **Trainers** — never clients |
| Client enrollment (platform) | **Discovery mechanic** — clients pick from a rotating pool |
| Client enrollment (trainer) | **Auto-assigned** by trainer, client can give up (no reject prompt) |
| Leaderboard | **Single global leaderboard**, all users combined, monthly reset |
| Leaderboard points | **Platform challenges only** — trainer challenges do NOT give leaderboard points |
| Trainer challenge rewards | **None in v1** — no points, no badges, no rewards. May be discussed in v2. |
| Overlapping challenges | Allowed — same workout log counts toward multiple challenges simultaneously |
| Navigation | **New dedicated tab** (Challenges) |

### Topic 2: Challenge Types

Three types, all available in v1:

#### Type 1 — Workout Frequency

- "Complete X workouts in the period" (any workout OR category-specific)
- Auto-tracked from `workout_logs`
- Requires workout categories (see Topic 25)
- Examples: "Complete 3 workouts", "Complete 2 leg workouts this week"

#### Type 2 — Streak

- "Work out X consecutive days"
- **Day boundary:** 4:00 AM to 4:00 AM Bulgarian time (EET/EEST)
- **Streak reset:** If broken, progress resets to 0 immediately at 4AM. User can restart within the same challenge period.
- **No backfill** — if they miss a day, it resets. No retroactive logging.
- **Weekly/monthly only** — no daily streak challenges
- Auto-tracked from `workout_logs`
- Example: "Maintain a 5-day workout streak this month"

#### Type 3 — Custom Target

- Two sub-modes:
  - **Auto-tracked:** Challenge measures something from the app (e.g., "Complete 3 workouts") — app fills progress automatically, client cannot edit
  - **Self-reported:** Challenge measures something external (e.g., "Drink 2L water") — client reports via counter ("I did it") or numeric value input
- **Points** — set per challenge at creation time, same as all types (see Topic 22)
- Trainer does NOT fill progress — client always does
- Trainer doesn't create free-form custom challenges — assembles from pre-defined blocks we provide

### Progress & Period Reset Rules

_See Topic 20 for full details. Summary:_

- **No expiry** — challenges persist until completed or user gives up
- **Progress resets to 0** on each new period (daily 4AM, weekly Monday 4AM, monthly 1st 4AM)
- **No backfill** — missed activity is missed, no retroactive logging for any challenge type
- **Hard freeze** when completion limit is reached — no further progress tracked until next reset

---

## Topics To Discuss (First Group — from Georgi's design)

### Topic 3: Auto-tracked Progress (DECIDED)

**Approach: Hybrid — cached progress, updated by triggers, leaderboard on a schedule.**

#### Progress Tracking

| Mechanism | How |
|-----------|-----|
| `current_progress` column on `challenge_participants` | Cached value, updated by a Postgres trigger on `workout_logs` INSERT |
| Trigger scope | Fires for the user who logged the workout; updates only their active challenges (3-5 rows typical) |
| Frequency calculation | Simple COUNT of `workout_logs` rows in the challenge period (optionally filtered by category) |
| Streak calculation | Postgres function using gaps-and-islands on `gym_date`, called by the trigger |

#### 4AM Day Boundary

A **stored generated column** on `workout_logs`:

```sql
ALTER TABLE workout_logs ADD COLUMN gym_date date
  GENERATED ALWAYS AS (
    (date_trunc('day', created_at AT TIME ZONE 'Europe/Sofia' - INTERVAL '4 hours'))::date
  ) STORED;

CREATE INDEX idx_workout_logs_gym_date ON workout_logs(user_id, gym_date);
```

- Computed once on INSERT, never recalculated
- Streak queries use `gym_date` directly — no runtime timezone math
- Indexed for fast lookups

#### Leaderboard

| Decision | Choice |
|----------|--------|
| What it shows | Top 100 users by points + the current user's own rank |
| Storage | `leaderboard_snapshot` table (top 100 cached) |
| Refresh cadence | Every 30–60 minutes via pg_cron or scheduled Edge Function |
| Points source | `profiles.leaderboard_points` column (updated on challenge completion) |
| User's own rank | On-demand query: `SELECT COUNT(*) FROM profiles WHERE leaderboard_points > $my_points` |
| Monthly reset | Scheduled function zeros all `leaderboard_points`, optionally archives to `leaderboard_history` |

#### Why This Works at Scale (10k+ users)

- **Write cost per workout:** Trigger updates 3-5 rows in `challenge_participants`. Cheap.
- **Read cost for challenge detail:** Pre-computed `current_progress`. O(1) per participant.
- **Read cost for leaderboard:** Static snapshot table. No computation on read.
- **Streak cost:** Computed once per workout log via trigger, not on every screen open.

### Topic 4: Enrollment Model & Visibility (DECIDED)

**No self-join. No enrollment mechanic. Strict visibility boundaries.**

| Decision | Choice |
|----------|--------|
| Platform challenges | Available to ALL users (including trainers). User picks from discovery pool. No joining — you pick it, it's active. |
| Trainer challenges | Trainer assigns to specific client(s). Auto-assigned, client can reject/cancel. No opt-in from other clients. |
| Trainers as users | Trainers can complete platform challenges and earn leaderboard points like any other user. |
| Self-join | **Does not exist.** Removed from design. |
| Challenge history | **No completed challenges tab.** User sees only in-progress challenges + discovery pool. |

#### Visibility Rules

| Actor | Can see |
|-------|---------|
| User X | Their own in-progress challenges (platform + trainer-assigned) |
| User X | Discovery pool (available platform challenges to pick from) |
| User X | Their own points and rank (even if not in top 100) |
| User X | Top 100 leaderboard (names + points) |
| User X | **Cannot** see User Z's challenges, progress, or points (unless Z is in top 100) |
| User X | **Cannot** enroll in challenges assigned to other users |
| Trainer Y | Challenges created by them, assigned to their own clients |
| Trainer Y | Their own platform challenges (as a user) |
| Trainer Y | **Cannot** see client's platform challenges (only trainer-assigned ones) |
| Trainer Y | **Cannot** see challenges created by other trainers |
| Trainer Y | **Cannot** see challenges for users who are not their clients |

#### Leaderboard Identity

- Shows the user's `name` from `profiles` (whatever they entered — no real name requirement)
- No anonymization — names are public on the top 100
- Trainers appear on the leaderboard like any other user

### Topic 5: Real-time Updates (DECIDED)

**No real-time / Supabase Realtime for the challenge system. Everything is pull-based.**

| Aspect | Approach |
|--------|----------|
| Global leaderboard | Cached snapshot, refreshes every 30-60 min. No live updates. |
| User's own challenge progress | Updated by trigger on `workout_logs` INSERT. UI refreshes on screen focus (`useFocusAsyncData` pattern). |
| Other users' progress | Not visible at all (visibility rules above). Not applicable. |
| Realtime channels | **Not used.** No WebSocket subscriptions for challenges. |

**Rationale:** Chat needs instant delivery (messages). Challenges don't — seeing progress update on screen focus and leaderboard update within 30-60 min is sufficient. Removes significant complexity (no channel management, no broadcast triggers).

### Topic 6: Challenge completion with rewards (DECIDED)

**Approach: pg_cron triggered, single Postgres transaction, tiebreaker by completion time.**

#### Trigger Mechanism

| Decision | Choice |
|----------|--------|
| What triggers completion | **pg_cron scheduled job** — runs every hour, finds challenges where `end_date < now()` and `status = 'active'` |
| Why not on-demand | No dependency on user action. If nobody opens a challenge, it still completes. |
| Delay tolerance | Up to 1 hour — acceptable since leaderboard already refreshes on 30-60 min cadence |

#### `complete_challenge` RPC — Atomic Steps

1. Set `challenges.status = 'completed'`
2. Assign `challenge_participants.rank` using `ORDER BY current_progress DESC, completed_at ASC, user_id ASC`
3. For platform challenges: add points to `profiles.leaderboard_points` for all participants who completed (reached target)
4. Update `profiles.leaderboard_points_updated_at = now()` for affected users
5. No reward generation in v1 (deferred to v2 — badges, discount codes, tier rewards)
6. No external API calls inside the transaction

#### Ranking & Tiebreaking

| Rule | Detail |
|------|--------|
| Primary sort | `current_progress DESC` (highest progress first) |
| Tiebreaker | `completed_at ASC` (whoever finished the target first wins) |
| Final tiebreaker | `user_id ASC` (deterministic, handles same-second completions) |
| No shared ranks | Every participant gets a unique rank — ties are impossible |

**`completed_at` tracking:** When the trigger on `workout_logs` updates `current_progress` and detects `current_progress >= target_value`, it also sets `challenge_participants.completed_at = now()`. This timestamp is the tiebreaker. Same-second completions resolved by `user_id ASC` (arbitrary but deterministic — accepted edge case, not worth solving further).

#### Points Allocation

| Decision | Choice |
|----------|--------|
| When points are awarded | **Only on challenge completion** (reaching 100% of target) |
| Partial progress | **No points** — in-progress challenges award nothing |
| Point values per challenge | Separate topic (Topic 22) |

#### Reward Types (v1: points only, v2: badges/codes/tiers)

| Type | v1 Status |
|------|-----------|
| Points | **Active** — added to `profiles.leaderboard_points` on completion |
| Badges | Deferred to v2 |
| Discount codes | Deferred to v2 |
| Battle pass tiers | Deferred to v2 |

### Topic 7: Celebration & Animation (DECIDED)

**Approach: Leaderboard-only animation for top 10, no challenge-completion celebration screen.**

#### Where Animation Appears

| Location | Animation? |
|----------|-----------|
| Leaderboard screen (top 10 user viewing) | **Yes** — confetti on every visit while in top 10 |
| Challenge completion | **No** — no celebration modal, no confetti |
| Anywhere else | **No** — leaderboard only |

#### Animation Tiers

| Rank | Animation Level |
|------|----------------|
| #1 | Largest/best confetti animation |
| #2–3 | Slightly smaller animation |
| #4–7 | Medium animation |
| #8–10 | Smallest animation |
| #11–100 | No animation |

#### Behavior

| Rule | Detail |
|------|--------|
| Trigger | Every time the user opens/navigates to the leaderboard |
| Condition | User's current rank is within top 10 |
| Dynamic | If user drops from top 9 to top 13, animation stops appearing |
| Library | `react-native-confetti-cannon` |
| Persistence | Not a one-time event — shows on every leaderboard visit while in top 10 |

#### Leaderboard Layout

| Section | Content |
|---------|---------|
| Top (podium) | Top 3 users displayed as a podium (visual prominence) |
| Below podium | List of ranks #4–100 (standard list layout) |
| User's own rank | Always visible (even if outside top 100, shown at bottom) |
| Rewards earned | **Not shown on leaderboard** (for now) |
| Share button | **None** (v1) |

### Topic 8: New "Challenges" tab (DECIDED)

**Approach: 5th tab visible to all users. Three sub-views with text toggle. Default: My Challenges.**

#### Tab Visibility

| Decision | Choice |
|----------|--------|
| Who sees the tab | **Everyone** — all users (trainers and clients are both users) |
| Tab position | 5th tab alongside Dashboard, Messages, Profile |
| Tab icon | **Trophy** (`trophy` / `trophy-outline` from Ionicons) |
| Default view on tap | **My Challenges** (always) |

#### Sub-view Navigation

Three text-only toggle buttons at the top of the screen (no icons, just labels):

| Sub-view | Content |
|----------|---------|
| Discovery | Available platform challenges to pick from (daily/weekly/monthly pool) |
| My Challenges | User's active challenges (platform + trainer-assigned) |
| Leaderboard | Top 3 podium + list of #4–100 + user's own rank highlighted |

#### Role-specific Content

| Role | Discovery | My Challenges | Leaderboard |
|------|-----------|---------------|-------------|
| Client | Platform challenges pool | Active platform + trainer-assigned | Same for all |
| Trainer (as user) | Same platform challenges pool | Their own active platform challenges | Same for all |
| Trainer (management) | — | Also shows challenges they assigned to clients | — |

#### Leaderboard Sub-view (recap from Topic 7)

- Top 3: podium visual
- #4–100: standard list
- Current user highlighted in the list (if within top 100)
- Top 10 users get confetti animation on visit (tiered per Topic 7)

### Topic 9-12: Reward System (DECIDED — Scope Only)

**All reward types deferred to v2.**

| Reward Type | Status | Where discussed |
|-------------|--------|-----------------|
| Badges/Trophies | **Deferred to v2** | Topic 29 |
| Discount codes | **Deferred to v2** | Topic 28 |
| Battle pass tiers | **Deferred to v2** | Topic 30 |
| Custom reward text | **Removed** — not implementing | — |

### Topic 13: Challenge detail & list screens (DECIDED)

**Approach: Discovery has tap-to-detail with accept button. My Challenges shows full info inline (no drill-down).**

#### Discovery View (list)

| Element | Detail |
|---------|--------|
| Card content | Title only (minimal) |
| Grouping | Daily / Weekly / Monthly sections |
| Tap behavior | Opens detail screen |
| No type indicator | User doesn't see "Streak" / "Frequency" / "Custom" labels |

#### Discovery Detail Screen (after tap)

| Element | Detail |
|---------|--------|
| Title | Challenge name |
| Description | Optional — shown if the challenge has one |
| Remaining time | Live countdown timer (daily: counts down from 24h starting at 4AM; weekly: from 7d starting Monday 4AM; monthly: from end of month 4AM) |
| Action | "Accept" button to start the challenge |
| After accept | Challenge moves to My Challenges |

#### My Challenges View (list — no drill-down)

All info visible directly on the card, no tap-to-detail needed:

| Element | Position |
|---------|----------|
| Title | Top |
| Description | Below title |
| Progress bar | Below description (e.g., "2/5 workouts") |
| Mark as complete button | Below progress bar (only for self-reported challenges) |
| Remaining time | Small bubble, bottom-right corner |

#### Progress Tracking per Challenge Type

| Challenge type | How progress updates |
|----------------|---------------------|
| Auto-tracked (workout-based) | System updates via trigger on `workout_logs` — no user action |
| Self-reported (e.g., "drink 2L water") | User taps "Mark as complete" button |
| Which challenges need which | Determined at challenge creation (deferred to challenge creation topic) |

#### Streak Reset Behavior

- On streak break: "Comeback Card" UX — restart icon, "Day 0 — Restart your streak", "Best: X days" stat (see Topic 31)

### Topic 14: Create challenge form
_Merged into Topic 24 (Trainer challenge lifecycle) — covers pre-defined blocks, creation form, assignment UX, client rejection flow._

### Topic 15: Celebration modal
_Removed — no challenge-completion celebration (see Topic 7). Animation only on leaderboard for top 10._

### Topic 16: Profile badges
_Deferred to Topic 29 (Badges and trophies)._

---

## Topics To Discuss (Second Group — new from our review)

### Topic 20: Challenge discovery mechanic (DECIDED)

**Approach: Fixed pool sizes, pick limits, 1h cooldown on new slot, blurred states with countdown timers, paused challenges on limit reached.**

#### Discovery Pool

| Cadence | Challenges visible in pool | Replenish rule |
|---------|---------------------------|----------------|
| Daily | 3 | When one is picked, a new one appears after 1h (blurred with countdown) |
| Weekly | 3 | Same — 1h cooldown per picked slot |
| Monthly | 5 | Same — 1h cooldown per picked slot |

#### Active Limits (how many can be in My Challenges at once)

| Cadence | Active at a time |
|---------|-----------------|
| Daily | 1 |
| Weekly | 3 |
| Monthly | 5 |

#### Completion Limits (total completions per period)

| Cadence | Max completions per period |
|---------|---------------------------|
| Daily | 1 per day |
| Weekly | 5 per week |
| Monthly | 10 per month |

#### Discovery Card States

| State | Visual | Interaction |
|-------|--------|-------------|
| Available to pick | Normal card, tappable | Opens detail → Accept |
| 1h cooldown (slot just freed) | Blurred, not tappable | Bubble: "Available in XX:XX" (1h countdown) |
| Period limit reached | Blurred, not tappable | Bubble: "Available in X time" (countdown to next reset) |

#### My Challenges Card States

| State | Visual | Interaction |
|-------|--------|-------------|
| Active, in progress | Normal card with progress bar + timer bubble | Full interaction |
| Paused (period completion limit reached) | Blurred | Bubble: "Available after [reset time]" |

#### Period Resets

| Cadence | When | What happens |
|---------|------|--------------|
| Daily | Every day at 4AM (Europe/Sofia) | Active daily challenge progress resets to 0. Completion count resets. |
| Weekly | Every Monday at 4AM | All weekly challenges progress resets to 0. Completion count resets. Paused challenges become active. |
| Monthly | 1st of each month at 4AM | All monthly challenges progress resets to 0. Completion count resets. Paused challenges become active. |

Monthly reset uses `date_trunc('month', now()) + interval '1 month'` — handles variable month lengths automatically.

#### Challenge Persistence

| Rule | Detail |
|------|--------|
| Expiry | **No expiry** — challenges stay in My Challenges until completed or user gives up |
| Give up | User can abandon any active challenge, no penalty |
| Pre-filling | User can pick challenges before the period resets (fill all slots). On reset, they wake up with fresh progress ready to go. |
| Progress on reset | **Always resets to 0** when a new period starts (fairness) |

#### Hard Freeze on Completion Limit

Once the completion limit is reached (1/1 daily, 5/5 weekly, 10/10 monthly), **all remaining active challenges of that cadence hard-freeze**:

- No progress is counted — even if the user performs the exact activity the challenge requires, it does NOT increment
- Newly picked challenges of that cadence also get zero progress until reset
- This is a **backend enforcement**, not just UI — the trigger on `workout_logs` skips progress updates for frozen challenges
- Applies equally to challenges that were mid-progress and freshly picked ones

**Example:** User has weekly challenge 1 (50% done) and challenge 2. They complete challenge 2 → that's 5/5 for the week. Challenge 1 freezes at 50% — workouts done between now and Monday 4AM won't count toward it. On Monday reset, progress resets to 0 and tracking resumes.

#### Example Flow (Weekly)

1. User picks 3 weekly challenges (max active at a time)
2. Completes 2 → picks 2 more from Discovery (now has 3 active again)
3. Completes 3 more → that's 5 total for the week (limit reached)
4. Remaining active challenge in My Challenges gets **paused** (blurred, "Available after Monday 4AM")
5. All progress tracking stops for weekly challenges — workouts don't count
6. Monday 4AM: progress resets to 0, challenge becomes active again, completion count resets
7. User can now complete up to 5 more this week

### Topic 21: Limits and cadence (DECIDED — covered by Topic 20)
_All limits and cadence decisions captured in Topic 20: pool sizes (3/3/5), active limits (1/3/5), completion limits (1/5/10), 1h cooldown, period resets at 4AM._

### Topic 22: Points, scoring, and reward tiers (DECIDED) (merged with Topics 26 & 27)

**Approach: 3 difficulty tiers per challenge, points set per challenge at creation time, no bonuses, trainer challenges give no points.**

#### Difficulty System

| Decision | Choice |
|----------|--------|
| Difficulty levels | **3 tiers**: Easy, Medium, Hard |
| How user gets difficulty | **Random from pool** — user does NOT choose. Each challenge template generates 3 variants in the pool. |
| Pool impact | Content pool is 3x larger (each concept × 3 difficulties). User still sees 3/3/5 cards in Discovery — random difficulty draws. |
| If user dislikes difficulty | Give up (no penalty), wait for 1h cooldown, get a new random draw |

#### Point Values

| Decision | Choice |
|----------|--------|
| Base points per challenge | **Set individually at challenge creation time** — no fixed formula per cadence |
| Difficulty multiplier | Yes — harder variant of same challenge gives more points (exact multiplier set per challenge) |
| Who defines points | Platform admin when creating challenge templates |

#### What Gives NO Points

| Scenario | Points |
|----------|--------|
| Trainer-assigned challenges | **0 pts** — leaderboard is purely platform-driven |
| Partial progress (period resets before completion) | **0 pts** — only completion counts (Topic 6) |
| Rank/position bonus (first to complete) | **None** — everyone who completes gets the same |
| Streak bonus | **None** — streak is a separate mechanic (Topic 31) |

#### Summary

The leaderboard is driven exclusively by platform challenge completions. Points per challenge are a design decision made when creating content, not a system-wide formula. Difficulty adds variety to the pool and scales rewards, but the user has no control over which difficulty they receive.

### Topic 23: Leaderboard reset and history (DECIDED)

**Approach: Full monthly reset at 4AM on the 1st, user's own historical rank stored per month, no all-time leaderboard.**

#### Monthly Reset

| Decision | Choice |
|----------|--------|
| Reset timing | **1st of each month at 4AM** (Europe/Sofia) — aligned with challenge period resets |
| What resets | `profiles.leaderboard_points` → 0 for all users |
| Method | pg_cron bulk UPDATE (single statement, milliseconds even at 100k users) |
| All-time leaderboard | **No** — fresh start every month |

#### Leaderboard Ranking & Tiebreaker

| Rule | Detail |
|------|--------|
| Primary sort | `leaderboard_points DESC` |
| Tiebreaker | `leaderboard_points_updated_at ASC` (whoever reached that point total first ranks higher) |
| Final tiebreaker | Alphabetical by `profiles.name` (for same-second edge case) |
| No shared ranks | Every user gets a unique position |
| Implementation | `profiles.leaderboard_points_updated_at` timestamp, updated every time `leaderboard_points` changes |

#### User's Own Rank (outside top 100)

```sql
SELECT COUNT(*) FROM profiles WHERE leaderboard_points > $my_points
```

With `CREATE INDEX idx_profiles_leaderboard_points ON profiles(leaderboard_points DESC)`, this is <1ms at 20k users, <2ms at 100k.

#### Historical Standings

| Decision | Choice |
|----------|--------|
| What's stored | User's own final rank + points for each month (archived before reset) |
| Full leaderboard archive | No — only user's own position per month |
| Where visible | User's profile (details in Topic 34) |

#### Winner Recognition

| Decision | Choice |
|----------|--------|
| Monthly winner badge | **Yes** — auto-awarded, details in Topic 29 |
| Hall of Fame | **Yes** — details in Topic 35 |

#### Load Spike (Non-issue)

At 10-20k+ users, the reset at 4AM is two bulk UPDATEs + one archive INSERT — completes in under a second. No need to stagger timing.

### Topic 24: Trainer challenge lifecycle (DECIDED) (includes Topic 14: Create challenge form)

**Approach: Block-based builder with saveable templates, multi-assign with per-client customization, auto-accepted with give-up option, full trainer visibility, deadline required.**

#### Challenge Creation (Block Builder)

Trainers construct challenges by filling parameters into block structures:

| Block Type | Structure | Progress Tracking |
|------------|-----------|-------------------|
| Frequency | "Do **[X]** **[workout type]** workouts in **[X]** days" | Auto-tracked from `workout_logs` |
| Streak | "Maintain a streak of **[X]** consecutive days" | Auto-tracked from `workout_logs` |
| Custom | Trainer writes free-text goal | **Manual** — client has "Mark as done" button |

#### Templates

| Decision | Choice |
|----------|--------|
| Save as template | Trainer can save any built challenge as a reusable template |
| Assign from template | Trainer picks a saved template, then edits parameters before confirming |
| Editable on assign | Duration, time, workout type, target value — anything in the block is customizable per client |

#### Assignment Model

| Decision | Choice |
|----------|--------|
| Who assigns | Trainer selects specific clients |
| Multi-assign | **Yes** — trainer can select multiple clients at once |
| Per-client customization | Before confirming, trainer can tweak parameters for each client individually |
| Client discovery | No — only assigned clients see trainer challenges (not discoverable by others) |

#### Client Response

| Decision | Choice |
|----------|--------|
| Accept/reject | **Auto-accepted** — challenge appears in client's My Challenges immediately |
| Give up | Client can give up at any time, no penalty (same as platform challenges) |

#### Trainer Visibility

| Decision | Choice |
|----------|--------|
| Progress view | **Full visibility** — progress bars, completion times, rankings among assigned clients |
| Dashboard | Trainer sees all their assigned challenges with each client's progress |

#### Deadline & Points

| Decision | Choice |
|----------|--------|
| Deadline | **Required** — trainer must set start/end date |
| Points | **Zero** — no leaderboard points, no rewards, no recognition |
| Purpose | Purely a trainer-client accountability tool |

### Topic 25: Workout categories
_Adding categories to the system so frequency challenges can target specific muscle groups._

### ~~Topic 26: Points and scoring~~ → Merged into Topic 22

### ~~Topic 27: Points per challenge type and difficulty~~ → Merged into Topic 22

### Topic 28: Discount codes and reward details — DEFERRED TO v2
_Code format, generation mechanism, redemption flow, expiry, trainer vs platform reward differences._

### Topic 29: Badges and trophies — DEFERRED TO v2
_Where they display, rarity tiers, platform vs trainer badges, design/naming._

### Topic 30: Battle pass tiers — DEFERRED TO v2
_How many tiers, milestone definitions, rewards per tier, who defines them (platform vs trainer)._

### Topic 31: Streak reset UX (DECIDED)

**Approach: "The Comeback Card" — turn streak breaks into a game mechanic, not a punishment.**

#### Streak Card States

| State | Visual | Trigger |
|-------|--------|---------|
| Normal (active) | Progress bar filled (e.g., "4/7 days"), standard styling | Streak is progressing |
| Broken (reset to 0) | Restart icon on card, message: "Day 0 — Restart your streak", "Best: X days" shown | 4AM passes with no workout logged previous day |
| Comeback moment | Inline checkmark animation + "Back on track!" text | `current_progress` reaches `longest_streak` value again |

#### Longest Streak Tracking

| Decision | Choice |
|----------|--------|
| Storage | `longest_streak` column on `challenge_participants` |
| Updated when | `current_progress > longest_streak` |
| Display | Subtle text below progress bar: "Best: X days" |
| Persists | Across resets within the same challenge period |

#### Comeback Moment

| Decision | Choice |
|----------|--------|
| Trigger | User's current streak reaches their previous longest streak for that challenge |
| Visual | Small inline animation: checkmark + "Back on track!" |
| Frequency | Once per streak attempt — doesn't fire again until next break + recovery |

#### What's NOT Included

| Excluded | Reason |
|----------|--------|
| Push notifications for streak breaks | No guilt/spam |
| Modals or popups | Non-intrusive philosophy |
| Red/warning colors | Comeback framing is neutral-to-positive |
| Streak freeze / skip day | Not implementing — miss = reset |
| Backfill | No retroactive logging allowed |

### Topic 32: Future — Stripe integration (v2)
_Stripe Connect, real coupon codes, auto-apply at checkout, webhook confirmation._

### Topic 33: Future — Multi-provider abstraction (v3)
_PaymentProvider interface, adapter pattern, provider column on rewards._

### Topic 34: Profile rank history display — DEFERRED TO v2
_How monthly rank/points history is shown on the user's profile. Layout, navigation, data granularity._

### Topic 35: Hall of Fame — DEFERRED TO v2
_Where it lives, how many months shown, visual design, relationship to leaderboard tab._

### Topic 36: Trainer challenge expiry behavior — DEFERRED TO v2
_What happens when a trainer challenge deadline passes. Currently: disappears from client's view, shows as expired on trainer dashboard._

### Topic 37: Challenge content library (v1.2)
_The actual challenges: titles, descriptions, point values, difficulty parameters, categories. What the library looks like, how to add new challenges, UI/color/structure decisions._

### Topic 38: Trainer rewards for challenges — DEFERRED TO v2
_Whether trainer challenges should have any reward/recognition system separate from leaderboard._

---

## Edge Cases & Clarifications (DECIDED)

| # | Scenario | Decision |
|---|----------|----------|
| E1 | Trainer challenge deadline passes | Challenge disappears from client's My Challenges. Trainer sees it as "expired" on their dashboard. Full behavior in Topic 36 (v2). |
| E2 | Client gives up on trainer challenge | Trainer sees it as "abandoned" on their dashboard. No penalty for client. |
| E3 | Discovery pool — repetition | Same challenge cannot reappear within the next 10 draws for that user. Challenges are otherwise repeatable across periods. |
| E4 | Discovery pool — source | Pre-defined library created by platform. v1 ships with infrastructure only (empty library). Content populated in v1.2 (Topic 37). |
| E5 | Give up vs. completion limit (daily) | Give up does NOT count toward completion limit. User can give up on a daily challenge and pick a new one. Only actual completions count toward the 1/day limit. |
| E6 | Trainer-client connection severed | Trainer challenges disappear from client's My Challenges. Trainer sees them as "abandoned" on their dashboard. |
| E7 | Trainer challenges in My Challenges UI | Mixed with platform challenges (no visual distinction in v1). May add differentiation in v1.2 (Topic 37). |
| E8 | Self-reported challenges — who creates them | Both platform and trainers can create self-reported challenges. Platform: from the library. Trainers: via "Custom" block type. |

---

## Reference: Georgi's Original Design

See `Documentation/issue-28-challenges-design-draft.md` for the initial brainstorm that this document builds upon. Key differences from Georgi's original:

- No client-created challenges (Georgi assumed trainer-only, we added platform challenges)
- Leaderboard is global across all users, not per-challenge
- Trainer challenges don't award leaderboard points
- Discovery/rotation mechanic for platform challenges (not in original)
- Pre-defined blocks for trainer challenge creation (not free-form)

---

## Implementation Structure Plan

> Everything below consolidates all decided topics into a sequenced implementation blueprint.
> This is what gets broken into PRs after Georgi reviews.

---

### Phase 1: Database Schema & Infrastructure

#### 1.1 Migration: Core Tables

File: `supabase/migrations/20260XXX120000_challenges.sql`

**Table: `challenge_templates`** (platform challenge library)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `title_bg` | text | Bulgarian translation |
| `description` | text | nullable |
| `description_bg` | text | nullable |
| `challenge_type` | text | `frequency`, `streak`, `custom_auto`, `custom_self_reported` |
| `cadence` | text | `daily`, `weekly`, `monthly` |
| `difficulty` | text | `easy`, `medium`, `hard` |
| `target_value` | integer | NOT NULL (e.g., 3 workouts, 5-day streak) |
| `points` | integer | NOT NULL — awarded on completion |
| `category` | text | nullable — workout category filter (Topic 25) |
| `template_group` | text | NOT NULL — groups the 3 difficulty variants together |
| `active` | boolean | default true — allows deactivating without deletion |
| `created_at` | timestamptz | default `now()` |

**Table: `challenges`** (active challenge instances)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `template_id` | uuid | nullable FK → `challenge_templates` (null for trainer challenges) |
| `creator_id` | uuid | FK → `profiles` (trainer for trainer-created, null/system for platform) |
| `source` | text | `platform` or `trainer` |
| `title` | text | NOT NULL |
| `title_bg` | text | nullable |
| `description` | text | nullable |
| `description_bg` | text | nullable |
| `challenge_type` | text | `frequency`, `streak`, `custom_auto`, `custom_self_reported` |
| `cadence` | text | `daily`, `weekly`, `monthly` |
| `difficulty` | text | `easy`, `medium`, `hard` (null for trainer challenges) |
| `target_value` | integer | NOT NULL |
| `points` | integer | NOT NULL (0 for trainer challenges) |
| `category` | text | nullable — workout category filter |
| `start_date` | date | NOT NULL |
| `end_date` | date | nullable (null for platform challenges — they don't expire) |
| `status` | text | `active`, `completed`, `expired` |
| `created_at` | timestamptz | default `now()` |

**Table: `challenge_participants`** (user enrollment + progress)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `challenge_id` | uuid | FK → `challenges` |
| `user_id` | uuid | FK → `profiles` |
| `current_progress` | integer | default 0 — cached, updated by trigger |
| `longest_streak` | integer | default 0 — max streak achieved (for streak type) |
| `target_value` | integer | NOT NULL — copied from challenge (for per-client customization) |
| `status` | text | `active`, `completed`, `paused`, `abandoned` |
| `joined_at` | timestamptz | default `now()` |
| `completed_at` | timestamptz | nullable — set when `current_progress >= target_value` |
| `rank` | integer | nullable — set on challenge completion |
| `source` | text | `discovery`, `trainer_assigned` |
| `created_at` | timestamptz | default `now()` |

**Table: `user_challenge_state`** (discovery/completion tracking per user)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles` |
| `cadence` | text | `daily`, `weekly`, `monthly` |
| `completions_this_period` | integer | default 0 |
| `period_start` | date | NOT NULL — current period start date |
| `last_pick_at` | timestamptz | nullable — for 1h cooldown calculation |
| `recent_template_ids` | uuid[] | last 10 picked template IDs (for anti-repetition) |

**Table: `trainer_challenge_templates`** (saved trainer blocks)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `trainer_id` | uuid | FK → `profiles` |
| `title` | text | NOT NULL |
| `challenge_type` | text | `frequency`, `streak`, `custom` |
| `target_value` | integer | NOT NULL |
| `category` | text | nullable |
| `description` | text | nullable |
| `created_at` | timestamptz | default `now()` |

**Table: `leaderboard_snapshot`** (cached top 100)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles` |
| `rank` | integer | NOT NULL |
| `points` | integer | NOT NULL |
| `user_name` | text | NOT NULL — denormalized for fast reads |
| `refreshed_at` | timestamptz | NOT NULL |

**Table: `leaderboard_history`** (monthly archives)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles` |
| `month` | date | 1st of the month (e.g., `2026-06-01`) |
| `final_rank` | integer | NOT NULL |
| `final_points` | integer | NOT NULL |
| `created_at` | timestamptz | default `now()` |

#### 1.2 Migration: Columns on Existing Tables

**`profiles` table additions:**

| Column | Type | Notes |
|--------|------|-------|
| `leaderboard_points` | integer | default 0 |
| `leaderboard_points_updated_at` | timestamptz | default `now()` |

**`workout_logs` table additions:**

| Column | Type | Notes |
|--------|------|-------|
| `gym_date` | date | GENERATED ALWAYS AS stored (4AM boundary formula) |

**Indexes:**

```sql
CREATE INDEX idx_workout_logs_gym_date ON workout_logs(user_id, gym_date);
CREATE INDEX idx_profiles_leaderboard_points ON profiles(leaderboard_points DESC);
CREATE INDEX idx_challenge_participants_active ON challenge_participants(user_id, status) WHERE status = 'active';
CREATE INDEX idx_challenge_participants_challenge ON challenge_participants(challenge_id, status);
CREATE INDEX idx_challenges_status ON challenges(status, cadence);
CREATE INDEX idx_user_challenge_state ON user_challenge_state(user_id, cadence);
```

#### 1.3 Migration: RLS Policies

| Table | Policy | Rule |
|-------|--------|------|
| `challenge_templates` | SELECT | All authenticated users |
| `challenges` | SELECT | Participants can read their own + trainers read their created ones |
| `challenges` | INSERT | Trainers only (source = 'trainer') |
| `challenge_participants` | SELECT | Own rows + trainer sees their assigned clients |
| `challenge_participants` | INSERT | Own user_id only (for discovery picks) |
| `challenge_participants` | UPDATE | Own rows (for abandon/self-report) |
| `user_challenge_state` | SELECT/UPDATE | Own rows only |
| `trainer_challenge_templates` | ALL | Own rows only (trainer_id = auth.uid()) |
| `leaderboard_snapshot` | SELECT | All authenticated users |
| `leaderboard_history` | SELECT | Own rows only |

#### 1.4 Postgres Functions & Triggers

**Trigger: `trg_workout_log_challenge_progress`** (on `workout_logs` INSERT)

Responsibilities:
1. Find all `active` challenge_participants for the user
2. Skip challenges that are frozen (user's `completions_this_period >= limit` for that cadence)
3. For frequency challenges: increment `current_progress` if workout matches category (or any workout if no category)
4. For streak challenges: recalculate streak using gaps-and-islands on `gym_date`
5. Update `longest_streak` if `current_progress > longest_streak`
6. If `current_progress >= target_value`: set `completed_at = now()`, update `user_challenge_state.completions_this_period`

**Function: `calculate_streak(p_user_id uuid, p_challenge_id uuid)`**

- Queries `workout_logs` for the user within the challenge period
- Uses gaps-and-islands on `gym_date` to find current consecutive day count
- Returns integer (current streak length)

**Function: `refresh_leaderboard_snapshot()`** (called by pg_cron)

- Truncates `leaderboard_snapshot`
- Inserts top 100 from `profiles` ordered by `leaderboard_points DESC, leaderboard_points_updated_at ASC, name ASC`
- Updates `refreshed_at`

**Function: `complete_expired_challenges()`** (called by pg_cron, hourly)

- Finds challenges where `end_date < now()` AND `status = 'active'` (trainer challenges only — platform challenges don't expire)
- Assigns ranks per `current_progress DESC, completed_at ASC, user_id ASC`
- Sets `challenges.status = 'completed'`

**Function: `reset_daily_challenges()`** (called by pg_cron, daily at 4AM Sofia)

- Resets `current_progress = 0` for all active daily challenge participants
- Resets `user_challenge_state.completions_this_period = 0` WHERE `cadence = 'daily'`
- Updates `period_start` to today's gym_date

**Function: `reset_weekly_challenges()`** (called by pg_cron, Monday 4AM Sofia)

- Same as daily but for weekly cadence
- Unpauses paused weekly challenges (`status = 'paused'` → `'active'`)

**Function: `reset_monthly_challenges()`** (called by pg_cron, 1st of month 4AM Sofia)

- Same pattern for monthly cadence
- Also runs the leaderboard monthly reset:
  - Archives each user's rank/points to `leaderboard_history`
  - Zeros `profiles.leaderboard_points` for all users
  - Resets `leaderboard_snapshot`

#### 1.5 pg_cron Jobs

| Job | Schedule | Function |
|-----|----------|----------|
| Leaderboard refresh | Every 30 min | `refresh_leaderboard_snapshot()` |
| Challenge expiry | Every hour | `complete_expired_challenges()` |
| Daily reset | `0 1 * * *` (4AM Sofia = 1AM UTC in summer) | `reset_daily_challenges()` |
| Weekly reset | `0 1 * * 1` (Monday 4AM Sofia) | `reset_weekly_challenges()` |
| Monthly reset | `0 1 1 * *` (1st of month 4AM Sofia) | `reset_monthly_challenges()` |

> Note: UTC offset for Sofia changes between winter (UTC+2) and summer (UTC+3). The cron times must be set to the current UTC equivalent of 4AM Sofia, or use a timezone-aware scheduler.

---

### Phase 2: Service Layer

File: `src/lib/challengeService.ts`

#### 2.1 Discovery Functions

| Function | Purpose |
|----------|---------|
| `getDiscoveryPool(userId, cadence)` | Returns available challenges for the discovery view (respects anti-repetition, cooldown, limits) |
| `pickChallenge(userId, challengeTemplateId)` | User picks a challenge from discovery → creates `challenge_participants` row |
| `getUserChallengeState(userId)` | Returns completion counts, cooldown status, active counts per cadence |

#### 2.2 My Challenges Functions

| Function | Purpose |
|----------|---------|
| `getActiveChallenges(userId)` | Returns all active challenges (platform + trainer) with progress |
| `abandonChallenge(userId, challengeParticipantId)` | User gives up on a challenge |
| `reportProgress(userId, challengeParticipantId)` | Self-reported challenges: increment progress by 1 |

#### 2.3 Leaderboard Functions

| Function | Purpose |
|----------|---------|
| `getLeaderboard()` | Returns top 100 from snapshot table |
| `getUserRank(userId)` | Returns user's current rank + points (even if outside top 100) |
| `getLeaderboardHistory(userId)` | Returns user's monthly rank history |

#### 2.4 Trainer Functions

| Function | Purpose |
|----------|---------|
| `createTrainerChallenge(trainerId, params, clientIds[])` | Creates challenge + participant rows for each client |
| `getTrainerChallenges(trainerId)` | All challenges created by trainer with client progress |
| `getTrainerTemplates(trainerId)` | Saved block templates |
| `saveTrainerTemplate(trainerId, params)` | Save a challenge block as reusable template |
| `deleteTrainerTemplate(trainerId, templateId)` | Remove a saved template |

---

### Phase 3: TypeScript Types

File: `src/types/index.ts` (additions)

```typescript
// Challenge template (platform library)
interface ChallengeTemplate {
  id: string;
  title: string;
  titleBg: string | null;
  description: string | null;
  descriptionBg: string | null;
  challengeType: 'frequency' | 'streak' | 'custom_auto' | 'custom_self_reported';
  cadence: 'daily' | 'weekly' | 'monthly';
  difficulty: 'easy' | 'medium' | 'hard';
  targetValue: number;
  points: number;
  category: string | null;
  templateGroup: string;
}

// Active challenge instance
interface Challenge {
  id: string;
  templateId: string | null;
  source: 'platform' | 'trainer';
  title: string;
  titleBg: string | null;
  description: string | null;
  descriptionBg: string | null;
  challengeType: 'frequency' | 'streak' | 'custom_auto' | 'custom_self_reported';
  cadence: 'daily' | 'weekly' | 'monthly';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  targetValue: number;
  points: number;
  category: string | null;
  status: 'active' | 'completed' | 'expired';
  startDate: string;
  endDate: string | null;
}

// User's participation in a challenge
interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  currentProgress: number;
  longestStreak: number;
  targetValue: number;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  completedAt: string | null;
  source: 'discovery' | 'trainer_assigned';
  challenge: Challenge; // joined
}

// Discovery pool card
interface DiscoveryCard {
  challenge: Challenge;
  state: 'available' | 'cooldown' | 'limit_reached';
  availableAt: string | null; // ISO timestamp when available (for cooldown/limit countdown)
}

// User challenge state (limits/cooldowns)
interface UserChallengeState {
  cadence: 'daily' | 'weekly' | 'monthly';
  completionsThisPeriod: number;
  maxCompletions: number; // 1, 5, or 10
  activeCount: number;
  maxActive: number; // 1, 3, or 5
  lastPickAt: string | null;
  cooldownEndsAt: string | null; // computed: lastPickAt + 1h
}

// Leaderboard entry
interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  points: number;
}

// Trainer challenge template (saved block)
interface TrainerChallengeTemplate {
  id: string;
  trainerId: string;
  title: string;
  challengeType: 'frequency' | 'streak' | 'custom';
  targetValue: number;
  category: string | null;
  description: string | null;
}
```

---

### Phase 4: UI Screens & Components

#### 4.1 Tab Navigation Update

File: `app/(tabs)/_layout.tsx`

- Add 5th tab: **Challenges**
- Icon: `trophy-outline` / `trophy` (Ionicons)
- Route: `app/(tabs)/challenges.tsx`

#### 4.2 Challenges Tab Screen

File: `app/(tabs)/challenges.tsx`

- Three-way text toggle at top: **Discovery** | **My Challenges** | **Leaderboard**
- Default sub-view on tab tap: **My Challenges**
- Each sub-view is a section within the same screen (conditional render, not separate routes)

#### 4.3 Discovery Sub-view

Component location: inline in challenges tab or `src/components/challenges/DiscoveryView.tsx`

- Three sections: Daily / Weekly / Monthly
- Each section shows pool cards (3/3/5)
- Card states: available (tappable), cooldown (blurred + countdown), limit reached (blurred + countdown)
- Tap on available card → navigate to detail screen

#### 4.4 Challenge Detail Screen

File: `app/challenge-detail.tsx`

- Shows: title, description, remaining time countdown, difficulty badge
- "Accept" button → calls `pickChallenge()` → navigates back to My Challenges
- Only accessible from Discovery (not from My Challenges — those show inline)

#### 4.5 My Challenges Sub-view

Component location: inline in challenges tab or `src/components/challenges/MyChallengesView.tsx`

- FlatList of active challenges (platform + trainer mixed)
- Each card shows inline: title, description, progress bar, remaining time bubble
- Self-reported challenges: "Mark as done" button on card
- Streak challenges in broken state: Comeback Card UI (restart icon, "Day 0 — Restart your streak", "Best: X days")
- Paused challenges: blurred with "Available after [reset time]" bubble
- Swipe or long-press for "Give up" action

#### 4.6 Leaderboard Sub-view

Component location: inline in challenges tab or `src/components/challenges/LeaderboardView.tsx`

- Top 3: podium visual (cards with rank #1 center/elevated, #2 left, #3 right)
- #4–100: standard FlatList
- Current user highlighted (different background color) even if outside top 100
- User's own rank always visible at bottom if not in top 100
- Top 10 users: confetti animation on view mount (tiered per Topic 7)
- Library: `react-native-confetti-cannon`

#### 4.7 Trainer Challenge Builder

File: `app/challenge-builder.tsx`

- Block selection: Frequency / Streak / Custom
- Parameter inputs per block type:
  - Frequency: workout count, category dropdown, duration (days)
  - Streak: consecutive days target
  - Custom: free-text description
- Client multi-select picker
- Per-client customization step (optional — can tweak target per client)
- Start date + end date pickers
- "Save as template" toggle
- "Assign" button → calls `createTrainerChallenge()`

#### 4.8 Trainer Challenge Management

File: within `app/(tabs)/dashboard.tsx` or separate `app/trainer-challenges.tsx`

- List of all trainer-created challenges
- Each shows: title, assigned clients, progress per client
- Client progress: name + progress bar + completion status
- Expired/completed challenges shown separately

---

### Phase 5: Scheduled Jobs & Background Logic

| Job | Implementation | Cadence |
|-----|----------------|---------|
| Leaderboard snapshot refresh | Supabase pg_cron → `refresh_leaderboard_snapshot()` | Every 30 min |
| Challenge expiry check | Supabase pg_cron → `complete_expired_challenges()` | Every hour |
| Daily period reset | Supabase pg_cron → `reset_daily_challenges()` | Daily 4AM Sofia |
| Weekly period reset | Supabase pg_cron → `reset_weekly_challenges()` | Monday 4AM Sofia |
| Monthly full reset | Supabase pg_cron → `reset_monthly_challenges()` | 1st of month 4AM Sofia |

---

### Phase 6: i18n Strings

File: `src/constants/translations.ts` (additions)

Required key groups:
- `challenges.discovery` — "Discovery", pool section headers, cooldown text, limit text
- `challenges.myChallenges` — "My Challenges", progress labels, give up confirmation
- `challenges.leaderboard` — "Leaderboard", rank labels, monthly reset notice
- `challenges.detail` — "Accept", remaining time format, difficulty labels
- `challenges.streak` — "Day X", "Restart your streak", "Best: X days", "Back on track!"
- `challenges.trainer` — builder labels, template save, assign button, progress view
- `challenges.states` — "Available in...", "Paused", "Completed", "Abandoned"
- `tab.challenges` — tab label

All strings in EN + BG.

---

### Phase 7: Implementation Sequence (Suggested PR Order)

| # | PR Scope | Depends On |
|---|----------|------------|
| 1 | Database migration: all tables, columns, indexes | — |
| 2 | RLS policies | PR 1 |
| 3 | Postgres functions: streak calculation, progress trigger | PR 1 |
| 4 | Postgres functions: reset functions, leaderboard refresh, challenge expiry | PR 3 |
| 5 | pg_cron job setup | PR 4 |
| 6 | TypeScript types | — |
| 7 | Service layer: discovery functions | PR 1, 6 |
| 8 | Service layer: my challenges + leaderboard functions | PR 1, 6 |
| 9 | Service layer: trainer functions | PR 1, 6 |
| 10 | Tab navigation: add 5th tab (Challenges) | PR 6 |
| 11 | UI: Discovery sub-view + challenge detail screen | PR 7, 10 |
| 12 | UI: My Challenges sub-view (including Comeback Card) | PR 8, 10 |
| 13 | UI: Leaderboard sub-view (including confetti) | PR 8, 10 |
| 14 | UI: Trainer challenge builder | PR 9, 10 |
| 15 | UI: Trainer challenge management view | PR 9, 10 |
| 16 | i18n: all EN + BG strings | PR 11–15 |
| 17 | Topic 25: Workout categories (prerequisite for category-filtered challenges) | — |

---

### Open Items (Post-Review)

| Item | Needed Before |
|------|---------------|
| Topic 25: Workout categories | Content library (v1.2) — category-filtered challenges need this |
| Challenge content library | v1.2 — actual challenge titles, descriptions, point values |
| pg_cron timezone handling | PR 5 — determine whether to hardcode UTC offset or use timezone-aware approach |
| Confetti library evaluation | PR 13 — test `react-native-confetti-cannon` on both iOS/Android |
| Discovery pool randomization seed | PR 7 — how random draws work (pure random vs. weighted) |
