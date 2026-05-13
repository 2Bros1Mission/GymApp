# GymApp Roadmap

## Product Vision

A bilingual (Bulgarian/English) mobile fitness app that connects personal trainers with their clients while also allowing trainers to publish public workout programs. The app tracks workouts, logs sets/reps/weights, monitors streaks, and provides progress analytics.

**Trainer Model:** Hybrid — trainers can manage individual clients (1-to-1 personal coaching) AND publish programs that any user can follow (1-to-many public content).

**Communication:** Async feedback/notes on workouts first, full in-app messaging planned for a later phase.

**Monetization:** Deferred — build the best experience first, decide on revenue model later.

## Tech Stack

- **Frontend:** React Native (Expo SDK 54), TypeScript, expo-router v6
- **Backend:** Supabase (Auth + PostgreSQL with Row Level Security)
- **State:** React Context + local state
- **i18n:** Custom translation system (BG + EN)

## Phase Breakdown

### Phase 1: Quality & Stability

Fix bugs and establish code quality foundations before adding features.

**Focus areas:**
- Fix i18n reactivity and hardcoded strings
- Make workout saving atomic (prevent partial data)
- Fix broken UI buttons (forgot password, profile settings)
- Set up testing infrastructure (Jest + RNTL)
- Add loading states, input validation, error feedback
- Remove dead code

### Phase 2: Profile & UX Polish

Complete the user-facing features that are currently placeholders.

**Focus areas:**
- Edit Profile screen (name, weight, height, goal)
- Dark theme support
- Push notifications (workout reminders, streak alerts)
- Help/Terms static pages
- Offline handling with graceful degradation

### Phase 3: Trainer Core

Build the trainer platform — the main differentiator.

**Focus areas:**
- Client-trainer relationship (invite code linking, DB schema, RLS policies)
- Trainer dashboard (client count, activity overview, pending invites)
- Client progress monitoring (view client workout history, streaks, body metrics)
- Custom workout builder (exercises, sets, reps, rest, difficulty)
- Workout assignment (assign programs to specific clients, track completion)
- Public workout programs (publish for any user to follow)
- Workout feedback/notes (trainer comments on completed workouts)
- Client goal setting (targets for weight, reps, frequency)

### Phase 4: Differentiators (Future)

Features that would set GymApp apart from competitors.

**Focus areas:**
- Video form checks — client attaches video to sets, trainer provides technique feedback
- AI-powered programming — analyze logged performance, suggest progressive overload / deload weeks
- Holistic tracking — nutrition logging (macros, calories) + sleep/recovery tracking
- Gamification — challenges between clients, leaderboards, achievements, badges
- Custom workouts for all users (not just trainers)
- In-app messaging (real-time chat between trainer and client)

## Architecture Decisions

### Database (Supabase PostgreSQL)

**Current schema:** `profiles`, `workout_logs`, `exercise_logs`, `set_logs`, `body_metrics`

**Planned additions for trainer features:**
- `trainer_clients` — relationship table (trainer_id, client_id, status, connected_at)
- `custom_workouts` — trainer-created templates (creator_id, name, exercises, difficulty, is_public)
- `workout_assignments` — assigned workouts (trainer_id, client_id, workout_id, due_date, status)
- `workout_feedback` — trainer notes on completed workouts (workout_log_id, trainer_id, message)
- `client_goals` — targets set by trainer (client_id, trainer_id, type, target_value, deadline)

**RLS Strategy for trainer-client access:**
- Trainers can READ their connected clients' workout_logs, exercise_logs, set_logs, body_metrics
- Trainers can WRITE to workout_assignments, workout_feedback, client_goals for their clients
- Public workouts are readable by all authenticated users
- Clients can only see their own trainer (not other trainers' data)

### Conditional Navigation

The tab layout will conditionally render based on `profile.role`:
- **Client tabs:** Home, Workouts, Progress, Profile
- **Trainer tabs:** Dashboard, Clients, Programs, Profile

Both roles share the Profile tab. Trainer-specific screens live in a separate route group.

### Invite-Based Linking

Trainers generate invite codes. Clients enter the code to connect. This avoids the complexity of search/discovery and keeps the MVP simple. Future: QR codes, shareable links.
