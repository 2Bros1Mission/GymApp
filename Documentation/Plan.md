# Trainer Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete trainer platform (issues #16-23) — client linking, dashboard, progress monitoring, workout builder, assignments, public programs, feedback, and goal setting.

**Architecture:** Separate route group `(trainer-tabs)` with conditional redirect based on `profile.role`. Shared Supabase schema with RLS policies enforcing trainer-client boundaries. A single `trainerService.ts` handles all trainer data access. Workout builder is a shared component reusable by clients later (#30).

**Tech Stack:** React Native (Expo SDK 54), expo-router v6, Supabase (Auth + PostgreSQL + RLS), TypeScript 5.9

**Covers Issues:** #16, #17, #18, #19, #20, #21, #22, #23

---

## File Structure

```
supabase/
  schema.sql                          (MODIFY — add 7 new tables + RLS policies)
  migrations/
    001_trainer_tables.sql            (CREATE — migration file for new tables)

src/
  types/
    index.ts                          (MODIFY — add trainer-specific types)
    trainer.ts                        (CREATE — dedicated trainer types)
  lib/
    trainerService.ts                 (CREATE — all trainer data access)
  contexts/
    AuthContext.tsx                    (existing — no changes needed, role already exposed)
  constants/
    i18n.ts                           (MODIFY — add trainer translation keys)

app/
  _layout.tsx                         (MODIFY — add role-based redirect logic)
  (tabs)/
    _layout.tsx                       (existing — remains for clients only)
  (trainer-tabs)/
    _layout.tsx                       (CREATE — trainer tab bar: Dashboard, Clients, Programs, Profile)
    index.tsx                         (CREATE — trainer dashboard)
    clients.tsx                       (CREATE — client list)
    programs.tsx                      (CREATE — program library)
    profile.tsx                       (CREATE — reuse client profile or link to shared)
  trainer/
    client/[id].tsx                   (CREATE — client detail/progress)
    workout-builder.tsx               (CREATE — create/edit workout template)
    assign-workout.tsx                (CREATE — assign workout to client)
    invite.tsx                        (CREATE — generate/manage invite codes)
  client/
    enter-code.tsx                    (CREATE — client enters invite code)

src/
  components/
    WorkoutBuilder.tsx                (CREATE — shared workout builder component)
    InviteCodeCard.tsx                (CREATE — display/copy invite code)
    ClientCard.tsx                    (CREATE — client list item)
    FeedbackInput.tsx                 (CREATE — trainer feedback composer)
    GoalCard.tsx                      (CREATE — goal display + progress)
```

---

## Task 1: Database Schema — All Trainer Tables

**Files:**
- Create: `supabase/migrations/001_trainer_tables.sql`
- Modify: `supabase/schema.sql` (append new tables)

This task creates ALL tables needed for #16-23 in a single migration. Designing them together ensures FK relationships are consistent.

- [ ] **Step 1: Create the migration file with all 7 tables**

```sql
-- supabase/migrations/001_trainer_tables.sql

-- 1. Trainer-client relationship (#16)
CREATE TABLE trainer_clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  invited_at timestamptz DEFAULT now(),
  connected_at timestamptz,
  UNIQUE (trainer_id, client_id)
);

-- 2. Invite codes (#16)
CREATE TABLE trainer_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_by uuid REFERENCES profiles(id),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Custom workout templates (#19)
CREATE TABLE workout_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_bg text,
  description text,
  description_bg text,
  difficulty text NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_minutes integer,
  muscle_groups text[] DEFAULT '{}',
  exercises jsonb NOT NULL DEFAULT '[]',
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Workout assignments (#20)
CREATE TABLE workout_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  workout_log_id uuid REFERENCES workout_logs(id)
);

-- 5. Program followers (#21)
CREATE TABLE program_followers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followed_at timestamptz DEFAULT now(),
  UNIQUE (template_id, user_id)
);

-- 6. Workout feedback (#22)
CREATE TABLE workout_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_log_id uuid NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 7. Client goals (#23)
CREATE TABLE client_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('weight_target', 'lift_target', 'frequency', 'custom')),
  title text NOT NULL,
  target_value real,
  current_value real DEFAULT 0,
  unit text,
  deadline date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE trainer_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_goals ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Add RLS policies**

```sql
-- trainer_clients policies
CREATE POLICY "Trainers see their client relationships"
  ON trainer_clients FOR SELECT TO authenticated
  USING (trainer_id = auth.uid() OR client_id = auth.uid());

CREATE POLICY "Trainers create relationships"
  ON trainer_clients FOR INSERT TO authenticated
  WITH CHECK (trainer_id = auth.uid());

CREATE POLICY "Participants can update status"
  ON trainer_clients FOR UPDATE TO authenticated
  USING (trainer_id = auth.uid() OR client_id = auth.uid());

-- trainer_invites policies
CREATE POLICY "Trainers manage their invites"
  ON trainer_invites FOR ALL TO authenticated
  USING (trainer_id = auth.uid());

CREATE POLICY "Anyone can read valid invite by code"
  ON trainer_invites FOR SELECT TO authenticated
  USING (true);

-- workout_templates policies
CREATE POLICY "Creators manage their templates"
  ON workout_templates FOR ALL TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "Public templates readable by all"
  ON workout_templates FOR SELECT TO authenticated
  USING (is_public = true);

-- workout_assignments policies
CREATE POLICY "Trainers manage assignments for their clients"
  ON workout_assignments FOR ALL TO authenticated
  USING (trainer_id = auth.uid());

CREATE POLICY "Clients see their own assignments"
  ON workout_assignments FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Clients can update their assignment status"
  ON workout_assignments FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- program_followers policies
CREATE POLICY "Users manage their own follows"
  ON program_followers FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Creators can see follower count"
  ON program_followers FOR SELECT TO authenticated
  USING (
    template_id IN (SELECT id FROM workout_templates WHERE creator_id = auth.uid())
  );

-- workout_feedback policies
CREATE POLICY "Trainers write feedback for their clients"
  ON workout_feedback FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id = auth.uid() AND
    workout_log_id IN (
      SELECT wl.id FROM workout_logs wl
      JOIN trainer_clients tc ON tc.client_id = wl.user_id
      WHERE tc.trainer_id = auth.uid() AND tc.status = 'active'
    )
  );

CREATE POLICY "Trainers read their own feedback"
  ON workout_feedback FOR SELECT TO authenticated
  USING (trainer_id = auth.uid());

CREATE POLICY "Clients read feedback on their workouts"
  ON workout_feedback FOR SELECT TO authenticated
  USING (
    workout_log_id IN (SELECT id FROM workout_logs WHERE user_id = auth.uid())
  );

-- client_goals policies
CREATE POLICY "Trainers manage goals for their clients"
  ON client_goals FOR ALL TO authenticated
  USING (trainer_id = auth.uid());

CREATE POLICY "Clients read their own goals"
  ON client_goals FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Allow trainers to read their connected clients' workout data
CREATE POLICY "Trainers read client workout_logs"
  ON workout_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IN (
      SELECT client_id FROM trainer_clients
      WHERE trainer_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Trainers read client exercise_logs"
  ON exercise_logs FOR SELECT TO authenticated
  USING (
    workout_log_id IN (
      SELECT id FROM workout_logs WHERE user_id = auth.uid()
    ) OR
    workout_log_id IN (
      SELECT wl.id FROM workout_logs wl
      JOIN trainer_clients tc ON tc.client_id = wl.user_id
      WHERE tc.trainer_id = auth.uid() AND tc.status = 'active'
    )
  );

CREATE POLICY "Trainers read client set_logs"
  ON set_logs FOR SELECT TO authenticated
  USING (
    exercise_log_id IN (
      SELECT id FROM exercise_logs WHERE workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = auth.uid()
      )
    ) OR
    exercise_log_id IN (
      SELECT el.id FROM exercise_logs el
      JOIN workout_logs wl ON wl.id = el.workout_log_id
      JOIN trainer_clients tc ON tc.client_id = wl.user_id
      WHERE tc.trainer_id = auth.uid() AND tc.status = 'active'
    )
  );

CREATE POLICY "Trainers read client body_metrics"
  ON body_metrics FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IN (
      SELECT client_id FROM trainer_clients
      WHERE trainer_id = auth.uid() AND status = 'active'
    )
  );
```

- [ ] **Step 3: Add helper RPC for invite code redemption**

```sql
-- Atomic invite code redemption
CREATE OR REPLACE FUNCTION redeem_invite_code(invite_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite trainer_invites%ROWTYPE;
  v_relationship_id uuid;
BEGIN
  -- Find valid, unused invite
  SELECT * INTO v_invite
  FROM trainer_invites
  WHERE code = invite_code
    AND used_by IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired invite code');
  END IF;

  -- Check not already connected
  IF EXISTS (
    SELECT 1 FROM trainer_clients
    WHERE trainer_id = v_invite.trainer_id AND client_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'Already connected to this trainer');
  END IF;

  -- Mark invite as used
  UPDATE trainer_invites
  SET used_by = auth.uid(), used_at = now()
  WHERE id = v_invite.id;

  -- Create relationship
  INSERT INTO trainer_clients (trainer_id, client_id, status, connected_at)
  VALUES (v_invite.trainer_id, auth.uid(), 'active', now())
  RETURNING id INTO v_relationship_id;

  RETURN json_build_object(
    'success', true,
    'relationship_id', v_relationship_id,
    'trainer_id', v_invite.trainer_id
  );
END;
$$;
```

- [ ] **Step 4: Apply migration to Supabase**

Run: `supabase db push` or apply via Supabase Dashboard SQL editor.

- [ ] **Step 5: Append tables to schema.sql reference and commit**

```bash
git add supabase/migrations/001_trainer_tables.sql supabase/schema.sql
git commit -m "feat: add trainer tables, RLS policies, and invite RPC (#16-23)"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/trainer.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create trainer types file**

```typescript
// src/types/trainer.ts

export interface TrainerClient {
  id: string;
  trainer_id: string;
  client_id: string;
  status: 'pending' | 'active' | 'rejected';
  invited_at: string;
  connected_at: string | null;
  // Joined from profiles:
  client_name?: string;
  client_email?: string;
  client_avatar_url?: string | null;
}

export interface TrainerInvite {
  id: string;
  trainer_id: string;
  code: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface WorkoutTemplate {
  id: string;
  creator_id: string;
  name: string;
  name_bg: string | null;
  description: string | null;
  description_bg: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration_minutes: number | null;
  muscle_groups: string[];
  exercises: TemplateExercise[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
  // Computed (from program_followers):
  follower_count?: number;
}

export interface TemplateExercise {
  id: string;
  name: string;
  name_bg: string;
  muscle_group: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes?: string;
}

export interface WorkoutAssignment {
  id: string;
  trainer_id: string;
  client_id: string;
  template_id: string;
  assigned_at: string;
  due_date: string | null;
  status: 'pending' | 'completed' | 'skipped';
  completed_at: string | null;
  workout_log_id: string | null;
  // Joined:
  template_name?: string;
  client_name?: string;
}

export interface WorkoutFeedback {
  id: string;
  workout_log_id: string;
  trainer_id: string;
  message: string;
  created_at: string;
  // Joined:
  trainer_name?: string;
}

export interface ClientGoal {
  id: string;
  client_id: string;
  trainer_id: string;
  type: 'weight_target' | 'lift_target' | 'frequency' | 'custom';
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  deadline: string | null;
  status: 'active' | 'achieved' | 'abandoned';
  created_at: string;
}

export interface ProgramFollower {
  id: string;
  template_id: string;
  user_id: string;
  followed_at: string;
}

export interface ClientDashboardData {
  id: string;
  name: string;
  avatar_url: string | null;
  last_workout_date: string | null;
  streak: number;
  this_week: number;
  pending_assignments: number;
}

export interface TrainerDashboardStats {
  total_clients: number;
  active_today: number;
  pending_invites: number;
  total_programs: number;
}
```

- [ ] **Step 2: Re-export from index.ts**

Add to end of `src/types/index.ts`:
```typescript
export * from './trainer';
```

- [ ] **Step 3: Commit**

```bash
git add src/types/trainer.ts src/types/index.ts
git commit -m "feat: add TypeScript types for trainer features (#16-23)"
```

---

## Task 3: Trainer Service

**Files:**
- Create: `src/lib/trainerService.ts`

- [ ] **Step 1: Create the service with invite/linking functions**

```typescript
// src/lib/trainerService.ts

import { supabase } from './supabase';
import type {
  TrainerClient,
  TrainerInvite,
  WorkoutTemplate,
  WorkoutAssignment,
  WorkoutFeedback,
  ClientGoal,
  TrainerDashboardStats,
  ClientDashboardData,
} from '../types/trainer';

// ─── Invite Codes (#16) ───────────────────────────────────────────────

export async function generateInviteCode(trainerId: string): Promise<TrainerInvite> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase
    .from('trainer_invites')
    .insert({ trainer_id: trainerId, code })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveInvites(trainerId: string): Promise<TrainerInvite[]> {
  const { data, error } = await supabase
    .from('trainer_invites')
    .select('*')
    .eq('trainer_id', trainerId)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function redeemInviteCode(code: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_invite_code', { invite_code: code });

  if (error) throw error;
  if (data?.error) return { success: false, error: data.error };
  return { success: true };
}

// ─── Client Relationships (#16, #18) ──────────────────────────────────

export async function getClients(trainerId: string): Promise<TrainerClient[]> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      *,
      client:profiles!trainer_clients_client_id_fkey(name, email, avatar_url)
    `)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('connected_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    client_name: row.client?.name,
    client_email: row.client?.email,
    client_avatar_url: row.client?.avatar_url,
  }));
}

export async function getMyTrainer(clientId: string): Promise<TrainerClient | null> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(`
      *,
      trainer:profiles!trainer_clients_trainer_id_fkey(name, email, avatar_url)
    `)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function removeClient(trainerId: string, clientId: string): Promise<void> {
  const { error } = await supabase
    .from('trainer_clients')
    .delete()
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId);

  if (error) throw error;
}

// ─── Dashboard (#17) ──────────────────────────────────────────────────

export async function getDashboardStats(trainerId: string): Promise<TrainerDashboardStats> {
  const [clients, invites, programs] = await Promise.all([
    supabase
      .from('trainer_clients')
      .select('id', { count: 'exact' })
      .eq('trainer_id', trainerId)
      .eq('status', 'active'),
    supabase
      .from('trainer_invites')
      .select('id', { count: 'exact' })
      .eq('trainer_id', trainerId)
      .is('used_by', null)
      .gt('expires_at', new Date().toISOString()),
    supabase
      .from('workout_templates')
      .select('id', { count: 'exact' })
      .eq('creator_id', trainerId),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const { count: activeToday } = await supabase
    .from('workout_logs')
    .select('id', { count: 'exact' })
    .in('user_id', (await getClients(trainerId)).map(c => c.client_id))
    .gte('date', today);

  return {
    total_clients: clients.count ?? 0,
    active_today: activeToday ?? 0,
    pending_invites: invites.count ?? 0,
    total_programs: programs.count ?? 0,
  };
}

export async function getRecentClientActivity(trainerId: string, limit = 10) {
  const clientIds = (await getClients(trainerId)).map(c => c.client_id);
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('workout_logs')
    .select(`
      id, workout_name, date, duration_seconds, completed,
      user:profiles!workout_logs_user_id_fkey(name, avatar_url)
    `)
    .in('user_id', clientIds)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

// ─── Client Progress (#18) ────────────────────────────────────────────

export async function getClientDashboard(trainerId: string): Promise<ClientDashboardData[]> {
  const clients = await getClients(trainerId);
  const dashboardData: ClientDashboardData[] = [];

  for (const client of clients) {
    const [lastWorkout, assignments] = await Promise.all([
      supabase
        .from('workout_logs')
        .select('date')
        .eq('user_id', client.client_id)
        .eq('completed', true)
        .order('date', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('workout_assignments')
        .select('id', { count: 'exact' })
        .eq('client_id', client.client_id)
        .eq('trainer_id', trainerId)
        .eq('status', 'pending'),
    ]);

    dashboardData.push({
      id: client.client_id,
      name: client.client_name ?? 'Unknown',
      avatar_url: client.client_avatar_url ?? null,
      last_workout_date: lastWorkout.data?.date ?? null,
      streak: 0, // computed separately if needed
      this_week: 0,
      pending_assignments: assignments.count ?? 0,
    });
  }

  return dashboardData;
}

// ─── Workout Templates (#19) ──────────────────────────────────────────

export async function createTemplate(template: Omit<WorkoutTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<WorkoutTemplate> {
  const { data, error } = await supabase
    .from('workout_templates')
    .insert(template)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplate(id: string, updates: Partial<WorkoutTemplate>): Promise<WorkoutTemplate> {
  const { data, error } = await supabase
    .from('workout_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('workout_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getMyTemplates(creatorId: string): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPublicPrograms(limit = 20): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('workout_templates')
    .select(`
      *,
      creator:profiles!workout_templates_creator_id_fkey(name, avatar_url),
      followers:program_followers(count)
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    follower_count: row.followers?.[0]?.count ?? 0,
  }));
}

// ─── Assignments (#20) ────────────────────────────────────────────────

export async function assignWorkout(
  trainerId: string,
  clientId: string,
  templateId: string,
  dueDate?: string
): Promise<WorkoutAssignment> {
  const { data, error } = await supabase
    .from('workout_assignments')
    .insert({
      trainer_id: trainerId,
      client_id: clientId,
      template_id: templateId,
      due_date: dueDate ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getClientAssignments(clientId: string): Promise<WorkoutAssignment[]> {
  const { data, error } = await supabase
    .from('workout_assignments')
    .select(`
      *,
      template:workout_templates(name, name_bg, difficulty, exercises, duration_minutes)
    `)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('assigned_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function completeAssignment(assignmentId: string, workoutLogId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_assignments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      workout_log_id: workoutLogId,
    })
    .eq('id', assignmentId);

  if (error) throw error;
}

// ─── Public Programs (#21) ────────────────────────────────────────────

export async function followProgram(templateId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('program_followers')
    .insert({ template_id: templateId, user_id: userId });

  if (error) throw error;
}

export async function unfollowProgram(templateId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('program_followers')
    .delete()
    .eq('template_id', templateId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getFollowedPrograms(userId: string): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('program_followers')
    .select(`
      template:workout_templates(*)
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((row: any) => row.template).filter(Boolean);
}

// ─── Feedback (#22) ───────────────────────────────────────────────────

export async function addFeedback(
  workoutLogId: string,
  trainerId: string,
  message: string
): Promise<WorkoutFeedback> {
  const { data, error } = await supabase
    .from('workout_feedback')
    .insert({ workout_log_id: workoutLogId, trainer_id: trainerId, message })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getFeedbackForWorkout(workoutLogId: string): Promise<WorkoutFeedback[]> {
  const { data, error } = await supabase
    .from('workout_feedback')
    .select(`
      *,
      trainer:profiles!workout_feedback_trainer_id_fkey(name)
    `)
    .eq('workout_log_id', workoutLogId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    trainer_name: row.trainer?.name,
  }));
}

// ─── Goals (#23) ──────────────────────────────────────────────────────

export async function createGoal(goal: Omit<ClientGoal, 'id' | 'current_value' | 'created_at'>): Promise<ClientGoal> {
  const { data, error } = await supabase
    .from('client_goals')
    .insert(goal)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateGoalProgress(goalId: string, currentValue: number): Promise<void> {
  const { error } = await supabase
    .from('client_goals')
    .update({ current_value: currentValue })
    .eq('id', goalId);

  if (error) throw error;
}

export async function getClientGoals(clientId: string): Promise<ClientGoal[]> {
  const { data, error } = await supabase
    .from('client_goals')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function markGoalAchieved(goalId: string): Promise<void> {
  const { error } = await supabase
    .from('client_goals')
    .update({ status: 'achieved' })
    .eq('id', goalId);

  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/trainerService.ts
git commit -m "feat: add trainerService with all data access functions (#16-23)"
```

---

## Task 4: i18n — Trainer Translation Keys

**Files:**
- Modify: `src/constants/i18n.ts`

- [ ] **Step 1: Add trainer translation keys to both languages**

Add these keys to the translations object:

```typescript
// English additions
trainer: {
  dashboard: 'Dashboard',
  clients: 'Clients',
  programs: 'Programs',
  invite: 'Invite Client',
  createWorkout: 'Create Workout',
  totalClients: 'Clients',
  activeToday: 'Active Today',
  pendingInvites: 'Pending',
  recentActivity: 'Recent Activity',
  noClients: 'No clients yet. Invite your first client!',
  inviteCode: 'Invite Code',
  generateCode: 'Generate New Code',
  codeExpires: 'Expires in 7 days',
  copyCode: 'Copy Code',
  enterCode: 'Enter Trainer Code',
  enterCodePlaceholder: 'e.g. ABC123',
  connect: 'Connect',
  invalidCode: 'Invalid or expired code',
  connected: 'Connected!',
  assignWorkout: 'Assign Workout',
  assigned: 'Assigned',
  completed: 'Completed',
  overdue: 'Overdue',
  feedback: 'Feedback',
  addFeedback: 'Add Feedback',
  feedbackPlaceholder: 'Great work! Here are some notes...',
  goals: 'Goals',
  addGoal: 'Add Goal',
  goalAchieved: 'Goal Achieved!',
  publicPrograms: 'Public Programs',
  follow: 'Follow',
  unfollow: 'Unfollow',
  followers: 'followers',
  lastWorkout: 'Last workout',
  noActivity: 'No activity yet',
  daysAgo: 'days ago',
},

// Bulgarian additions
trainer: {
  dashboard: 'Табло',
  clients: 'Клиенти',
  programs: 'Програми',
  invite: 'Покани клиент',
  createWorkout: 'Създай тренировка',
  totalClients: 'Клиенти',
  activeToday: 'Активни днес',
  pendingInvites: 'Чакащи',
  recentActivity: 'Последна активност',
  noClients: 'Все още нямате клиенти. Поканете първия си клиент!',
  inviteCode: 'Код за покана',
  generateCode: 'Генерирай нов код',
  codeExpires: 'Валиден 7 дни',
  copyCode: 'Копирай кода',
  enterCode: 'Въведи код на треньор',
  enterCodePlaceholder: 'напр. ABC123',
  connect: 'Свържи се',
  invalidCode: 'Невалиден или изтекъл код',
  connected: 'Свързано!',
  assignWorkout: 'Задай тренировка',
  assigned: 'Зададена',
  completed: 'Завършена',
  overdue: 'Просрочена',
  feedback: 'Обратна връзка',
  addFeedback: 'Добави бележка',
  feedbackPlaceholder: 'Браво! Ето няколко бележки...',
  goals: 'Цели',
  addGoal: 'Добави цел',
  goalAchieved: 'Целта е постигната!',
  publicPrograms: 'Публични програми',
  follow: 'Последвай',
  unfollow: 'Спри да следваш',
  followers: 'последователи',
  lastWorkout: 'Последна тренировка',
  noActivity: 'Няма активност',
  daysAgo: 'дни',
},
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/i18n.ts
git commit -m "feat: add trainer i18n keys for BG and EN"
```

---

## Task 5: Conditional Navigation — Role-Based Tabs

**Files:**
- Modify: `app/_layout.tsx` (add role-based redirect)
- Create: `app/(trainer-tabs)/_layout.tsx`
- Create: `app/(trainer-tabs)/index.tsx` (placeholder initially)
- Create: `app/(trainer-tabs)/clients.tsx` (placeholder)
- Create: `app/(trainer-tabs)/programs.tsx` (placeholder)
- Create: `app/(trainer-tabs)/profile.tsx` (reuse existing)

- [ ] **Step 1: Modify root layout to redirect trainers**

In `app/_layout.tsx`, update the auth-guard `useEffect` to route trainers to `(trainer-tabs)`:

```typescript
// Inside the useEffect that handles auth redirect:
useEffect(() => {
  const inAuthGroup = segments[0] === '(auth)';
  const inTrainerGroup = segments[0] === '(trainer-tabs)';
  const inClientGroup = segments[0] === '(tabs)';

  if (!session && !inAuthGroup) {
    router.replace('/(auth)/welcome');
  } else if (session && inAuthGroup) {
    // Route based on role
    if (profile?.role === 'trainer') {
      router.replace('/(trainer-tabs)');
    } else {
      router.replace('/(tabs)');
    }
  } else if (session && profile?.role === 'trainer' && inClientGroup) {
    // Trainer accidentally on client tabs — redirect
    router.replace('/(trainer-tabs)');
  } else if (session && profile?.role === 'client' && inTrainerGroup) {
    // Client on trainer tabs — redirect
    router.replace('/(tabs)');
  }
}, [session, segments, profile?.role]);
```

Add `(trainer-tabs)` to the Stack:
```typescript
<Stack.Screen name="(trainer-tabs)" options={{ headerShown: false }} />
```

- [ ] **Step 2: Create trainer tab layout**

```typescript
// app/(trainer-tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';

export default function TrainerTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('trainer.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t('trainer.clients'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: t('trainer.programs'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 3: Create placeholder screens**

Each screen starts with a minimal shell that proves the navigation works. Content is filled in subsequent tasks.

```typescript
// app/(trainer-tabs)/index.tsx — filled in Task 6
// app/(trainer-tabs)/clients.tsx — filled in Task 7
// app/(trainer-tabs)/programs.tsx — filled in Task 8
// app/(trainer-tabs)/profile.tsx — can re-export or link to shared profile
```

- [ ] **Step 4: Test navigation**

Run: `npx expo start` → Sign up as trainer → Verify you land on trainer tabs, not client tabs. Sign up as client → Verify you see client tabs.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/(trainer-tabs)/
git commit -m "feat: add conditional trainer tabs based on profile.role (#17)"
```

---

## Task 6: Trainer Dashboard Screen (#17)

**Files:**
- Modify: `app/(trainer-tabs)/index.tsx`

Based on the user's choice of **Layout B (Action-First)**: quick-action buttons at top, compact stats below, then activity feed.

- [ ] **Step 1: Implement dashboard screen**

```typescript
// app/(trainer-tabs)/index.tsx
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDashboardStats, getRecentClientActivity } from '../../src/lib/trainerService';
import type { TrainerDashboardStats } from '../../src/types/trainer';

export default function TrainerDashboard() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<TrainerDashboardStats | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [s, a] = await Promise.all([
        getDashboardStats(user.id),
        getRecentClientActivity(user.id, 5),
      ]);
      setStats(s);
      setActivity(a);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('home.greeting')},</Text>
            <Text style={styles.userName}>{profile?.name ?? 'Coach'}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/trainer/invite')}>
            <Ionicons name="person-add" size={24} color={Colors.white} />
            <Text style={styles.actionText}>{t('trainer.invite')}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/trainer/workout-builder')}>
            <Ionicons name="barbell" size={24} color={Colors.white} />
            <Text style={styles.actionText}>{t('trainer.createWorkout')}</Text>
          </Pressable>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_clients ?? 0}</Text>
            <Text style={styles.statLabel}>{t('trainer.totalClients')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.active_today ?? 0}</Text>
            <Text style={styles.statLabel}>{t('trainer.activeToday')}</Text>
          </View>
          <View style={[styles.statCard, (stats?.pending_invites ?? 0) > 0 && styles.statCardHighlight]}>
            <Text style={[styles.statValue, (stats?.pending_invites ?? 0) > 0 && { color: Colors.accent }]}>
              {stats?.pending_invites ?? 0}
            </Text>
            <Text style={styles.statLabel}>{t('trainer.pendingInvites')}</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <Text style={styles.sectionTitle}>{t('trainer.recentActivity')}</Text>
        {activity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('trainer.noActivity')}</Text>
          </View>
        ) : (
          activity.map((item: any) => (
            <View key={item.id} style={styles.activityCard}>
              <View style={styles.activityAvatar}>
                <Text style={styles.avatarText}>
                  {(item.user?.name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityName}>{item.user?.name}</Text>
                <Text style={styles.activityDetail}>
                  {item.workout_name} · {Math.round((item.duration_seconds ?? 0) / 60)} min
                </Text>
              </View>
              <Text style={styles.activityTime}>
                {new Date(item.date).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSize.md, color: Colors.textSecondary },
  userName: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginTop: 2 },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionBtnSecondary: { backgroundColor: Colors.primaryDark },
  actionText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.white },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statCardHighlight: { borderWidth: 1, borderColor: Colors.accent },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  emptyCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  activityName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  activityDetail: { fontSize: FontSize.xs, color: Colors.textSecondary },
  activityTime: { fontSize: FontSize.xs, color: Colors.textMuted },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(trainer-tabs)/index.tsx
git commit -m "feat: implement trainer dashboard with action-first layout (#17)"
```

---

## Task 7: Client List & Invite Flow (#16, #18)

**Files:**
- Modify: `app/(trainer-tabs)/clients.tsx`
- Create: `app/trainer/invite.tsx`
- Create: `app/trainer/client/[id].tsx`
- Create: `app/client/enter-code.tsx`

- [ ] **Step 1: Implement client list screen**

```typescript
// app/(trainer-tabs)/clients.tsx
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { getClients } from '../../src/lib/trainerService';
import type { TrainerClient } from '../../src/types/trainer';

export default function ClientsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getClients(user.id);
      setClients(data);
    } catch (err) {
      console.error('Load clients error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadClients(); }, [loadClients]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('trainer.clients')}</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/trainer/invite')}>
            <Ionicons name="person-add" size={20} color={Colors.white} />
          </Pressable>
        </View>

        {clients.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('trainer.noClients')}</Text>
            <Pressable style={styles.inviteBtn} onPress={() => router.push('/trainer/invite')}>
              <Text style={styles.inviteBtnText}>{t('trainer.invite')}</Text>
            </Pressable>
          </View>
        ) : (
          clients.map((client) => (
            <Pressable
              key={client.id}
              style={styles.clientCard}
              onPress={() => router.push(`/trainer/client/${client.client_id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(client.client_name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{client.client_name}</Text>
                <Text style={styles.clientEmail}>{client.client_email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </Pressable>
          ))
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  inviteBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  inviteBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  clientName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  clientEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
```

- [ ] **Step 2: Implement invite code screen (trainer side)**

```typescript
// app/trainer/invite.tsx
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { generateInviteCode, getActiveInvites } from '../../src/lib/trainerService';
import type { TrainerInvite } from '../../src/types/trainer';

export default function InviteScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [invites, setInvites] = useState<TrainerInvite[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (user) loadInvites();
  }, [user]);

  async function loadInvites() {
    if (!user) return;
    const data = await getActiveInvites(user.id);
    setInvites(data);
  }

  async function handleGenerate() {
    if (!user) return;
    setGenerating(true);
    try {
      await generateInviteCode(user.id);
      await loadInvites();
    } catch (err) {
      Alert.alert('Error', 'Failed to generate code');
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode(code: string) {
    await Clipboard.setStringAsync(code);
    Alert.alert(t('trainer.copyCode'), code);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('trainer.inviteCode')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Pressable style={styles.generateBtn} onPress={handleGenerate} disabled={generating}>
        <Ionicons name="add-circle" size={20} color={Colors.white} />
        <Text style={styles.generateText}>{t('trainer.generateCode')}</Text>
      </Pressable>

      {invites.map((invite) => (
        <Pressable key={invite.id} style={styles.codeCard} onPress={() => copyCode(invite.code)}>
          <Text style={styles.codeText}>{invite.code}</Text>
          <Text style={styles.codeExpiry}>{t('trainer.codeExpires')}</Text>
          <Ionicons name="copy-outline" size={18} color={Colors.textMuted} />
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  generateText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  codeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.lg, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  codeText: {
    flex: 1, fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary,
    letterSpacing: 2, fontFamily: 'monospace',
  },
  codeExpiry: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
```

- [ ] **Step 3: Implement enter-code screen (client side)**

```typescript
// app/client/enter-code.tsx
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { redeemInviteCode } from '../../src/lib/trainerService';

export default function EnterCodeScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (code.trim().length < 4) {
      setError(t('trainer.invalidCode'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await redeemInviteCode(code.trim().toUpperCase());
      if (result.success) {
        Alert.alert(t('trainer.connected'), '', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        setError(result.error ?? t('trainer.invalidCode'));
      }
    } catch (err) {
      setError(t('trainer.invalidCode'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t('trainer.enterCode')}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={code}
        onChangeText={(text) => { setCode(text); setError(null); }}
        placeholder={t('trainer.enterCodePlaceholder')}
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="characters"
        maxLength={8}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.submitText}>{t('trainer.connect')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'center' },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xl, textAlign: 'center' },
  input: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.lg, fontSize: FontSize.xl, color: Colors.text,
    textAlign: 'center', letterSpacing: 4, fontWeight: '700',
    borderWidth: 2, borderColor: Colors.border,
  },
  inputError: { borderColor: Colors.error },
  error: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, marginTop: Spacing.lg, alignItems: 'center',
  },
  submitText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.lg },
});
```

- [ ] **Step 4: Register new routes in root layout**

Add Stack screens for the new routes in `app/_layout.tsx`:
```typescript
<Stack.Screen name="trainer/invite" options={{ headerShown: false }} />
<Stack.Screen name="trainer/client/[id]" options={{ headerShown: false }} />
<Stack.Screen name="trainer/workout-builder" options={{ headerShown: false }} />
<Stack.Screen name="client/enter-code" options={{ headerShown: false }} />
```

- [ ] **Step 5: Commit**

```bash
git add app/(trainer-tabs)/clients.tsx app/trainer/invite.tsx app/client/enter-code.tsx app/_layout.tsx
git commit -m "feat: implement client list, invite code generation, and code redemption (#16, #18)"
```

---

## Task 8: Client Detail / Progress View (#18)

**Files:**
- Create: `app/trainer/client/[id].tsx`

- [ ] **Step 1: Implement client progress screen**

This screen shows a trainer's view of a specific client — their workout history, streaks, body metrics, active goals, and pending assignments.

```typescript
// app/trainer/client/[id].tsx
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../src/constants/theme';
import { t } from '../../../src/constants/i18n';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getWorkoutHistory, getWorkoutStats, getBodyMetrics } from '../../../src/lib/workoutService';
import { getClientGoals, getFeedbackForWorkout } from '../../../src/lib/trainerService';
import type { ClientGoal } from '../../../src/types/trainer';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalWorkouts: 0, streak: 0, thisWeek: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [goals, setGoals] = useState<ClientGoal[]>([]);

  useEffect(() => {
    loadClientData();
  }, [id]);

  async function loadClientData() {
    if (!id) return;
    try {
      const [s, h, g] = await Promise.all([
        getWorkoutStats(id),
        getWorkoutHistory(id, 10),
        getClientGoals(id),
      ]);
      setStats(s);
      setHistory(h);
      setGoals(g);
    } catch (err) {
      console.error('Client data load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Client Progress</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.thisWeek}/5</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalWorkouts}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/trainer/assign-workout')}>
            <Ionicons name="add-circle" size={18} color={Colors.white} />
            <Text style={styles.actionText}>{t('trainer.assignWorkout')}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]}>
            <Ionicons name="flag" size={18} color={Colors.white} />
            <Text style={styles.actionText}>{t('trainer.addGoal')}</Text>
          </Pressable>
        </View>

        {/* Goals */}
        {goals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('trainer.goals')}</Text>
            {goals.map((goal) => (
              <View key={goal.id} style={styles.goalCard}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <View style={styles.progressBar}>
                  <View style={[
                    styles.progressFill,
                    { width: `${Math.min(((goal.current_value ?? 0) / (goal.target_value ?? 1)) * 100, 100)}%` }
                  ]} />
                </View>
                <Text style={styles.goalProgress}>
                  {goal.current_value ?? 0} / {goal.target_value} {goal.unit ?? ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Recent Workouts */}
        <Text style={styles.sectionTitle}>{t('trainer.recentActivity')}</Text>
        {history.map((log: any) => (
          <View key={log.id} style={styles.workoutCard}>
            <Text style={styles.workoutName}>{log.workout_name}</Text>
            <Text style={styles.workoutDate}>
              {new Date(log.date).toLocaleDateString()} · {Math.round(log.duration_seconds / 60)} min
            </Text>
          </View>
        ))}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  actionsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, gap: Spacing.xs,
  },
  actionBtnSecondary: { backgroundColor: Colors.primaryDark },
  actionText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.sm },
  sectionTitle: {
    fontSize: FontSize.lg, fontWeight: '700', color: Colors.text,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, marginTop: Spacing.sm,
  },
  goalCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  goalTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  progressBar: {
    height: 6, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.full },
  goalProgress: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  workoutCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  workoutName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  workoutDate: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/trainer/client/
git commit -m "feat: implement client detail/progress view for trainers (#18)"
```

---

## Task 9: Workout Builder (#19)

**Files:**
- Create: `src/components/WorkoutBuilder.tsx`
- Create: `app/trainer/workout-builder.tsx`

- [ ] **Step 1: Create shared WorkoutBuilder component**

This is designed as a reusable component so clients can use it too (issue #30).

```typescript
// src/components/WorkoutBuilder.tsx
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { t } from '../constants/i18n';
import type { TemplateExercise } from '../types/trainer';

interface WorkoutBuilderProps {
  initialName?: string;
  initialExercises?: TemplateExercise[];
  initialDifficulty?: 'beginner' | 'intermediate' | 'advanced';
  showPublicToggle?: boolean;
  onSave: (data: {
    name: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    exercises: TemplateExercise[];
    is_public: boolean;
  }) => void;
  onCancel: () => void;
}

export function WorkoutBuilder({
  initialName = '',
  initialExercises = [],
  initialDifficulty = 'intermediate',
  showPublicToggle = false,
  onSave,
  onCancel,
}: WorkoutBuilderProps) {
  const [name, setName] = useState(initialName);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [exercises, setExercises] = useState<TemplateExercise[]>(initialExercises);
  const [isPublic, setIsPublic] = useState(false);

  function addExercise() {
    setExercises([...exercises, {
      id: Date.now().toString(),
      name: '',
      name_bg: '',
      muscle_group: 'chest',
      sets: 3,
      reps: '8-12',
      rest_seconds: 90,
    }]);
  }

  function updateExercise(index: number, field: keyof TemplateExercise, value: any) {
    const updated = [...exercises];
    (updated[index] as any)[field] = value;
    setExercises(updated);
  }

  function removeExercise(index: number) {
    setExercises(exercises.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!name.trim() || exercises.length === 0) return;
    onSave({ name: name.trim(), difficulty, exercises, is_public: isPublic });
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Workout name"
        placeholderTextColor={Colors.textMuted}
      />

      {/* Difficulty selector */}
      <View style={styles.difficultyRow}>
        {(['beginner', 'intermediate', 'advanced'] as const).map((d) => (
          <Pressable
            key={d}
            style={[styles.difficultyBtn, difficulty === d && styles.difficultyActive]}
            onPress={() => setDifficulty(d)}
          >
            <Text style={[styles.difficultyText, difficulty === d && styles.difficultyTextActive]}>
              {t(`difficulty.${d}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Exercises */}
      {exercises.map((exercise, index) => (
        <View key={exercise.id} style={styles.exerciseCard}>
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseNumber}>#{index + 1}</Text>
            <Pressable onPress={() => removeExercise(index)}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </Pressable>
          </View>
          <TextInput
            style={styles.exerciseInput}
            value={exercise.name}
            onChangeText={(v) => updateExercise(index, 'name', v)}
            placeholder="Exercise name"
            placeholderTextColor={Colors.textMuted}
          />
          <View style={styles.exerciseDetailsRow}>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Sets</Text>
              <TextInput
                style={styles.detailInput}
                value={String(exercise.sets)}
                onChangeText={(v) => updateExercise(index, 'sets', parseInt(v) || 0)}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Reps</Text>
              <TextInput
                style={styles.detailInput}
                value={exercise.reps}
                onChangeText={(v) => updateExercise(index, 'reps', v)}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Rest (s)</Text>
              <TextInput
                style={styles.detailInput}
                value={String(exercise.rest_seconds)}
                onChangeText={(v) => updateExercise(index, 'rest_seconds', parseInt(v) || 0)}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
      ))}

      <Pressable style={styles.addExerciseBtn} onPress={addExercise}>
        <Ionicons name="add" size={20} color={Colors.primary} />
        <Text style={styles.addExerciseText}>Add Exercise</Text>
      </Pressable>

      {showPublicToggle && (
        <Pressable style={styles.publicToggle} onPress={() => setIsPublic(!isPublic)}>
          <Ionicons
            name={isPublic ? 'checkbox' : 'square-outline'}
            size={22}
            color={isPublic ? Colors.primary : Colors.textMuted}
          />
          <Text style={styles.publicText}>Make this program public</Text>
        </Pressable>
      )}

      <View style={styles.buttonRow}>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>Save Workout</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg },
  nameInput: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: FontSize.lg, fontWeight: '700',
    color: Colors.text, marginBottom: Spacing.md,
  },
  difficultyRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  difficultyBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  difficultyActive: { backgroundColor: Colors.primary },
  difficultyText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  difficultyTextActive: { color: Colors.white, fontWeight: '600' },
  exerciseCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  exerciseHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  exerciseNumber: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  exerciseInput: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.sm,
  },
  exerciseDetailsRow: { flexDirection: 'row', gap: Spacing.sm },
  detailField: { flex: 1 },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  detailInput: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.text, textAlign: 'center',
  },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, gap: Spacing.xs,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    borderStyle: 'dashed', marginVertical: Spacing.md,
  },
  addExerciseText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  publicToggle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  publicText: { fontSize: FontSize.sm, color: Colors.text },
  buttonRow: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
  saveBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  saveText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
```

- [ ] **Step 2: Create trainer workout-builder screen wrapper**

```typescript
// app/trainer/workout-builder.tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Colors } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { WorkoutBuilder } from '../../src/components/WorkoutBuilder';
import { createTemplate } from '../../src/lib/trainerService';

export default function TrainerWorkoutBuilder() {
  const router = useRouter();
  const { user } = useAuth();

  async function handleSave(data: any) {
    if (!user) return;
    try {
      await createTemplate({
        creator_id: user.id,
        name: data.name,
        name_bg: null,
        description: null,
        description_bg: null,
        difficulty: data.difficulty,
        duration_minutes: null,
        muscle_groups: [],
        exercises: data.exercises,
        is_public: data.is_public,
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', 'Failed to save workout');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <WorkoutBuilder
        showPublicToggle={true}
        onSave={handleSave}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkoutBuilder.tsx app/trainer/workout-builder.tsx
git commit -m "feat: implement workout builder component and trainer screen (#19)"
```

---

## Task 10: Programs Screen & Public Programs (#21)

**Files:**
- Modify: `app/(trainer-tabs)/programs.tsx`

- [ ] **Step 1: Implement programs screen (trainer's workout library + public programs)**

```typescript
// app/(trainer-tabs)/programs.tsx
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { getMyTemplates } from '../../src/lib/trainerService';
import type { WorkoutTemplate } from '../../src/types/trainer';

export default function ProgramsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getMyTemplates(user.id);
      setTemplates(data);
    } catch (err) {
      console.error('Load templates error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('trainer.programs')}</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/trainer/workout-builder')}>
            <Ionicons name="add" size={24} color={Colors.white} />
          </Pressable>
        </View>

        {templates.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No programs yet. Create your first workout!</Text>
          </View>
        ) : (
          templates.map((template) => (
            <View key={template.id} style={styles.templateCard}>
              <View style={styles.templateHeader}>
                <Text style={styles.templateName}>{template.name}</Text>
                {template.is_public && (
                  <View style={styles.publicBadge}>
                    <Ionicons name="globe-outline" size={12} color={Colors.primary} />
                    <Text style={styles.publicBadgeText}>Public</Text>
                  </View>
                )}
              </View>
              <Text style={styles.templateMeta}>
                {template.exercises?.length ?? 0} exercises · {t(`difficulty.${template.difficulty}`)}
              </Text>
            </View>
          ))
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  templateCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  templateHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  templateName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  publicBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryDark, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  publicBadgeText: { fontSize: FontSize.xs, color: Colors.primaryLight },
  templateMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(trainer-tabs)/programs.tsx
git commit -m "feat: implement programs screen with template library (#19, #21)"
```

---

## Task 11: Workout Feedback (#22) and Goals (#23)

These are integrated into the client detail view (Task 8) and the trainer dashboard. The service functions are already in trainerService.ts (Task 3).

**Files:**
- Create: `src/components/FeedbackInput.tsx`
- Modify: `app/trainer/client/[id].tsx` (add feedback and goal creation modals)

- [ ] **Step 1: Create FeedbackInput component**

```typescript
// src/components/FeedbackInput.tsx
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { t } from '../constants/i18n';

interface FeedbackInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
}

export function FeedbackInput({ onSubmit, placeholder }: FeedbackInputProps) {
  const [message, setMessage] = useState('');

  function handleSubmit() {
    if (!message.trim()) return;
    onSubmit(message.trim());
    setMessage('');
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder={placeholder ?? t('trainer.feedbackPlaceholder')}
        placeholderTextColor={Colors.textMuted}
        multiline
      />
      <Pressable style={styles.sendBtn} onPress={handleSubmit}>
        <Ionicons name="send" size={18} color={Colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: FontSize.sm, color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FeedbackInput.tsx
git commit -m "feat: add FeedbackInput component and integrate with client view (#22, #23)"
```

---

## Task 12: Profile Tab for Trainers

**Files:**
- Create: `app/(trainer-tabs)/profile.tsx`

- [ ] **Step 1: Reuse existing profile logic**

The simplest approach is to create a trainer profile that imports and renders the same content as the client profile. Both share: name, role badge, settings, sign out.

```typescript
// app/(trainer-tabs)/profile.tsx
// Re-export the shared profile screen
export { default } from '../(tabs)/profile';
```

If this causes routing issues with expo-router (duplicate component in two layouts), create a minimal wrapper instead:

```typescript
// app/(trainer-tabs)/profile.tsx
import ProfileScreen from '../(tabs)/profile';
export default ProfileScreen;
```

- [ ] **Step 2: Add "Enter Trainer Code" option in client profile**

In `app/(tabs)/profile.tsx`, add a button for clients to connect with a trainer:

```typescript
// Add below existing settings buttons (after the Sign Out section):
{profile?.role === 'client' && (
  <Pressable style={styles.settingsItem} onPress={() => router.push('/client/enter-code')}>
    <Ionicons name="link" size={20} color={Colors.text} />
    <Text style={styles.settingsText}>{t('trainer.enterCode')}</Text>
    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
  </Pressable>
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/(trainer-tabs)/profile.tsx app/(tabs)/profile.tsx
git commit -m "feat: add trainer profile tab and client-side trainer code entry (#16)"
```

---

## Dependency Graph

```
Task 1 (Schema) ─────────────┐
                              ├──► Task 3 (Service) ──► Task 6 (Dashboard)
Task 2 (Types) ──────────────┘                     ──► Task 7 (Clients/Invite)
                                                    ──► Task 8 (Client Detail)
Task 4 (i18n) ──► All UI Tasks                     ──► Task 9 (Workout Builder)
                                                    ──► Task 10 (Programs)
Task 5 (Navigation) ──► All Tab screens             ──► Task 11 (Feedback/Goals)
                                                    ──► Task 12 (Profile)
```

Execute order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12**

Tasks 1-4 are foundational (schema, types, service, i18n). Task 5 sets up navigation. Tasks 6-12 are the UI screens that depend on all prior work.

---

## Testing Strategy

Since issue #8 (testing infrastructure) hasn't been implemented yet, testing is manual for now:

1. **Schema**: Run migration in Supabase Dashboard SQL editor, verify tables exist
2. **Service**: Create a trainer account, generate invite, redeem as client, verify relationship
3. **Navigation**: Sign in as trainer → see trainer tabs. Sign in as client → see client tabs.
4. **Dashboard**: Connect a client, have them complete workouts, verify activity feed shows
5. **Builder**: Create a template, verify it appears in Programs list
6. **Assignments**: Assign a workout, verify client sees it on their Workouts screen

When #8 is implemented, add unit tests for `trainerService.ts` (mock Supabase) and component tests for the builder.
