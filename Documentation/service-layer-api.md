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

Returns the trainer's permanent 6-character invite code from their profile. Each trainer is assigned a unique code on signup (see migration `005_permanent_trainer_code.sql`). The code never expires and can be reused by multiple clients.

```typescript
function getTrainerCode(trainerId: string): Promise<string | null>
```

**Supabase operation:** `.from('profiles').select('trainer_code').eq('id', trainerId).single()`
**RLS:** User reads own profile
**Error handling:** Throws Error. Returns `null` if no code is set.

---

#### redeemInviteCode

Client redeems a trainer's permanent code. Looks up the code in `profiles.trainer_code`, creates a pending connection, and returns trainer info for the confirmation screen.

```typescript
function redeemInviteCode(code: string): Promise<{
  success: boolean;
  error?: string;
  connectionId?: string;
  trainerName?: string;
  trainerEmail?: string;
}>
```

**Supabase operation:** `supabase.rpc('redeem_invite_code', { p_code: code.toUpperCase() })`
**RLS:** SECURITY DEFINER — validates caller is a client internally
**Error cases:** `'only_clients'`, `'invalid_code'`, `'already_connected'`

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
  trainerEmail?: string;  // Populated when queried from client side
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

**Supabase operation:** `.from('trainer_clients').select('..., trainer:profiles!...(name, email)').eq('client_id', clientId).in('status', ['active', 'pending', 'rejected'])`
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

Lists all custom workouts created by a trainer, most recently updated first.

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

### Client Progress Monitoring

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
2. If denied → saves as disabled, returns `{ enabled: false, permissionDenied: true }`
3. If granted → schedules reminder at saved time, returns `{ enabled: true }`

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
