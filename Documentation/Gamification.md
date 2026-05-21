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
| Client enrollment (trainer) | **Auto-enrolled** by trainer, client can reject/cancel |
| Leaderboard | **Single global leaderboard**, all users combined, monthly reset |
| Leaderboard points | **Platform challenges only** — trainer challenges do NOT give leaderboard points |
| Trainer challenge rewards | Separate from points (badges, trainer-specific perks) |
| Overlapping challenges | Allowed — same workout log counts toward multiple challenges simultaneously |
| Navigation | **New dedicated tab** (Challenges) |

### Topic 2: Challenge Types

Three types, all available in v1:

#### Type 1 — Workout Frequency

- "Complete X workouts in the period" (any workout OR category-specific)
- Auto-tracked from `workout_logs`
- Requires workout categories (see Topic 7 below)
- Examples: "Complete 3 workouts", "Complete 2 leg workouts this week"

#### Type 2 — Streak

- "Work out X consecutive days"
- **Day boundary:** 4:00 AM to 4:00 AM Bulgarian time (EET/EEST)
- **Streak reset:** If broken, progress resets to 0 but user can restart within the same challenge period
- **Weekly/monthly only** — no daily streak challenges
- **Backfill:** Accepted within the challenge period (user forgot to log)
- Auto-tracked from `workout_logs`
- Example: "Maintain a 5-day workout streak this month"

#### Type 3 — Custom Target

- Two sub-modes:
  - **Auto-tracked:** Challenge measures something from the app (e.g., "Complete 3 workouts") — app fills progress automatically, client cannot edit
  - **Self-reported:** Challenge measures something external (e.g., "Drink 2L water") — client reports via counter ("I did it") or numeric value input
- **Fewer points** than Type 1 and Type 2 (honor system risk on self-reported)
- Trainer does NOT fill progress — client always does
- Trainer doesn't create free-form custom challenges — assembles from pre-defined blocks we provide

### Progress Expiry Rules

| Cadence | What happens if challenge expires mid-progress |
|---------|------------------------------------------------|
| Daily | New challenge appears next day. Previous progress lost. Backfill does NOT count for daily. |
| Weekly | User has the full week. On new week, fresh challenges. Previous progress does not carry over. |
| Monthly | User has the full month. On new month, fresh challenges. Previous progress does not carry over. |

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
4. Generate `challenge_rewards` rows (badges, discount codes, tier rewards — per challenge config)
5. No external API calls inside the transaction

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
| Point values per challenge | Separate topic (Topic 27) |

#### Reward Types (generated by RPC)

| Type | Generated how |
|------|---------------|
| Badges | Auto-created row in `challenge_rewards` for all completers |
| Discount codes | Format and flow — separate topic (Topic 28) |
| Battle pass tiers | Tier rewards generated for each milestone reached during the challenge |

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

### Topic 9-12: Reward System (v1) (DECIDED — Scope Only)

**Deferred details, scoped what's in/out for v1.**

| Reward Type | Status | Where discussed |
|-------------|--------|-----------------|
| Badges/Trophies | **In v1** — details deferred | Topic 29 |
| Discount codes | **In v1** — details deferred | Topic 28 |
| Battle pass tiers | **In v1** — details deferred | Topic 30 |
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

- Progress bar silently resets to 0/N when streak is broken
- No explicit "Streak broken" indicator (for now — see Topic 31)

### Topic 14: Create challenge form
_Merged into Topic 24 (Trainer challenge lifecycle) — covers pre-defined blocks, creation form, assignment UX, client rejection flow._

### Topic 15: Celebration modal
_Removed — no challenge-completion celebration (see Topic 7). Animation only on leaderboard for top 10._

### Topic 16: Profile badges
_Deferred to Topic 29 (Badges and trophies)._

---

## Topics To Discuss (Second Group — new from our review)

### Topic 20: Challenge discovery mechanic
_Pool size, rotation rules, pick limits, cooldown behavior, what happens when a daily/weekly/monthly expires mid-progress._

### Topic 21: Limits and cadence
_How many daily/weekly/monthly slots, how many the user can pick, refresh timing._

### Topic 22: Rewards system detail
_What rewards exist, point values, difficulty/rarity tiers._

### Topic 23: Leaderboard reset and history
_Monthly reset, historical standings, seasonal rankings._

### Topic 24: Trainer challenge lifecycle (includes Topic 14: Create challenge form)
_Pre-defined blocks trainers assemble from, creation form, assignment UX, client rejection flow, trainer visibility._

### Topic 25: Workout categories
_Adding categories to the system so frequency challenges can target specific muscle groups._

### Topic 26: Points and scoring
_How many points per type, difficulty multipliers, reduced points for custom/self-reported._

### Topic 27: Points per challenge type and difficulty
_Exact point values for each challenge type, rank bonuses, difficulty multipliers._

### Topic 28: Discount codes and reward details
_Code format, generation mechanism, redemption flow, expiry, trainer vs platform reward differences._

### Topic 29: Badges and trophies
_Where they display, rarity tiers, platform vs trainer badges, design/naming._

### Topic 30: Battle pass tiers
_How many tiers, milestone definitions, rewards per tier, who defines them (platform vs trainer)._

### Topic 31: Streak reset UX
_Whether to show explicit "streak broken" indicator, notification, or keep silent reset._

### Topic 32: Future — Stripe integration (v2)
_Stripe Connect, real coupon codes, auto-apply at checkout, webhook confirmation._

### Topic 33: Future — Multi-provider abstraction (v3)
_PaymentProvider interface, adapter pattern, provider column on rewards._

---

## Reference: Georgi's Original Design

See `Documentation/issue-28-challenges-design-draft.md` for the initial brainstorm that this document builds upon. Key differences from Georgi's original:

- No client-created challenges (Georgi assumed trainer-only, we added platform challenges)
- Leaderboard is global across all users, not per-challenge
- Trainer challenges don't award leaderboard points
- Discovery/rotation mechanic for platform challenges (not in original)
- Pre-defined blocks for trainer challenge creation (not free-form)
