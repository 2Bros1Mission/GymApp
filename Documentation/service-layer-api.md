# Service Layer API Reference

## Overview

GymApp uses a **service layer pattern** where all database operations go through typed functions in `src/lib/`. Screens never call the Supabase client directly.

### Conventions

- Functions that **return `{ error: string | null }`** indicate the error via the return value (caller checks `.error`)
- Functions that **throw an Error** indicate failure via exception (caller uses try/catch or lets it propagate to the hook)
- Functions that **return `{ success: boolean; error?: string }`** are used for RPC-backed operations with explicit success/failure semantics
- All functions are `async` and return Promises

---

## workoutService.ts

Source: `src/lib/workoutService.ts`

### saveWorkoutLog

Atomically saves a completed workout session with all exercises and sets via the `save_workout` RPC function.

```typescript
function saveWorkoutLog(params: SaveWorkoutParams): Promise<{ error: string | null; workoutLogId?: string }>
```

**Parameters:**
```typescript
interface SaveWorkoutParams {
  userId: string;           // Auth user ID
  workoutId: string;        // Identifier of the workout template
  workoutName: string;      // Display name of the workout
  durationSeconds: number;  // Total session duration
  exercises: ExerciseData[]; // Array of exercises with sets
  notes?: string;           // Optional session notes
}

interface ExerciseData {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: SetData[];
}

interface SetData {
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}
```

**Supabase operation:** `supabase.rpc('save_workout', {...})`
**RLS:** SECURITY DEFINER — function runs as creator, uses passed `p_user_id`
**Error handling:** Returns `{ error: message }` on failure

---

### getWorkoutHistory

Fetches the user's completed workout logs, most recent first.

```typescript
function getWorkoutHistory(userId: string, limit?: number): Promise<WorkoutLog[]>
```

**Parameters:**
- `userId` — Auth user ID
- `limit` — Max rows (default: 20)

**Supabase operation:** `.from('workout_logs').select('*').eq('user_id', userId).eq('completed', true).order('date', { ascending: false })`
**RLS:** User can only read their own rows (`user_id = auth.uid()`)
**Error handling:** Throws Error

---

### getWorkoutStats

Calculates workout statistics: total count, current streak, this week's count, and a boolean array for Mon-Sun activity.

```typescript
function getWorkoutStats(userId: string): Promise<{
  totalWorkouts: number;
  streak: number;
  thisWeek: number;
  weekDays: boolean[];  // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}>
```

**Supabase operation:** `.from('workout_logs').select('id, date, duration_seconds').eq('user_id', userId).eq('completed', true)`
**RLS:** User reads own data only
**Error handling:** Throws Error
**Note:** Streak counts consecutive days from today backwards. Week starts on Monday.

---

### getExerciseHistory

Gets past performances for a specific exercise, including nested set data.

```typescript
function getExerciseHistory(userId: string, exerciseId: string, limit?: number): Promise<ExerciseLog[]>
```

**Parameters:**
- `userId` — Auth user ID
- `exerciseId` — Exercise identifier
- `limit` — Max rows (default: 10)

**Supabase operation:** `.from('exercise_logs').select('*, workout_log:workout_logs!inner(user_id, date), sets:set_logs(*)').eq('exercise_id', exerciseId).eq('workout_log.user_id', userId)`
**RLS:** Access via inner join to workout_logs (user's own data)
**Error handling:** Throws Error

---

### saveBodyMetric

Upserts a daily body weight measurement. If a measurement already exists for today, it's updated.

```typescript
function saveBodyMetric(userId: string, weight: number, notes?: string): Promise<{ error: string | null }>
```

**Supabase operation:** `.from('body_metrics').upsert({...}, { onConflict: 'user_id,date' })`
**RLS:** User can only write their own rows
**Error handling:** Returns `{ error: message }` on failure

---

### getBodyMetrics

Fetches body weight history, most recent first.

```typescript
function getBodyMetrics(userId: string, limit?: number): Promise<BodyMetric[]>
```

**Supabase operation:** `.from('body_metrics').select('*').eq('user_id', userId).order('date', { ascending: false })`
**RLS:** User reads own data only
**Error handling:** Throws Error

---

## trainerService.ts

Source: `src/lib/trainerService.ts`

### Connection Management

#### getTrainerCode

Gets the trainer's permanent 6-character invite code from their profile.

```typescript
function getTrainerCode(trainerId: string): Promise<string | null>
```

**Supabase operation:** `.from('profiles').select('trainer_code').eq('id', trainerId).single()`
**RLS:** User reads own profile
**Error handling:** Throws Error. Returns `null` if no code set.

---

#### redeemInviteCode

Client redeems a trainer's permanent code. Creates a pending connection and returns trainer info for the confirmation screen.

```typescript
function redeemInviteCode(code: string): Promise<{
  success: boolean;
  error?: string;
  connectionId?: string;
  trainerName?: string;
}>
```

**Supabase operation:** `supabase.rpc('redeem_invite_code', { p_code: code.toUpperCase() })`
**RLS:** SECURITY DEFINER — validates caller is a client internally
**Error cases:** `'only_clients'`, `'invalid_code'`, `'already_connected'`

> **Note:** The response no longer includes `trainerEmail`. The RPC function now looks up `profiles.trainer_code` instead of the deprecated `trainer_invites` table.

---

#### confirmConnection

Client confirms they want to connect with the trainer (sets `client_confirmed = true`).

```typescript
function confirmConnection(connectionId: string): Promise<{ success: boolean; error?: string }>
```

**Supabase operation:** `supabase.rpc('confirm_connection', { p_connection_id })`
**RLS:** Only the connection's client can confirm (`client_id = auth.uid()`)

---

#### approveConnection

Trainer approves a pending, client-confirmed connection request (sets `status = 'active'`).

```typescript
function approveConnection(connectionId: string): Promise<{ success: boolean; error?: string }>
```

**Supabase operation:** `supabase.rpc('approve_connection', { p_connection_id })`
**RLS:** Only the connection's trainer can approve (`trainer_id = auth.uid()`)

---

#### rejectConnection

Trainer rejects a pending connection request (sets `status = 'rejected'`).

```typescript
function rejectConnection(connectionId: string): Promise<{ success: boolean; error?: string }>
```

**Supabase operation:** `supabase.rpc('reject_connection', { p_connection_id })`
**RLS:** Only the connection's trainer can reject (`trainer_id = auth.uid()`)

---

#### getTrainerClients

Gets all active (approved) clients connected to a trainer, with client name/email.

```typescript
function getTrainerClients(trainerId: string): Promise<TrainerClient[]>
```

**Returns:**
```typescript
interface TrainerClient {
  id: string;
  trainerId: string;
  clientId: string;
  status: 'pending' | 'active' | 'rejected' | 'removed';
  clientConfirmed: boolean;
  connectedAt: string;
  clientName?: string;
  clientEmail?: string;
  trainerName?: string;   // Populated when queried from client side
}
```

**Supabase operation:** `.from('trainer_clients').select('..., client:profiles!...(name, email)').eq('trainer_id', trainerId).eq('status', 'active')`
**Error handling:** Throws Error

---

#### getPendingRequests

Gets pending connection requests where the client has confirmed (awaiting trainer approval).

```typescript
function getPendingRequests(trainerId: string): Promise<TrainerClient[]>
```

**Supabase operation:** `.eq('status', 'pending').eq('client_confirmed', true)`
**Error handling:** Throws Error

---

#### getClientTrainer

Gets the client's current trainer connection (active, pending, or rejected).

```typescript
function getClientTrainer(clientId: string): Promise<TrainerClient | null>
```

**Supabase operation:** `.from('trainer_clients').select('..., trainer:profiles!...(name)').eq('client_id', clientId).in('status', ['active', 'pending', 'rejected'])`
**Error handling:** Throws Error. Returns `null` if no connection exists.

---

#### removeConnection

Either party removes the connection (sets `status = 'removed'`).

```typescript
function removeConnection(connectionId: string): Promise<{ error?: string }>
```

**Supabase operation:** `.from('trainer_clients').update({ status: 'removed' }).eq('id', connectionId)`
**RLS:** Either trainer_id or client_id must match `auth.uid()`

---

### Custom Workout CRUD

#### getCustomWorkouts

Lists all custom workouts created by a user, most recently updated first.

```typescript
function getCustomWorkouts(creatorId: string): Promise<CustomWorkout[]>
```

**Returns:**
```typescript
interface CustomWorkout {
  id: string;
  creatorId: string;
  name: string;
  nameBg: string;           // Bulgarian translation
  description: string;
  descriptionBg: string;    // Bulgarian translation
  difficulty: DifficultyLevel;
  durationMinutes: number;
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Supabase operation:** `.from('custom_workouts').select('*').eq('creator_id', creatorId).order('updated_at', { ascending: false })`
**Error handling:** Throws Error

---

#### getCustomWorkout

Gets a single custom workout by ID.

```typescript
function getCustomWorkout(workoutId: string): Promise<CustomWorkout | null>
```

**Error handling:** Throws Error. Returns `null` if not found.

---

#### createCustomWorkout

Creates a new custom workout template.

```typescript
function createCustomWorkout(workout: {
  creatorId: string;
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;
  difficulty: DifficultyLevel;
  durationMinutes: number;
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  isPublic: boolean;
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('custom_workouts').insert({...}).select('id').single()`
**RLS:** Only the creator (`creator_id = auth.uid()`) can insert

---

#### updateCustomWorkout

Updates fields of an existing custom workout. Only provided fields are changed.

```typescript
function updateCustomWorkout(workoutId: string, updates: Partial<{
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;
  difficulty: DifficultyLevel;
  durationMinutes: number;
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  isPublic: boolean;
}>): Promise<{ error?: string }>
```

**Supabase operation:** `.from('custom_workouts').update({...}).eq('id', workoutId)`
**Note:** Always sets `updated_at = now()` alongside any field changes.

---

#### deleteCustomWorkout

Deletes a custom workout.

```typescript
function deleteCustomWorkout(workoutId: string): Promise<{ error?: string }>
```

**Supabase operation:** `.from('custom_workouts').delete().eq('id', workoutId)`
**RLS:** Only the creator can delete

---

### Workout Assignments

#### assignWorkout

Trainer assigns a custom workout to a connected client.

```typescript
function assignWorkout(params: {
  trainerId: string;
  clientId: string;
  workoutId: string;
  dueDate?: string;    // ISO date (optional)
  notes?: string;      // Optional instructions
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('workout_assignments').insert({...}).select('id').single()`
**RLS:** Trainer must have active connection to client

---

#### unassignWorkout

Removes a workout assignment.

```typescript
function unassignWorkout(assignmentId: string): Promise<{ error?: string }>
```

**Supabase operation:** `.from('workout_assignments').delete().eq('id', assignmentId)`
**RLS:** Only the assigning trainer can delete

---

#### getTrainerAssignments

Gets all assignments created by a trainer, optionally filtered by client.

```typescript
function getTrainerAssignments(trainerId: string, clientId?: string): Promise<WorkoutAssignment[]>
```

**Returns:**
```typescript
interface WorkoutAssignment {
  id: string;
  trainerId: string;
  clientId: string;
  workoutId: string;
  assignedAt: string;
  dueDate: string | null;
  status: 'pending' | 'completed' | 'skipped';
  completedAt: string | null;
  notes: string | null;
  workoutName?: string;
  workoutNameBg?: string;
  clientName?: string;
  trainerName?: string;
}
```

**Supabase operation:** `.from('workout_assignments').select('..., workout:custom_workouts!...(name, name_bg), client:profiles!...(name)').eq('trainer_id', trainerId)`
**Error handling:** Throws Error

---

#### getClientAssignments

Gets pending assignments for a client.

```typescript
function getClientAssignments(clientId: string): Promise<WorkoutAssignment[]>
```

**Supabase operation:** `.eq('client_id', clientId).eq('status', 'pending')`
**Error handling:** Throws Error

---

#### completeAssignment

Client marks an assignment as completed.

```typescript
function completeAssignment(assignmentId: string): Promise<{ error?: string }>
```

**Supabase operation:** `.from('workout_assignments').update({ status: 'completed', completed_at: now() }).eq('id', assignmentId)`
**RLS:** Only the assigned client can update

---

### Client Progress Monitoring

#### getRecentClientActivity

Gets recent completed workouts across all of a trainer's connected clients.

```typescript
function getRecentClientActivity(trainerId: string, limit?: number): Promise<RecentActivity[]>
```

**Returns:**
```typescript
interface RecentActivity {
  id: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  date: string;
  durationSeconds: number;
}
```

**Default limit:** 30

---

#### getClientProfile

Gets a client's profile information. Trainer must have an active connection (enforced by RLS).

```typescript
function getClientProfile(clientId: string): Promise<{ id: string; name: string; email: string; weight: number | null; height: number | null; goal: string | null }>
```

**RLS:** Trainer can read client profile if active connection exists in `trainer_clients`

---

#### getClientWorkoutLogs

Gets a client's recent completed workouts. Trainer access enforced by RLS.

```typescript
function getClientWorkoutLogs(clientId: string, limit?: number): Promise<ClientWorkoutLog[]>
```

**Returns:** `Array<{ id, workoutName, date, durationSeconds, completed }>`

---

#### getClientBodyMetrics

Gets a client's body weight history (oldest first for charting).

```typescript
function getClientBodyMetrics(clientId: string, limit?: number): Promise<Array<{ date: string; weight: number }>>
```

---

#### getClientProgress

Aggregates all client progress data into a single object for the detail screen.

```typescript
function getClientProgress(clientId: string): Promise<ClientProgress>
```

**Returns:**
```typescript
interface ClientProgress {
  clientId: string;
  clientName: string;
  clientEmail: string;
  weight: number | null;
  height: number | null;
  goal: string | null;
  totalWorkouts: number;
  currentStreak: number;
  lastWorkoutDate: string | null;
  recentWorkouts: ClientWorkoutLog[];  // Last 10
  bodyMetrics: Array<{ date: string; weight: number }>;
  weeklyActivity: boolean[];  // [Mon..Sun]
}
```

**Implementation:** Runs 4 queries in parallel via `Promise.all` for performance.

---

## feedbackService.ts

Source: `src/lib/feedbackService.ts`

### getWorkoutDetail

Gets the full detail view of a workout log including all exercises, their sets, and any trainer feedback.

```typescript
function getWorkoutDetail(workoutLogId: string): Promise<WorkoutDetail>
```

**Returns:**
```typescript
interface WorkoutDetail {
  id: string;
  workoutName: string;
  date: string;
  durationSeconds: number;
  completed: boolean;
  notes: string | null;
  exercises: WorkoutDetailExercise[];
  feedback: WorkoutFeedback[];
}

interface WorkoutDetailExercise {
  id: string;
  exerciseName: string;
  orderIndex: number;
  sets: WorkoutDetailSet[];
}

interface WorkoutDetailSet {
  id: string;
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}
```

**Implementation:** Fetches workout log, then exercise logs with nested set logs, then feedback. Exercises are ordered by `order_index`, sets by `set_number`.

---

### getWorkoutFeedback

Gets all trainer feedback messages for a specific workout log.

```typescript
function getWorkoutFeedback(workoutLogId: string): Promise<WorkoutFeedback[]>
```

**Returns:**
```typescript
interface WorkoutFeedback {
  id: string;
  workoutLogId: string;
  trainerId: string;
  trainerName?: string;
  message: string;
  createdAt: string;
}
```

**Supabase operation:** `.from('workout_feedback').select('*, trainer:profiles!...(name)').eq('workout_log_id', workoutLogId).order('created_at', { ascending: true })`
**RLS:** Client can read feedback on their own workouts; trainer can read own feedback
**Error handling:** Throws Error

---

### addWorkoutFeedback

Trainer adds a feedback message to a client's workout log.

```typescript
function addWorkoutFeedback(params: {
  workoutLogId: string;
  trainerId: string;
  message: string;
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('workout_feedback').insert({...}).select('id').single()`
**RLS:** Trainer must have active connection to the workout's owner
**Error handling:** Returns `{ error }` on failure

---

## goalService.ts

Source: `src/lib/goalService.ts`

### Client Functions

#### getClientGoals

Gets all goals for a client, ordered by status (active first) then most recently updated.

```typescript
function getClientGoals(clientId: string): Promise<ClientGoal[]>
```

**Returns:**
```typescript
interface ClientGoal {
  id: string;
  clientId: string;
  goalType: GoalType;  // 'weight_target' | 'lift_target' | 'frequency' | 'custom'
  title: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  exerciseName: string | null;
  deadline: string | null;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

**Supabase operation:** `.from('client_goals').select('*').eq('client_id', clientId).order('status').order('updated_at', { ascending: false })`
**RLS:** Client reads own goals only
**Error handling:** Throws Error

---

#### createGoal

Client creates a new goal.

```typescript
function createGoal(params: {
  clientId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('client_goals').insert({...}).select('id').single()`
**RLS:** `client_id = auth.uid()`

---

#### updateGoal

Updates goal fields. Only provided fields are changed; `updated_at` is always set.

```typescript
function updateGoal(goalId: string, updates: {
  title?: string;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
}): Promise<{ error?: string }>
```

---

#### deleteGoal

Deletes a goal permanently.

```typescript
function deleteGoal(goalId: string): Promise<{ error?: string }>
```

---

#### completeGoal

Marks a goal as completed with a timestamp.

```typescript
function completeGoal(goalId: string): Promise<{ error?: string }>
```

**Behavior:** Sets `status = 'completed'`, `completed_at = now()`, `updated_at = now()`.

---

#### getPendingSuggestions

Gets all pending trainer suggestions for a client.

```typescript
function getPendingSuggestions(clientId: string): Promise<GoalSuggestion[]>
```

**Returns:**
```typescript
interface GoalSuggestion {
  id: string;
  trainerId: string;
  clientId: string;
  targetGoalId: string | null;
  suggestionType: 'new_goal' | 'adjustment';
  goalType: GoalType;
  title: string;
  targetValue: number | null;
  unit: string | null;
  exerciseName: string | null;
  deadline: string | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'adjusted' | 'rejected';
  clientResponseAt: string | null;
  createdAt: string;
  trainerName?: string;
  targetGoalTitle?: string;
}
```

**Supabase operation:** `.from('goal_suggestions').select('*, trainer:profiles!...(name), target_goal:client_goals!...(title)').eq('client_id', clientId).eq('status', 'pending')`

---

#### respondToSuggestion

Client accepts, adjusts, or rejects a trainer's suggestion. If accepted/adjusted, creates or updates the corresponding goal.

```typescript
function respondToSuggestion(
  suggestionId: string,
  response: 'accepted' | 'adjusted' | 'rejected',
  goalData?: {
    clientId: string;
    goalType: GoalType;
    title: string;
    targetValue?: number | null;
    unit?: string | null;
    exerciseName?: string | null;
    deadline?: string | null;
    targetGoalId?: string | null;
    suggestionType: 'new_goal' | 'adjustment';
  }
): Promise<{ error?: string }>
```

**Behavior:**
1. Updates the suggestion status and sets `client_response_at`
2. If accepted/adjusted with `suggestionType = 'new_goal'`: inserts a new `client_goals` row
3. If accepted/adjusted with `suggestionType = 'adjustment'`: updates the `target_goal_id` goal

---

### Trainer Functions

#### getClientGoalsForTrainer

Trainer views a client's active goals (read-only).

```typescript
function getClientGoalsForTrainer(clientId: string): Promise<ClientGoal[]>
```

**RLS:** Trainer must have active connection to the client
**Note:** Only returns active goals (not completed/abandoned).

---

#### suggestGoal

Trainer suggests a new goal to a client.

```typescript
function suggestGoal(params: {
  trainerId: string;
  clientId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
  message?: string | null;
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('goal_suggestions').insert({..., suggestion_type: 'new_goal'}).select('id').single()`
**RLS:** Trainer must have active connection to the client

---

#### suggestAdjustment

Trainer suggests an adjustment to an existing client goal.

```typescript
function suggestAdjustment(params: {
  trainerId: string;
  clientId: string;
  targetGoalId: string;
  goalType: GoalType;
  title: string;
  targetValue?: number | null;
  unit?: string | null;
  exerciseName?: string | null;
  deadline?: string | null;
  message?: string | null;
}): Promise<{ id?: string; error?: string }>
```

**Supabase operation:** `.from('goal_suggestions').insert({..., suggestion_type: 'adjustment'}).select('id').single()`

---

#### withdrawSuggestion

Trainer withdraws a pending suggestion (deletes it).

```typescript
function withdrawSuggestion(suggestionId: string): Promise<{ error?: string }>
```

**RLS:** Only the trainer can delete, and only if `status = 'pending'`

---

### Auto-Tracking

#### refreshGoalProgress

Automatically refreshes `currentValue` for frequency and weight_target goals using live data.

```typescript
function refreshGoalProgress(clientId: string, goals: ClientGoal[]): Promise<ClientGoal[]>
```

**Behavior:**
- **Frequency goals:** Queries `workout_logs` for completed workouts this week (Monday-Sunday) and sets `currentValue` to the count
- **Weight target goals:** Queries latest `body_metrics` entry and sets `currentValue` to the weight

**Note:** Does not persist the updated values — they are computed on read for display purposes.

---

## messageService.ts

Source: `src/lib/messageService.ts`

### getOrCreateConversation

Finds an existing conversation with another user, or creates a new one via RPC.

```typescript
function getOrCreateConversation(otherUserId: string): Promise<{
  success: boolean;
  conversationId?: string;
  error?: string;
}>
```

**Supabase operation:** `supabase.rpc('get_or_create_conversation', { p_other_user_id })`
**Error cases:** `'user_not_found'`, `'invalid_roles'`, `'no_active_connection'`

---

### getConversations

Gets all conversations for the current user with last message preview and unread count.

```typescript
function getConversations(userId: string): Promise<Conversation[]>
```

**Returns:**
```typescript
interface Conversation {
  id: string;
  trainerId: string;
  clientId: string;
  lastMessageAt: string;
  createdAt: string;
  otherUserName: string;
  otherUserEmail: string;
  lastMessageContent?: string;
  unreadCount: number;
}
```

**Supabase operation:** `supabase.rpc('get_conversations')`
**Note:** The `otherUserName`/`otherUserEmail` fields are derived client-side from the trainer/client profile data based on the caller's role.

---

### getTotalUnreadCount

Gets the total number of unread messages across all conversations.

```typescript
function getTotalUnreadCount(userId: string): Promise<number>
```

**Supabase operation:** `.from('messages').select('*, conversation:conversations!inner(id)', { count: 'exact', head: true })` with filters for the user's conversations and unread messages
**Returns:** `0` on error (graceful fallback)

---

### getMessages

Gets messages for a conversation, newest first. Supports cursor-based pagination.

```typescript
function getMessages(conversationId: string, limit?: number, before?: string): Promise<Message[]>
```

**Parameters:**
- `conversationId` — The conversation to fetch messages from
- `limit` — Max messages to return (default: 50)
- `before` — ISO timestamp cursor for pagination (fetch messages older than this)

**Returns:**
```typescript
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}
```

**Supabase operation:** `.from('messages').select('...').eq('conversation_id', id).order('created_at', { ascending: false }).limit(limit)`
**Error handling:** Throws Error

---

### sendMessage

Sends a message in a conversation via the `send_message` RPC function.

```typescript
function sendMessage(conversationId: string, content: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}>
```

**Supabase operation:** `supabase.rpc('send_message', { p_conversation_id, p_content })`
**Error cases:** `'conversation_not_found'`, `'empty_message'`, `'message_too_long'`

---

### markMessagesRead

Marks all unread messages in a conversation as read (messages from the other party).

```typescript
function markMessagesRead(conversationId: string): Promise<void>
```

**Supabase operation:** `supabase.rpc('mark_messages_read', { p_conversation_id })`

---

### subscribeToMessages

Subscribes to real-time new message inserts in a conversation via Supabase Realtime. Returns the channel for cleanup.

```typescript
function subscribeToMessages(
  conversationId: string,
  onNewMessage: (message: Message) => void,
): RealtimeChannel
```

**Supabase operation:** `.channel('messages:id').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.{id}' })`

**Usage:**
```typescript
// Subscribe
const channel = subscribeToMessages(conversationId, (msg) => {
  setMessages(prev => [msg, ...prev]);
});

// Cleanup (in useEffect return or on unmount)
supabase.removeChannel(channel);
```

---

## notificationService.ts

Source: `src/lib/notificationService.ts`

### requestNotificationPermission

Requests OS-level notification permission. Sets up Android notification channel.

```typescript
function requestNotificationPermission(): Promise<boolean>
```

**Returns:** `true` if permission granted, `false` otherwise
**Platform notes:**
- Returns `false` on web (not supported)
- Returns `false` on emulators (physical device required)
- Android: creates 'workout-reminders' channel with HIGH importance

---

### getNotificationPreferences

Loads saved preferences from AsyncStorage.

```typescript
function getNotificationPreferences(): Promise<NotificationPreferences>

interface NotificationPreferences {
  enabled: boolean;
  reminderHour: number;    // 0-23
  reminderMinute: number;  // 0-59
}
```

**Storage:** `@react-native-async-storage/async-storage`
**Defaults:** `{ enabled: false, reminderHour: 9, reminderMinute: 0 }`

---

### saveNotificationPreferences

Persists preferences to AsyncStorage.

```typescript
function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void>
```

---

### scheduleDailyReminder

Schedules a recurring daily notification at the specified time. Cancels any existing reminder first.

```typescript
function scheduleDailyReminder(hour: number, minute: number, title: string, body: string): Promise<void>
```

**Implementation:** Uses `Notifications.SchedulableTriggerInputTypes.DAILY`
**Identifier:** `'daily-workout-reminder'` (used for cancellation)

---

### cancelDailyReminder

Cancels the scheduled daily workout reminder.

```typescript
function cancelDailyReminder(): Promise<void>
```

---

### toggleNotifications

High-level toggle that handles the full enable/disable flow including permission requests.

```typescript
function toggleNotifications(enable: boolean, reminderTitle: string, reminderBody: string): Promise<{ enabled: boolean; permissionDenied?: boolean }>
```

**Behavior when enabling:**
1. Requests permission
2. If denied -> saves as disabled, returns `{ enabled: false, permissionDenied: true }`
3. If granted -> schedules reminder at saved time, returns `{ enabled: true }`

**Behavior when disabling:**
1. Cancels reminder
2. Saves preferences as disabled

---

### updateReminderTime

Changes the reminder time. If notifications are currently enabled, reschedules immediately.

```typescript
function updateReminderTime(hour: number, minute: number, reminderTitle: string, reminderBody: string): Promise<void>
```

---

### addNotificationResponseListener

Registers a handler for when the user taps a notification. Returns a cleanup function.

```typescript
function addNotificationResponseListener(handler: (response: NotificationResponse) => void): () => void
```

**Usage:** Call in a `useEffect` and return the cleanup function for unmounting.
