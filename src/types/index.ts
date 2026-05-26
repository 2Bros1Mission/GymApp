export interface Exercise {
  id: string;
  name: string;
  nameBg: string;
  muscleGroup: MuscleGroup;
  sets: number;
  reps: string;
  restSeconds: number;
  imageUrl?: string;
}

export interface WorkoutExercise extends Exercise {
  completedSets: SetLog[];
}

export interface SetLog {
  setNumber: number;
  reps: number;
  weight: number;
  completed: boolean;
}

export interface Workout {
  id: string;
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes: number;
  muscleGroups: MuscleGroup[];
  exercises: Exercise[];
  imageUrl?: string;
}

export interface WorkoutLog {
  id: string;
  workoutId: string;
  date: string;
  startTime: string;
  endTime?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  completed: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'trainer';
  language: 'bg' | 'en';
  createdAt: string;
  weight?: number;
  height?: number;
  goal?: FitnessGoal;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'core'
  | 'full_body';

export type FitnessGoal =
  | 'lose_weight'
  | 'build_muscle'
  | 'get_stronger'
  | 'stay_healthy'
  | 'improve_endurance';

export type GoalType = 'weight_target' | 'lift_target' | 'frequency' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'abandoned';
export type SuggestionStatus = 'pending' | 'accepted' | 'adjusted' | 'rejected';

export interface ClientGoal {
  id: string;
  clientId: string;
  goalType: GoalType;
  title: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  exerciseName: string | null;
  deadline: string | null;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GoalSuggestion {
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
  status: SuggestionStatus;
  clientResponseAt: string | null;
  createdAt: string;
  trainerName?: string;
  targetGoalTitle?: string;
}

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface CustomWorkout {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface TrainerInvite {
  id: string;
  trainerId: string;
  code: string;
  expiresAt: string;
  used: boolean;
  usedBy?: string;
  createdAt: string;
}

export interface ClientWorkoutLog {
  id: string;
  workoutName: string;
  date: string;
  durationSeconds: number | null;
  completed: boolean;
}

export interface ClientBodyMetric {
  date: string;
  weight: number | null;
}

export interface RecentActivity {
  id: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  date: string;
  durationSeconds: number | null;
}

export interface ClientProgress {
  clientId: string;
  clientName: string;
  clientEmail: string;
  weight: number | null;
  height: number | null;
  goal: FitnessGoal | null;
  totalWorkouts: number;
  currentStreak: number;
  lastWorkoutDate: string | null;
  recentWorkouts: ClientWorkoutLog[];
  bodyMetrics: ClientBodyMetric[];
  weeklyActivity: boolean[]; // Mon–Sun, true = worked out
}

export interface WorkoutAssignment {
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

export interface WorkoutFeedback {
  id: string;
  workoutLogId: string;
  trainerId: string;
  trainerName?: string;
  message: string;
  createdAt: string;
}

export interface WorkoutDetail {
  id: string;
  workoutName: string;
  date: string;
  durationSeconds: number | null;
  completed: boolean;
  notes: string | null;
  exercises: WorkoutDetailExercise[];
  feedback: WorkoutFeedback[];
}

export interface WorkoutDetailExercise {
  id: string;
  exerciseName: string;
  orderIndex: number;
  sets: WorkoutDetailSet[];
}

export interface WorkoutDetailSet {
  id: string;
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface Conversation {
  id: string;
  trainerId: string;
  clientId: string;
  lastMessageAt: string;
  createdAt: string;
  // Joined
  otherUserName?: string;
  otherUserEmail?: string;
  lastMessageContent?: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

export interface TrainerClient {
  id: string;
  trainerId: string;
  clientId: string;
  status: 'pending' | 'active' | 'rejected' | 'removed';
  clientConfirmed: boolean;
  connectedAt: string;
  // Joined from profiles
  clientName?: string;
  clientEmail?: string;
  trainerName?: string;
}

// ============================================================
// Challenge & Leaderboard Types (Issue #131)
// ============================================================

export interface ChallengeTemplate {
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

export interface Challenge {
  id: string;
  templateId: string | null;
  source: 'platform' | 'trainer';
  title: string;
  titleBg: string | null;
  description: string | null;
  descriptionBg: string | null;
  challengeType: 'frequency' | 'streak' | 'custom_auto' | 'custom_self_reported';
  cadence: 'daily' | 'weekly' | 'monthly' | 'one_time';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  targetValue: number;
  points: number;
  category: string | null;
  status: 'active' | 'completed' | 'expired';
  startDate: string;
  endDate: string | null;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  currentProgress: number;
  longestStreak: number;
  targetValue: number;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  joinedAt: string;
  completedAt: string | null;
  rank: number | null;
  source: 'discovery' | 'trainer_assigned';
  challenge: Challenge;
}

export interface DiscoveryCard {
  challenge: Challenge;
  state: 'available' | 'cooldown' | 'limit_reached';
  availableAt: string | null;
}

export interface UserChallengeState {
  cadence: 'daily' | 'weekly' | 'monthly';
  completionsThisPeriod: number;
  maxCompletions: number;
  activeCount: number;
  maxActive: number;
  lastPickAt: string | null;
  cooldownEndsAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  points: number;
}

export interface TrainerChallengeTemplate {
  id: string;
  trainerId: string;
  title: string;
  challengeType: 'frequency' | 'streak' | 'custom';
  targetValue: number;
  category: string | null;
  description: string | null;
}
