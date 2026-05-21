# AI-Assisted Design Collaboration Guide

## How Aleksandar & Claude Work Together on Feature Design

This document captures the **process and methodology** used to design the Gamification system (Issue #28). The goal is to show Georgi how to replicate this workflow with Claude for his own design sessions.

---

## The Process (Step by Step)

### 1. Start with a Design Draft

Before the AI session, have a written design draft — even rough. Georgi's `issue-28-challenges-design-draft.md` was the starting point. Claude reads it and understands the existing decisions.

### 2. AI Reviews the Draft

Claude is asked to review the draft and flag:
- Scalability concerns
- Missing edge cases
- Architectural gaps
- Contradictions or unclear requirements

### 3. Break Into Topics

The design gets decomposed into discrete topics. Each topic is discussed **one at a time** — no jumping ahead. This prevents decision overload and keeps each topic focused.

Our topic order was:
1. Scope & Architecture (platform vs trainer challenges)
2. Challenge Types (frequency, streak, custom)
3. Auto-tracked Progress (triggers, caching, 4AM boundary)
4. Enrollment Model & Visibility (who sees what)
5. Real-time Updates (decided: none needed)
6. Challenge Completion & Rewards
7. Celebration Screen
8. ...and so on

### 4. For Each Topic: Present → Decide → Document → Push

The cycle for every topic:

```
Claude presents the topic:
  - What needs deciding
  - 2-3 options with trade-offs
  - Recommendation and why

User decides:
  - Picks an option (or proposes their own)
  - Answers edge case questions
  - Adds constraints ("also, the leaderboard should only show top 100")

Claude documents:
  - Updates the design doc with the decision
  - Formats as a decision table
  - Commits and pushes to the PR

Move to next topic.
```

---

## Key Principles

| Principle | Why |
|-----------|-----|
| One topic at a time | Prevents decision fatigue, keeps context focused |
| Always present options | Forces explicit trade-off thinking, not just "what feels right" |
| Document immediately | Decisions drift if not written down in the same session |
| Push after each topic | Creates a trail, enables async review |
| Challenge the AI's assumptions | When Claude says "we need X", ask "do we?" |
| Scale-test every decision | "This works for 30 users. What about 10k?" |

---

## Example Session: Topic 1 — Scope & Architecture

This shows the full back-and-forth for the most important topic (deciding the challenge system's fundamental architecture).

---

### Claude's Opening

> **Claude:** Good question. Here are the edge cases and concerns for a dual-mode challenges system (user self-challenges + trainer-assigned challenges):
>
> **Edge Cases & Concerns**
>
> **1. Point Economy Fairness**
> - Clients with trainers get MORE challenge opportunities (platform + trainer challenges)
> - Solo users only have platform challenges
> - This creates an unfair leaderboard advantage for coached users
>
> **Options:**
> - A) Trainer challenges don't award leaderboard points (separate reward track)
> - B) Cap total points per period regardless of source
> - C) Accept the imbalance (coached users pay for the advantage)
>
> **2. Overlapping Challenges**
> - User has a platform "20 workouts this month" AND trainer assigns "15 workouts this month"
> - Does a single workout count toward both? Or must they be separate?
>
> **3. Discovery vs Assignment**
> - Platform challenges: How does the user find them? Feed? Rotating pool? Recommended?
> - Trainer challenges: Auto-enrolled? Invitation the client accepts/rejects?
>
> **4. Challenge Creation: Who designs what?**
> - Platform challenges: We (the app team) create them. Pre-designed, curated, rotating.
> - Trainer challenges: Trainer creates custom ones? Or picks from a template library?
>
> **What's your preference on the fairness question (#1)?** That one shapes everything else.

---

### Aleksandar's Response

> **Aleksandar:** We will go with option A. The trainer challenges won't get any points. Let's move to topic 2.

---

### What Happened Here

1. Claude identified 4 edge cases from the user's initial decision
2. For the most impactful one (fairness), presented 3 concrete options
3. User made a clear decision (Option A)
4. No ambiguity — the decision is documented exactly

---

## Example Session: Topic 3 — Auto-tracked Progress & Scalability

This shows how a "works fine at small scale" assumption gets challenged and resolved.

---

### Claude's Opening

> **Claude:** At 10k users, compute-on-read breaks down fast. Here's why and what I'd suggest:
>
> **The Problem at Scale**
>
> **Leaderboard:** 10k users, each with accumulated points from completed challenges. If you compute rankings on every leaderboard open: `SELECT user_id, SUM(points) ... GROUP BY ... ORDER BY ... LIMIT 100` — that's a full table scan on every read. With 10k users and multiple active challenges each, this is ~50k rows in `challenge_participants` being aggregated.
>
> **Individual progress:** Computing "how many workouts did user X log between date A and date B where category = legs" on every screen open — fine for 1 user, but if 500 users open the challenges tab in the same minute, that's 500 concurrent COUNT queries against `workout_logs`.
>
> **The Solution: Hybrid (Cached + Triggered)**
>
> | Component | Approach |
> |-----------|----------|
> | Challenge progress | `current_progress` column on `challenge_participants`, updated by a Postgres trigger on `workout_logs` INSERT |
> | Leaderboard | Snapshot table (`leaderboard_snapshot`) refreshed every 30-60 min by pg_cron |
> | User's own rank | On-demand: `SELECT COUNT(*) FROM profiles WHERE leaderboard_points > $my_points` (single indexed query) |
>
> **Why this works:**
> - Write cost per workout: trigger updates 3-5 rows (user's active challenges). Cheap.
> - Read cost for progress: pre-computed column. O(1).
> - Read cost for leaderboard: static table read. No computation.
> - Streak calculation: computed once per workout via trigger, not on every screen open.

---

### Aleksandar's Response

> **Aleksandar:** I think it works for me however a small detail, the leaderboard won't be listing all 10k or whatever K of users, just the top 100. And you calculate the position of the user viewing it based on his points vs the rest. Maybe only the top 100 can be cached and only for 30-60 min, it doesn't have to be realtime.

---

### Claude's Follow-up

> **Claude:** Right. So the leaderboard is:
>
> - **Top 100 only**
> - **Refreshes on a cadence** (not real-time, not on every request)
>
> This makes it even simpler. Instead of computing on every read OR maintaining a full sorted list:
>
> **Leaderboard approach:**
> 1. `leaderboard_snapshot` table stores top 100 users (name + points)
> 2. Refreshed every 30-60 min by pg_cron or a scheduled Edge Function
> 3. Reading the leaderboard = `SELECT * FROM leaderboard_snapshot ORDER BY points DESC`
> 4. User's own position (if not in top 100) = `SELECT COUNT(*) FROM profiles WHERE leaderboard_points > $my_points` — single indexed query, instant
>
> **Points source:** A `leaderboard_points` column on `profiles`, incremented when a platform challenge is completed (via the `complete_challenge` RPC).
>
> **Monthly reset:** A scheduled function zeros all `leaderboard_points` and optionally archives to `leaderboard_history`.

---

### What Happened Here

1. Claude presented the scalability problem with the original design (compute-on-read)
2. Proposed a concrete alternative with a decision table
3. User accepted but added a constraint ("only top 100, not all users")
4. Claude refined the solution to incorporate the constraint
5. Both sides contributed to the final design

---

## Example Session: Topic 5 — Real-time Updates

This shows how to eliminate unnecessary complexity.

---

### Claude's Opening

> **Claude:** Topic 5: Real-time Leaderboard.
>
> Based on Topic 3, we decided the leaderboard is a cached snapshot refreshing every 30-60 minutes — not real-time.
>
> Georgi's original design uses **Supabase Realtime** (like chat) for leaderboard updates. Given our decisions, do we still need any real-time component for challenges?
>
> **Three things that COULD be real-time:**
>
> | What | Real-time needed? | Alternative |
> |------|-------------------|-------------|
> | Global leaderboard | No — snapshot refreshes every 30-60 min | Pull on screen focus |
> | User's own challenge progress | Debatable — updated by trigger, could push to client | Pull on screen focus |
> | Other users' challenge progress | No — not visible per visibility rules | N/A |
>
> **My recommendation:** No Supabase Realtime for challenges at all. The existing `useFocusAsyncData` pattern (re-fetch when screen gets focus) handles all three cases. Saves complexity — no channel management, no broadcast triggers, no subscription lifecycle.
>
> The only place Realtime makes sense in this app is **chat** (instant message delivery). Challenges don't need that immediacy.

---

### Aleksandar's Response

> **Aleksandar:** [Agreed — no real-time for challenges. Pull-based refresh on screen focus is sufficient.]

---

### What Happened Here

1. Claude connected the dots from previous decisions (cached leaderboard from Topic 3)
2. Presented a table showing what COULD be real-time vs what actually needs to be
3. Made a clear recommendation: eliminate the complexity
4. User agreed — one-line decision, no debate needed
5. Complexity removed from the system before a single line of code was written

---

## Anti-Patterns to Avoid

| Don't Do This | Do This Instead |
|---------------|-----------------|
| Discuss everything at once | One topic per message |
| Accept AI's first suggestion blindly | Ask "what about at 10k users?" or "what's the trade-off?" |
| Leave decisions in chat only | Write them to the design doc immediately |
| Skip edge cases | Let AI enumerate them, then decide on each |
| Design in code | Design in docs first, code second |
| Let the AI write code during design | Keep it in "thinking mode" — no implementation until design is approved |

---

## How to Start Your Own Session

```
You: "I have a design for [feature]. Review it and tell me what concerns you have."

Claude: [Reviews, lists concerns, proposes topics to discuss]

You: "Let's discuss [topic 1] first. What are the options?"

Claude: [Presents 2-3 options with trade-offs, recommends one]

You: "Go with option B, but also [constraint]."

Claude: [Documents decision, asks clarifying edge cases if needed]

You: "Next topic."

[Repeat until all topics are covered]

You: "Write up all decisions in a design doc and raise a PR."
```

---

## Tools Used

- **Claude Code CLI** — The AI assistant (running in terminal)
- **GitHub PR** — Decisions tracked as incremental commits on a branch
- **Design doc** — Single markdown file capturing all decisions in structured tables
- **Brainstorming skill** — Claude's built-in skill for structured design discussions

---

## Files Referenced

- `Documentation/Gamification.md` — The output design doc (PR #125)
- `Documentation/issue-28-challenges-design-draft.md` — Georgi's original draft (input)
- This file — Process documentation for replication

---

*Last updated: 2026-05-21*
