import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { sampleWorkouts } from '../../src/data/workouts';
import { useAuth } from '../../src/contexts/AuthContext';
import { saveWorkoutLog } from '../../src/lib/workoutService';

interface ActiveSet {
  setNumber: number;
  targetReps: string;
  weight: string;
  reps: string;
  completed: boolean;
}

interface ActiveExercise {
  exerciseId: string;
  name: string;
  nameBg: string;
  sets: ActiveSet[];
  restSeconds: number;
}

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { user } = useAuth();
  const workout = sampleWorkouts.find((w) => w.id === id);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (workout) {
      setExercises(
        workout.exercises.map((ex) => ({
          exerciseId: ex.id,
          name: ex.name,
          nameBg: ex.nameBg,
          restSeconds: ex.restSeconds,
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            setNumber: i + 1,
            targetReps: ex.reps,
            weight: '',
            reps: '',
            completed: false,
          })),
        }))
      );
    }
  }, [workout]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isResting && restTimer > 0) {
      restRef.current = setInterval(() => {
        setRestTimer((t) => {
          if (t <= 1) {
            setIsResting(false);
            if (restRef.current) clearInterval(restRef.current);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [isResting, restTimer]);

  if (!workout || exercises.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Зареждане...</Text>
      </SafeAreaView>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );
  const overallProgress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleSetComplete = (setIndex: number) => {
    setExercises((prev) => {
      const updated = [...prev];
      const ex = { ...updated[currentExerciseIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], completed: !sets[setIndex].completed };
      ex.sets = sets;
      updated[currentExerciseIndex] = ex;
      return updated;
    });

    if (!currentExercise.sets[setIndex].completed) {
      setRestTimer(currentExercise.restSeconds);
      setIsResting(true);
    }
  };

  const updateSetField = (setIndex: number, field: 'weight' | 'reps', value: string) => {
    setExercises((prev) => {
      const updated = [...prev];
      const ex = { ...updated[currentExerciseIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], [field]: value };
      ex.sets = sets;
      updated[currentExerciseIndex] = ex;
      return updated;
    });
  };

  const goToNextExercise = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex((i) => i + 1);
      setIsResting(false);
      setRestTimer(0);
    }
  };

  const goToPrevExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex((i) => i - 1);
      setIsResting(false);
      setRestTimer(0);
    }
  };

  const finishWorkout = async () => {
    setWorkoutComplete(true);
    if (timerRef.current) clearInterval(timerRef.current);

    if (user && workout) {
      await saveWorkoutLog({
        userId: user.id,
        workoutId: workout.id,
        workoutName: workout.nameBg,
        durationSeconds: elapsedSeconds,
        exercises: exercises.map((ex, idx) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.nameBg,
          orderIndex: idx,
          sets: ex.sets.map((s) => ({
            setNumber: s.setNumber,
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps, 10) || 0,
            completed: s.completed,
          })),
        })),
      });
    }
  };

  if (workoutComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completeContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
          <Text style={styles.completeTitle}>{t('exercise.completed')}</Text>
          <Text style={styles.completeSubtitle}>{t('exercise.great')}</Text>
          <View style={styles.completeStats}>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{formatTime(elapsedSeconds)}</Text>
              <Text style={styles.completeStatLabel}>Време</Text>
            </View>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{completedSets}/{totalSets}</Text>
              <Text style={styles.completeStatLabel}>Серии</Text>
            </View>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{exercises.length}</Text>
              <Text style={styles.completeStatLabel}>Упражнения</Text>
            </View>
          </View>
          <Pressable style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Затвори</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${overallProgress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {completedSets}/{totalSets} серии
        </Text>
      </View>

      {isResting && (
        <View style={styles.restOverlay}>
          <Text style={styles.restLabel}>{t('exercise.rest')}</Text>
          <Text style={styles.restTime}>{formatTime(restTimer)}</Text>
          <Pressable
            style={styles.skipRestBtn}
            onPress={() => { setIsResting(false); setRestTimer(0); }}
          >
            <Text style={styles.skipRestText}>{t('exercise.skip')}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.exerciseNav}>
          <Pressable
            onPress={goToPrevExercise}
            style={[styles.navBtn, currentExerciseIndex === 0 && styles.navBtnDisabled]}
            disabled={currentExerciseIndex === 0}
          >
            <Ionicons name="chevron-back" size={20} color={currentExerciseIndex === 0 ? Colors.textMuted : Colors.text} />
          </Pressable>
          <Text style={styles.exerciseCounter}>
            {currentExerciseIndex + 1} / {exercises.length}
          </Text>
          <Pressable
            onPress={goToNextExercise}
            style={[styles.navBtn, currentExerciseIndex === exercises.length - 1 && styles.navBtnDisabled]}
            disabled={currentExerciseIndex === exercises.length - 1}
          >
            <Ionicons name="chevron-forward" size={20} color={currentExerciseIndex === exercises.length - 1 ? Colors.textMuted : Colors.text} />
          </Pressable>
        </View>

        <Text style={styles.exerciseName}>{currentExercise.nameBg}</Text>
        <Text style={styles.exerciseTarget}>
          Цел: {currentExercise.sets[0].targetReps} {t('exercise.reps')}
        </Text>

        <View style={styles.setsHeader}>
          <Text style={[styles.setHeaderText, { flex: 0.5 }]}>Серия</Text>
          <Text style={[styles.setHeaderText, { flex: 1 }]}>кг</Text>
          <Text style={[styles.setHeaderText, { flex: 1 }]}>Повт.</Text>
          <Text style={[styles.setHeaderText, { flex: 0.5 }]}></Text>
        </View>

        {currentExercise.sets.map((set, i) => (
          <View
            key={i}
            style={[styles.setRow, set.completed && styles.setRowCompleted]}
          >
            <Text style={[styles.setNumber, { flex: 0.5 }]}>{set.setNumber}</Text>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              value={set.weight}
              onChangeText={(v) => updateSetField(i, 'weight', v)}
              placeholder="-"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              editable={!set.completed}
            />
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              value={set.reps}
              onChangeText={(v) => updateSetField(i, 'reps', v)}
              placeholder={set.targetReps}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              editable={!set.completed}
            />
            <Pressable
              style={[styles.checkBtn, set.completed && styles.checkBtnDone, { flex: 0.5 }]}
              onPress={() => toggleSetComplete(i)}
            >
              <Ionicons
                name={set.completed ? 'checkmark' : 'checkmark'}
                size={20}
                color={set.completed ? Colors.white : Colors.textMuted}
              />
            </Pressable>
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {currentExerciseIndex < exercises.length - 1 ? (
          <Pressable style={styles.nextExerciseBtn} onPress={goToNextExercise}>
            <Text style={styles.nextExerciseText}>Следващо упражнение</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.white} />
          </Pressable>
        ) : (
          <Pressable style={styles.finishBtn} onPress={finishWorkout}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
            <Text style={styles.finishBtnText}>{t('exercise.finish')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  timerText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  progressSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  progressText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  restOverlay: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  restLabel: {
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  restTime: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.white,
    marginVertical: Spacing.sm,
  },
  skipRestBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  skipRestText: {
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  exerciseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginVertical: Spacing.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  exerciseCounter: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  exerciseName: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  exerciseTarget: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  setsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  setHeaderText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  setRowCompleted: {
    backgroundColor: Colors.success + '15',
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  setNumber: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  setInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: Spacing.xs,
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  checkBtnDone: {
    backgroundColor: Colors.success,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.background + 'F0',
  },
  nextExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  nextExerciseText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  finishBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  completeTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  completeSubtitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  completeStats: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  completeStat: {
    alignItems: 'center',
  },
  completeStatValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  completeStatLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  doneButtonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
  errorText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 100,
  },
});
