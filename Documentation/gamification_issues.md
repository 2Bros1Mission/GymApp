# Gamification Issues — Requirements & Gap Analysis

**Date:** 2025-05-22
**Branch:** `docs/gamification-issue-review`
**Source:** Analysis of issues #128–#148 against `Documentation/Gamification.md` and existing codebase

---

## Per-Issue Analysis

### Issue #128 — Create core challenge database tables

**Status:** Mostly complete

**Missing Requirements:**
- No mention of `challenge_templates.max_concurrent` column (design doc section 4.1 specifies this)
- Missing `challenge_templates.cooldown_hours` column referenced in design doc
- Missing `challenges.cadence` column — the issue references `challenge_type` but the design doc uses `cadence` (daily/weekly/monthly) as a separate concept from challenge type (frequency/streak/custom)
- No explicit mention of `challenge_templates.category_filter` column for category-filtered challenges

**Ambiguities:**
- The issue conflates "challenge type" (`frequency`, `streak`, `custom`) with the design doc's structure which separates `challenge_type` (the template mechanic) from `cadence` (daily/weekly/monthly reset timing)
- `challenges.status` values listed as `upcoming`, `active`, `completed` — but design doc also includes `expired` as a distinct status

**Consistency Issues:**
- Table name mismatch: issue uses `challenge_templates` but also references columns from the older design draft's `challenges` table (like `reward_type`, `reward_tiers`)
- The design doc's `user_challenge_state` table is not mentioned — this tracks per-cadence state (frozen, progress, streak) separately from `challenge_participants`

**Missing Acceptance Criteria:**
- No criterion verifying that CHECK constraints enforce valid enum values
- No criterion for foreign key cascade behavior (what happens when a profile is deleted?)

**Implementation Risks:**
- If `cadence` and `challenge_type` are confused, the entire reset/progress system won't work correctly
- Missing `user_challenge_state` table means issues #133–#134 (trigger + reset functions) have no target table to update

---

### Issue #129 — Create leaderboard database tables and add columns to existing tables

**Status:** Complete with minor gaps

**Missing Requirements:**
- `profiles.leaderboard_points_updated_at` column mentioned in plan but not in the design doc — verify if actually needed
- No mention of how `leaderboard_snapshot` handles ties (same points, same rank?)
- Missing index on `workout_logs.gym_date` for the generated column

**Ambiguities:**
- `leaderboard_history` granularity: is it daily, weekly, or per-refresh snapshots?
- Retention policy for `leaderboard_history` — how long do we keep historical snapshots?

**Consistency Issues:**
- Design doc says leaderboard is computed on-the-fly from `workout_logs`, but this issue creates snapshot tables — these are for caching/display optimization, but the relationship to the "computed approach" should be explicit

**Missing Acceptance Criteria:**
- No criterion for verifying the `gym_date` generated column extracts the correct date from `created_at`
- No criterion for index performance on expected data volume

**Implementation Risks:**
- Low risk — this is additive schema work with clear structure

---

### Issue #130 — Add RLS policies for all challenge tables

**Status:** Mostly complete

**Missing Requirements:**
- No mention of RLS for `user_challenge_state` table (if it exists per #128 findings)
- Missing policy for trainers to UPDATE `challenge_participants.progress` for custom challenges
- No mention of SECURITY DEFINER functions needed for cross-table operations (e.g., completing a challenge needs to write to multiple tables)

**Ambiguities:**
- "Connected clients can read challenges from their trainer" — what defines "connected"? Is it via `trainer_clients` table or some other mechanism?
- Can trainers see ALL participant data or only for challenges they created?

**Consistency Issues:**
- Design doc says "Custom progress updatable only by the challenge creator (trainer)" — but the RLS policy description doesn't explicitly cover this UPDATE path

**Missing Acceptance Criteria:**
- No negative test criteria (verifying that unauthorized access is DENIED)
- No criterion for verifying RLS doesn't break the leaderboard RPC functions

**Implementation Risks:**
- Medium — RLS policies that are too restrictive will break RPCs; too permissive creates security holes
- SECURITY DEFINER functions bypass RLS, so any RPC that writes across tables needs this designation

---

### Issue #131 — Add TypeScript types for challenges and leaderboard

**Status:** Complete

**Missing Requirements:**
- Missing type for `ChallengeReward` (earned rewards per user per challenge)
- Missing type for `FreezeToken` usage tracking (if freeze tokens are in scope)
- No mention of API response wrapper types (e.g., `ChallengeDetailResponse` combining challenge + participants + leaderboard)

**Ambiguities:**
- Should types mirror the DB schema exactly, or include computed/derived fields (like `currentStreak`, `daysRemaining`)?
- Are `rank` and `progress` nullable on `ChallengeParticipant` type?

**Consistency Issues:**
- Types should match the table schemas from #128 and #129 exactly — but since #128 has ambiguities about table structure, the types may be built on incorrect assumptions

**Missing Acceptance Criteria:**
- No criterion verifying types align with actual migration columns
- No criterion for re-export from `src/types/index.ts`

**Implementation Risks:**
- Low — types are easily updated, but getting them wrong early cascades into service layer issues

---

### Issue #132 — Implement streak calculation function

**Status:** Mostly complete

**Missing Requirements:**
- No mention of timezone handling — "consecutive days" in which timezone? User's local time or UTC?
- Missing handling for the case where a user logs multiple workouts on the same day (should count as 1 day)
- No mention of how `category_filter` on the challenge template affects which workout_logs qualify
- Missing specification of return type (just an integer? or a record with streak + last_active_date?)

**Ambiguities:**
- "Gaps-and-islands" algorithm is named but not specified — does it use `ROW_NUMBER()` partitioning or recursive CTE?
- What constitutes a "workout" for streak purposes — any row in `workout_logs`, or only completed workouts?
- Does the streak function account for challenge start_date (ignoring workouts before the challenge started)?

**Consistency Issues:**
- Design doc mentions `gym_date` generated column (from #129) — the streak function should use this, but the dependency isn't explicit
- Freeze tokens appear in 6 issues including this one, but are explicitly excluded from the design doc

**Missing Acceptance Criteria:**
- No criterion for edge case: streak starting on the first day of the challenge
- No criterion for performance with large workout_logs tables
- No criterion for handling DST transitions

**Implementation Risks:**
- High — timezone bugs in streak calculation are extremely common and hard to catch in testing
- If `gym_date` uses UTC but users expect local time, streaks will break at midnight boundaries

---

### Issue #133 — Implement progress tracking trigger

**Status:** Has significant gaps

**Missing Requirements:**
- No specification of what `user_challenge_state` columns the trigger updates (because #128 may not create this table)
- Missing logic for `frequency` challenges — how does the trigger increment a counter? Reset daily/weekly/monthly?
- No mention of handling the case where a workout_log INSERT doesn't match any active challenge (early exit optimization)
- Missing specification of how the trigger identifies which challenges a user is participating in

**Ambiguities:**
- "Handles frequency + streak + freeze logic" — freeze tokens are not in the design doc. Remove or clarify.
- Does the trigger fire for ALL workout_log inserts or only for users who have active challenges?
- What happens if the trigger fails partway through (atomicity)?

**Consistency Issues:**
- References "freeze logic" but design doc explicitly excludes freeze tokens
- Depends on `user_challenge_state` table which may not exist per #128 analysis
- The design doc says progress is "computed on-the-fly" for leaderboard, but this trigger implies stored progress — these are two different things (trigger updates individual state; leaderboard computes rankings)

**Missing Acceptance Criteria:**
- No criterion for trigger performance impact on workout_log INSERT latency
- No criterion for idempotency (what if the same workout_log is somehow inserted twice?)
- No criterion for verifying Realtime broadcast works after trigger fires

**Implementation Risks:**
- High — this is the most complex piece. A trigger that's too slow degrades the workout logging experience.
- Race condition risk: if two workouts are logged simultaneously, the trigger needs proper isolation

---

### Issue #134 — Implement reset and completion functions

**Status:** Mostly complete with gaps

**Missing Requirements:**
- `reset_daily_challenges()` — what exactly gets reset? `user_challenge_state.current_progress`? What about streak challenges?
- Missing specification of what "completion" means for each challenge type (frequency: target reached; streak: maintained for full duration; custom: trainer marks complete)
- No mention of reward generation on completion (linking to `challenge_rewards` table)
- Missing `refresh_leaderboard_snapshot()` implementation details — is it a full table replacement or incremental update?

**Ambiguities:**
- "Reset" for streak challenges — does reset mean the streak counter goes to 0, or does the challenge become available again for a new cadence?
- What's the difference between "expired" and "completed"? Expired = end_date passed without reaching target? Completed = target reached?

**Consistency Issues:**
- Function names imply cadence-based resets (`reset_daily`, `reset_weekly`, `reset_monthly`) but the challenge table has a single `cadence` field — the functions should filter by cadence value, not be separate functions per cadence

**Missing Acceptance Criteria:**
- No criterion for verifying reset functions don't affect challenges in other cadences
- No criterion for completion reward generation
- No criterion for handling challenges where no participant reached the target

**Implementation Risks:**
- Medium — reset logic is straightforward but edge cases around timezone boundaries can cause issues
- The leaderboard refresh function needs careful consideration of concurrent reads during refresh

---

### Issue #135 — Configure pg_cron scheduled jobs

**Status:** Complete but has a prerequisite issue

**Missing Requirements:**
- No mention of how pg_cron is enabled on Supabase (it requires enabling the extension)
- Missing monitoring/alerting for failed cron jobs
- No mention of what happens if a cron job takes longer than its interval (overlap protection)

**Ambiguities:**
- "30min leaderboard refresh" — is this the right interval? Could be too frequent for small user bases or too infrequent for active ones
- Which timezone are daily/weekly/monthly resets relative to?

**Consistency Issues:**
- Depends on functions from #134 existing and being correct
- The design doc doesn't specify exact cron schedules — this issue should define them

**Missing Acceptance Criteria:**
- No criterion for verifying cron jobs are actually running (health check)
- No criterion for timezone correctness of reset schedules

**Implementation Risks:**
- Low — pg_cron is well-established on Supabase
- Risk: if timezone is wrong, daily resets happen at the wrong time for users

---

### Issue #136 — Implement challenge discovery service

**Status:** Mostly complete with design gaps

**Missing Requirements:**
- No specification of how `getDiscoveryPool()` filters challenges — by cadence? by user's connected trainer? by category?
- Missing cooldown logic implementation details — where is cooldown state stored? How is it checked?
- No mention of `limit_reached` state — what limit? How many challenges can a user have active simultaneously?
- Missing error handling specification for edge cases (no challenges available, user not connected to any trainer)

**Ambiguities:**
- "Discovery pool" — is this ALL available challenges from ALL connected trainers, or scoped per trainer?
- `pickChallenge()` — does this randomly select, or present the user's choice? The name implies automatic selection but the UI (#141) shows manual browsing
- `getUserChallengeState()` — what state? Active challenge count? Cooldown timers? Available slots?

**Consistency Issues:**
- The function `pickChallenge()` implies the system picks for the user, but the Discovery UI (#141) shows users browsing and choosing — naming mismatch
- Design doc describes a "daily/weekly/monthly sections" layout which implies challenges are pre-categorized, not randomly picked

**Missing Acceptance Criteria:**
- No criterion for verifying cooldown enforcement
- No criterion for concurrent limit enforcement
- No criterion for what happens when a user's trainer creates a new challenge mid-session

**Implementation Risks:**
- Medium — the discovery pool logic determines the entire challenge UX flow
- If cooldown/limit logic is wrong, users either run out of challenges or get overwhelmed

---

### Issue #137 — Implement my-challenges service

**Status:** Complete with minor gaps

**Missing Requirements:**
- `abandonChallenge()` — what are the consequences? Does it count as a loss? Does it affect leaderboard points?
- `reportProgress()` — for which challenge types? Only custom? Or can users self-report for frequency too?
- Missing `getCompletedChallenges()` or similar for history view
- No mention of how "paused" state works (can users pause challenges?)

**Ambiguities:**
- "Abandon" vs "give up" — are these the same action? Different UI labels for same backend operation?
- Self-reporting: design doc says trainer updates custom challenge progress, but issue says `reportProgress()` is a client action

**Consistency Issues:**
- Design doc says custom progress is "updatable only by the challenge creator (trainer)" — but `reportProgress()` in this service implies client self-reporting
- The My Challenges UI (#143) mentions "self-report button" and "give-up action" — these should map to service functions here

**Missing Acceptance Criteria:**
- No criterion for abandon validation (can you abandon a completed challenge?)
- No criterion for progress bounds checking (can progress exceed target?)

**Implementation Risks:**
- Low — CRUD operations on challenge participation
- Risk: if abandon/give-up has different implementations than designed, UI will be inconsistent

---

### Issue #138 — Implement leaderboard service

**Status:** Complete

**Missing Requirements:**
- No mention of time-range filtering (weekly leaderboard, monthly leaderboard, all-time)
- Missing specification of how ties are broken
- No mention of leaderboard visibility rules (can users see everyone or only their trainer's clients?)

**Ambiguities:**
- `getLeaderboard()` — of what? Overall app? Per-challenge? Per-trainer's clients?
- `getLeaderboardHistory()` — what format? Time series of a user's rank? Snapshots of full leaderboard at different times?
- `getUserRank()` — rank in which context?

**Consistency Issues:**
- Design doc describes both "challenge leaderboard" (within a challenge) and "global leaderboard" (points across all challenges) — this issue doesn't distinguish between them

**Missing Acceptance Criteria:**
- No criterion for performance with large user counts
- No criterion for correct tie-breaking
- No criterion for real-time update subscription

**Implementation Risks:**
- Medium — leaderboard queries can be expensive if not properly indexed
- The distinction between challenge-specific and global leaderboard needs to be clear

---

### Issue #139 — Implement trainer challenge service

**Status:** Mostly complete

**Missing Requirements:**
- `createTrainerChallenge()` — no mention of participant selection/invitation during creation
- Missing `assignChallengeToClients()` or similar for post-creation participant management
- No mention of how trainer templates interact with the challenge instantiation flow
- Missing specification of per-client customization logic (different targets for different clients)

**Ambiguities:**
- "Save trainer template" vs "create challenge" — what's the workflow? Template first, then instantiate? Or create challenge directly?
- Per-client customization: does this create multiple challenges (one per client) or one challenge with per-participant targets?

**Consistency Issues:**
- Design doc has `trainer_challenge_templates` table for templates + `challenges` table for instances — but the issue doesn't clarify the instantiation mechanism (how does a template become active challenges?)
- The plan mentions `challenge_templates` (system-wide) AND `trainer_challenge_templates` (custom) — this issue should clarify which it manages

**Missing Acceptance Criteria:**
- No criterion for validating challenge dates (end > start, start >= today)
- No criterion for maximum participant count
- No criterion for template versioning (what happens if trainer edits a template that has active challenges?)

**Implementation Risks:**
- Medium — the template-to-challenge instantiation flow is the least specified part of the design
- If per-client customization creates separate challenges vs. one challenge with variable targets, the entire data model is different

---

### Issue #140 — Add Challenges tab to bottom navigation

**Status:** Complete with one contradiction

**Missing Requirements:**
- No mention of badge/notification dot on the tab icon when new challenges are available
- Missing specification of initial selected sub-view (Discovery? My Challenges? Leaderboard?)

**Ambiguities:**
- "Three-way toggle shell" — is this a segmented control at the top? Tab bar within the tab? Swipeable views?
- The _layout.tsx already has 5 tabs with role-based visibility — does this add a 6th or replace one?

**Consistency Issues:**
- Current `_layout.tsx` already has 5 tabs (including a messages tab) — adding a 6th challenges tab contradicts the plan that said "5th tab: Challenges"
- Need to verify if the current 5th tab is messages or something else that should be replaced/moved

**Missing Acceptance Criteria:**
- No criterion for tab visibility (both roles see it? or only clients?)
- No criterion for accessibility labels on the toggle
- No criterion for deep-link support (opening app directly to challenges tab)

**Implementation Risks:**
- Low — tab navigation is straightforward in Expo Router
- Risk: if the tab layout is already at 5 tabs, adding a 6th might need design reconsideration

---

### Issue #141 — Build Discovery sub-view

**Status:** Mostly complete

**Missing Requirements:**
- No mention of empty state (no challenges available in any category)
- Missing pull-to-refresh behavior
- No specification of challenge card design (what info is shown: title, difficulty, reward type, participants count?)
- Missing "already joined" state for challenges the user is already participating in

**Ambiguities:**
- "Daily/weekly/monthly sections" — are these collapsible? Always visible? What if a section is empty?
- "Card states (available/cooldown/limit_reached)" — how does the user know WHEN cooldown ends? Is there a timer?
- How does the user navigate from discovery card to challenge detail?

**Consistency Issues:**
- Discovery shows challenges by cadence, but challenge detail (#142) is a separate screen — navigation flow needs to be explicit
- The service (#136) has `pickChallenge()` but the UI shows manual browsing — the UI should call a different service function

**Missing Acceptance Criteria:**
- No criterion for skeleton loading states
- No criterion for real-time update when new challenges become available
- No criterion for maximum number of challenges shown per section

**Implementation Risks:**
- Low — standard list/card UI pattern
- Risk: if the discovery pool is empty, the tab feels useless — needs compelling empty state

---

### Issue #142 — Build Challenge Detail screen

**Status:** Complete with minor gaps

**Missing Requirements:**
- No mention of participant list display (who else is in this challenge?)
- Missing "leave challenge" / "abandon" button for already-joined challenges
- No specification of progress visualization (progress bar? percentage? fraction?)
- Missing reward preview (what do you win?)

**Ambiguities:**
- "Accept button" — is this for joining? Starting? Or both?
- Does the detail screen look different for an active challenge vs. a not-yet-joined challenge?
- Countdown timer: countdown to what? Start date? End date? Both?

**Consistency Issues:**
- This screen serves dual purpose: preview (before joining) and tracking (after joining) — should these be different views or same screen with conditional sections?

**Missing Acceptance Criteria:**
- No criterion for deep-linking to challenge detail from notifications
- No criterion for handling challenge that completes while user is viewing detail

**Implementation Risks:**
- Low — detail screens are standard pattern in the app
- Risk: if the screen tries to do too much (preview + active tracking + completed results), it becomes complex

---

### Issue #143 — Build My Challenges sub-view with Comeback Card

**Status:** Mostly complete

**Missing Requirements:**
- "Comeback Card" — no specification of what this is. Is it a card shown after streak break offering to restart?
- Missing specification of how "paused" state is displayed and how user resumes
- No mention of completed challenges history in this view (or is that a separate screen?)
- Missing sorting/ordering logic (most urgent first? newest first? closest to completion?)

**Ambiguities:**
- "Streak comeback UX" — this implies a UX flow for recovering from a broken streak, but the design doc says progress resets to 0 on streak break. What does "comeback" mean then?
- "Self-report button" — for custom challenges? All challenges? When does it appear?
- "Give-up action" — does this require confirmation? What are the consequences?

**Consistency Issues:**
- "Comeback Card" and "streak comeback UX" reference something not defined in the design doc — may be from the earlier brainstorming session about streak reset UX
- The design doc's streak reset says progress goes to 0 — "comeback" implies some recovery mechanism that contradicts this

**Missing Acceptance Criteria:**
- No criterion for maximum number of active challenges shown
- No criterion for progress card accessibility (screen reader support)
- No criterion for give-up confirmation dialog

**Implementation Risks:**
- Medium — "Comeback Card" is undefined and could be misimplemented
- The streak comeback UX was brainstormed but may not have been finalized in the design doc

---

### Issue #144 — Build Leaderboard sub-view with confetti

**Status:** Complete

**Missing Requirements:**
- No mention of when confetti triggers (only on first view of new rank? every time user views their rank?)
- Missing specification of podium design (top 3 layout)
- No mention of leaderboard scope toggle (per-trainer? global? per-challenge?)
- Missing "your rank" highlight behavior when user scrolls the list

**Ambiguities:**
- `react-native-confetti-cannon` — is this a hard dependency? What if it doesn't work on web?
- "#4-100 list" — what if there are fewer than 100 users? Or more?
- "Own rank" section — is this always visible (pinned) even when scrolling?

**Consistency Issues:**
- The confetti is also mentioned in a "celebration modal" concept — are these the same confetti or different events?
- Design doc mentions celebration screen for challenge completion — is that this leaderboard view or a separate modal?

**Missing Acceptance Criteria:**
- No criterion for confetti performance (doesn't cause jank)
- No criterion for web platform compatibility
- No criterion for accessibility (reduced motion preference)

**Implementation Risks:**
- Low for basic leaderboard, medium for confetti (animation libraries can be platform-specific)
- `react-native-confetti-cannon` may not support Expo web — needs verification

---

### Issue #145 — Build Trainer Challenge Builder screen

**Status:** Mostly complete

**Missing Requirements:**
- No mention of reward configuration UI (setting up badges, discount codes, battle pass tiers)
- Missing preview/summary step before creating the challenge
- No mention of date picker UI for start/end dates
- Missing validation UX (inline errors vs. submission errors)
- No mention of saving as template vs. creating directly

**Ambiguities:**
- "Block selection" — what are the blocks? Challenge type? Cadence? Target? This UI metaphor isn't defined
- "Per-client customization" — how is this presented? A table? Individual cards? Sliders?
- "Params" — which parameters? All of them? Or contextual based on selected type?

**Consistency Issues:**
- The issue mentions "templates" but the builder screen creates challenges — template saving should be a secondary action, not the primary flow

**Missing Acceptance Criteria:**
- No criterion for form validation rules
- No criterion for maximum number of participants selectable
- No criterion for date range validation (minimum duration?)
- No criterion for saving drafts

**Implementation Risks:**
- High — complex multi-step form with conditional fields
- Per-client customization UI is the most complex part and least specified

---

### Issue #146 — Build Trainer Challenge Management screen

**Status:** Complete with minor gaps

**Missing Requirements:**
- No mention of bulk actions (complete all expired, archive old challenges)
- Missing progress visualization per client (bar chart? percentage? raw numbers?)
- No mention of editing an active challenge (can trainer modify target mid-challenge?)
- Missing notification triggers (can trainer send nudge to participants?)

**Ambiguities:**
- "Per-client progress" — how detailed? Just a number? Or full history?
- "Expired/completed sections" — are these separate tabs within the management screen or inline sections?

**Consistency Issues:**
- This screen overlaps with the challenge detail screen (#142) — for trainers viewing their own challenge, which screen do they see?

**Missing Acceptance Criteria:**
- No criterion for handling many challenges (pagination? infinite scroll?)
- No criterion for completing a challenge manually (before end date)

**Implementation Risks:**
- Low — standard management list pattern
- Risk: scope creep if trainer wants editing capabilities for active challenges

---

### Issue #147 — Add i18n strings (EN + BG) for all challenge screens

**Status:** Complete but depends on all UI issues

**Missing Requirements:**
- No mention of pluralization rules (especially for Bulgarian which has different plural forms)
- Missing dynamic interpolation patterns (`{count} workouts`, `{days} days remaining`)
- No mention of date/time formatting localization for challenge dates
- Missing error message strings (network errors, validation errors)

**Ambiguities:**
- Should i18n be done per-screen or all at once? The issue implies all at once, but that means waiting for all UI to be designed
- Bulgarian translations — who provides them? Are they machine-translated or human-reviewed?

**Consistency Issues:**
- Existing i18n uses `replaceAll({key}, v)` pattern for interpolation — new strings should follow this
- Key naming convention should follow existing patterns (e.g., `challenges.discovery.title`, `challenges.builder.field.name`)

**Missing Acceptance Criteria:**
- No criterion for verifying all screens render correctly in both languages
- No criterion for text truncation testing (Bulgarian is often longer than English)
- No criterion for RTL support (not needed for EN/BG but good to note)

**Implementation Risks:**
- Low — i18n is straightforward
- Risk: if done before UI is finalized, keys may need renaming/restructuring

---

### Issue #148 — Add workout categories to workout_logs

**Status:** Mostly complete

**Missing Requirements:**
- No specification of the category enum values (what are the actual categories? strength, cardio, flexibility, etc.)
- Missing migration for existing rows — what category do existing workout_logs get?
- No mention of how category is set during workout logging (automatic from workout template? user selection?)
- Missing UI changes to the workout logging flow to capture category

**Ambiguities:**
- "Column/enum" — is this a PostgreSQL enum type or a text column with CHECK constraint?
- Is category required (NOT NULL) or optional (nullable)?
- Can a workout have multiple categories or only one?

**Consistency Issues:**
- This issue is marked as independent but the streak/frequency trigger (#133) needs to filter by category — so there IS a dependency
- The existing `save_workout` RPC in `workoutService.ts` would need to accept a category parameter

**Missing Acceptance Criteria:**
- No criterion for backward compatibility (existing workout logging must still work)
- No criterion for category list being extensible (can trainer add custom categories?)
- No criterion for category display in workout history

**Implementation Risks:**
- Medium — adding a column is easy, but retrofitting category selection into the existing workout logging UI requires careful UX work
- If category is required, existing logging flows break until UI is updated

---

## Cross-Cutting Issues

### 1. Freeze Tokens Referenced but Not in Design Doc

**Severity:** High — Design Contradiction

Issues #132, #133, #134, #136, #137, #143 all reference "freeze tokens" or "freeze logic" in various capacities. However, the design doc (`Documentation/Gamification.md`) does NOT include freeze tokens in the v1 scope.

**Recommendation:** Either:
- Remove all freeze token references from the 6 issues, OR
- Add freeze tokens to the design doc with full specification before implementation

### 2. `user_challenge_state` vs `challenge_participants` Confusion

**Severity:** High — Structural Ambiguity

The design doc describes two tables:
- `challenge_participants` — who joined which challenge, their rank, basic progress
- `user_challenge_state` — per-cadence state tracking (current streak, daily progress, frozen status)

Multiple issues conflate these or reference only one. The trigger (#133) and reset functions (#134) need `user_challenge_state` but it's unclear if #128 creates it.

**Recommendation:** Issue #128 must explicitly define BOTH tables with clear column lists. All dependent issues should reference the correct table.

### 3. Challenge Instantiation Mechanism Undefined

**Severity:** High — Missing Workflow

The design has `challenge_templates` (system-defined) and `trainer_challenge_templates` (custom), but NO issue explicitly covers how a template becomes an active `challenges` row with `challenge_participants`. This is the core workflow:

1. Template exists
2. System/trainer instantiates a challenge from template (for a specific cadence period)
3. Participants are enrolled/join
4. Progress is tracked

Step 2 is never explicitly specified. Is it automatic (cron creates daily challenges from templates)? Manual (trainer clicks "start challenge")? Both?

**Recommendation:** Add specification to either #134 (reset/completion functions) or create a new issue for challenge instantiation logic.

### 4. Cadence vs Status Value Contradictions

**Severity:** Medium — Enum Misalignment

- Design doc `cadence` values: `daily`, `weekly`, `monthly`
- Issue #128 `status` values: `upcoming`, `active`, `completed`
- Design doc also implies `expired` as a status (distinct from completed)
- Some issues use `challenge_type` where they mean `cadence`

**Recommendation:** Create a clear enum reference table in the design doc:
- `challenge_type`: `frequency`, `streak`, `custom`
- `cadence`: `daily`, `weekly`, `monthly`
- `status`: `upcoming`, `active`, `completed`, `expired`

### 5. Default Tab Sub-View Not Specified

**Severity:** Low — UX Gap

Issue #140 creates a "three-way toggle" but doesn't specify which sub-view is shown by default when the user opens the Challenges tab. This affects first-impression UX.

**Recommendation:** Default to "My Challenges" for returning users (who have active challenges) and "Discovery" for new users (who have no active challenges).

### 6. Celebration/Confetti Trigger Ambiguity

**Severity:** Low — UX Duplication Risk

Both the "Leaderboard sub-view" (#144) and the design doc's "Celebration modal" concept reference confetti. It's unclear:
- Is there a separate celebration modal that appears when a challenge completes?
- Does the leaderboard confetti fire only on rank changes?
- Are these the same confetti library instance or different?

**Recommendation:** Define ONE celebration trigger (challenge completion) and ONE rank-change animation (leaderboard podium). These should be different UX moments with different animations.

### 7. Real-Time Update Mechanism Underspecified

**Severity:** Medium — Architecture Gap

Multiple issues mention "real-time" but the actual mechanism is only partially specified:
- Trigger on `workout_logs` broadcasts to a channel (#133)
- Leaderboard screens subscribe to refresh (#144)
- But: who subscribes to what channel? What's the payload? How do clients know to re-fetch?

**Recommendation:** Define the Supabase Realtime channel naming convention (e.g., `challenge:{challengeId}`) and payload structure before implementing the trigger.

### 8. Reward Generation Not Connected to Completion

**Severity:** Medium — Missing Link

Issue #134 (completion functions) doesn't specify reward generation. The design doc has a `challenge_rewards` table with badges, discount codes, etc., but no issue covers the logic that:
1. Determines winners/tier earners
2. Generates discount codes
3. Creates `challenge_rewards` rows
4. Notifies winners

**Recommendation:** Add reward generation logic to issue #134 or create a dedicated issue for the reward distribution flow.

---

## Summary Scoring Table

| Issue | Completeness | Risk | Priority Fix |
|-------|-------------|------|-------------|
| #128 Core Tables | 70% | High | Clarify user_challenge_state, cadence vs type |
| #129 Leaderboard Tables | 90% | Low | Minor — add retention policy |
| #130 RLS Policies | 75% | Medium | Add SECURITY DEFINER, negative tests |
| #131 TypeScript Types | 85% | Low | Align with final table schemas |
| #132 Streak Function | 75% | High | Timezone handling, category filter |
| #133 Progress Trigger | 60% | High | Remove freeze refs, specify target table |
| #134 Reset/Completion | 70% | High | Add reward generation, instantiation |
| #135 pg_cron | 85% | Low | Enable extension, timezone note |
| #136 Discovery Service | 70% | Medium | Clarify pool logic, rename pickChallenge |
| #137 My Challenges Service | 80% | Low | Clarify self-report scope |
| #138 Leaderboard Service | 75% | Medium | Distinguish challenge vs global LB |
| #139 Trainer Service | 70% | Medium | Define instantiation mechanism |
| #140 Tab Navigation | 85% | Low | Verify tab count, default sub-view |
| #141 Discovery View | 80% | Low | Add empty states, card design spec |
| #142 Challenge Detail | 80% | Low | Dual-purpose view clarification |
| #143 My Challenges View | 65% | Medium | Define Comeback Card, remove streak recovery contradiction |
| #144 Leaderboard View | 80% | Low | Confetti trigger rules, web compat |
| #145 Trainer Builder | 65% | High | Block selection undefined, reward config UI |
| #146 Trainer Management | 80% | Low | Standard CRUD, minor gaps |
| #147 i18n Strings | 85% | Low | Depends on UI finalization |
| #148 Workout Categories | 75% | Medium | Enum values, migration strategy, UI changes |

---

## Recommendations (Priority Order)

1. **Resolve freeze token scope** — Remove from all 6 issues or add to design doc
2. **Clarify table structure** — Explicitly define `user_challenge_state` in #128 with all columns
3. **Define challenge instantiation** — How templates become active challenges
4. **Specify timezone handling** — For streaks, resets, and date boundaries
5. **Define enum values** — Create authoritative list of all valid values for type/cadence/status
6. **Specify real-time channel structure** — Channel names, payloads, subscription patterns
7. **Connect reward generation to completion** — Add to #134 or create new issue
8. **Define Comeback Card** — Specify what this UI element is and when it appears
