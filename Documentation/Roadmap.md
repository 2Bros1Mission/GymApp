# GymApp Roadmap

## Product Vision

A bilingual (Bulgarian/English) mobile fitness app that connects personal trainers with their clients while also allowing trainers to publish public workout programs. The app tracks workouts, logs sets/reps/weights, monitors streaks, and provides progress analytics.

**Trainer Model:** Hybrid — trainers can manage individual clients (1-to-1 personal coaching) AND publish programs that any user can follow (1-to-many public content).

**Communication:** Full in-app messaging between trainers and clients, plus async workout feedback.

**Monetization:** Deferred — build the best experience first, decide on revenue model later.

## Tech Stack

- **Frontend:** React Native (Expo SDK 54), TypeScript, expo-router v6
- **Backend:** Supabase (Auth + PostgreSQL with Row Level Security + Realtime)
- **State:** React Context + local state
- **i18n:** Custom translation system (BG + EN)

## Phase Breakdown

### Phase 1: Quality & Stability -- COMPLETE

Fixed bugs and established code quality foundations.

**Delivered:**
- Fixed i18n reactivity and hardcoded strings (issues #1, #2)
- Atomic workout saving via RPC (prevents partial data)
- Fixed broken UI buttons (forgot password, profile settings)
- Testing infrastructure (Jest + RNTL)
- Loading states, input validation, error feedback
- Removed dead code

### Phase 2: Profile & UX Polish -- COMPLETE

Completed user-facing features that were previously placeholders.

**Delivered:**
- Edit Profile screen (name, weight, height, goal)
- Dark theme support
- Push notifications (workout reminders, streak alerts)
- Help/Terms static pages
- Offline handling with graceful degradation

### Phase 3: Trainer Core -- COMPLETE

Built the trainer platform — the main differentiator.

**Delivered:**
- Client-trainer relationship (permanent invite codes, connection approval flow, RLS policies)
- Trainer dashboard (client count, activity overview, pending requests)
- Client progress monitoring (view client workout history, streaks, body metrics)
- Custom workout builder (exercises, sets, reps, rest, difficulty — bilingual)
- Custom workouts for all users (trainers and clients can create)
- Workout assignment (assign programs to specific clients, track completion)
- Workout feedback (trainer comments on completed client workouts)
- Client goal setting (targets for weight, reps, frequency, custom)
- Trainer goal suggestions (new goals + adjustments, client accept/reject flow)
- In-app messaging (real-time chat between trainer and client, conversations, pagination)

### Phase 4: Differentiators (Future)

Features that would set GymApp apart from competitors.

**Focus areas:**
- Public workout programs — publish trainer workouts for any user to follow (#21)
- Video form checks — client attaches video to sets, trainer provides technique feedback (#24)
- AI-powered programming — analyze logged performance, suggest progressive overload / deload weeks (#25)
- Custom domain and branding (#40)
- Holistic tracking — nutrition logging (macros, calories) + sleep/recovery tracking
- Gamification — challenges between clients, leaderboards, achievements, badges

## Architecture Decisions

### Database (Supabase PostgreSQL)

**Implemented schema (12 tables):**
- `profiles` — user accounts with role, language, trainer_code
- `workout_logs` — completed workout sessions
- `exercise_logs` — exercises within a workout
- `set_logs` — individual sets within an exercise
- `body_metrics` — daily weight tracking
- `trainer_clients` — trainer-client relationships (status: pending/active/rejected/removed)
- `custom_workouts` — reusable workout templates (trainers + clients)
- `workout_assignments` — trainer assigns workouts to clients
- `workout_feedback` — trainer comments on client workout logs
- `client_goals` — client-owned goals (weight_target, lift_target, frequency, custom)
- `goal_suggestions` — trainer suggestions for new/adjusted goals
- `conversations` — one per trainer-client pair
- `messages` — in-app messages with read receipts

**RLS Strategy for trainer-client access:**
- Trainers can READ their connected clients' workout_logs, exercise_logs, set_logs, body_metrics
- Trainers can WRITE to workout_assignments, workout_feedback, goal_suggestions for their clients
- Public workouts are readable by all authenticated users
- Clients can only see their own trainer (not other trainers' data)
- Messaging restricted to conversation participants with active connections

### Conditional Navigation

The tab layout conditionally renders based on `profile.role`:
- **Client tabs:** Home, Workouts, Progress, Profile
- **Trainer tabs:** Dashboard, Clients, Programs, Profile

Both roles share the Profile tab. Trainer-specific screens live in a separate route group.

### Permanent Invite Codes

Trainers have a permanent 6-character code (auto-generated on signup, stored in `profiles.trainer_code`). Clients enter the code to initiate a connection. This is simpler than the previous one-time invite code approach and never expires. Future: QR codes, shareable links.

### Realtime Messaging

The chat feature uses Supabase Realtime (WebSocket subscriptions on the `messages` table) for instant message delivery. This is the only feature using Realtime — all other data is fetched on-demand via `useFocusAsyncData`.
