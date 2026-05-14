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
  trainerEmail?: string;
}
