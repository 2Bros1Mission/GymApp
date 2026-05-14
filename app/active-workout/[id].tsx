import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { sampleWorkouts } from '../../src/data/workouts';
import { useAuth } from '../../src/contexts/AuthContext';
import { saveWorkoutLog } from '../../src/lib/workoutService';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useOfflineGuard } from '../../src/hooks/useOfflineGuard';

const MAX_WEIGHT = 500;
const MAX_REPS = 999;

/**
 * Sanitise numeric input: strip non-digit/non-dot characters.
 * For weight: allow one decimal point and up to 1 decimal place.
 * For reps: integers only.
 */
function sanitizeNumericInput(value: string, field: 'weight' | 'reps'): string {
  if (field === 'reps') {
    // Integers only — strip everything except digits
    return value.replace(/[^0-9]/g, '');
  }
  // Weight — allow digits and one decimal point
  let sanitized = value.replace(/[^0-9.]/g, '');
  // Only keep the first decimal point
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('');
  }
  // Limit to 1 decimal place
  if (parts.length === 2 && parts[1].length > 1) {
    sanitized = parts[0] + '.' + parts[1].substring(0, 1);
  }
  return sanitized;
}

/**
 * Check whether a set has valid data for completion.
 */
function isSetValid(weight: string, reps: string): { valid: boolean; reason: 'weight' | 'reps' | null } {
  const w = parseFloat(weight);
  const r = parseInt(reps, 10);

  if (isNaN(w) || w < 0 || w > MAX_WEIGHT) return { valid: false, reason: 'weight' };
  if (isNaN(r) || r < 1 || r > MAX_REPS) return { valid: false, reason: 'reps' };
  return { valid: true, reason: null };
}

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

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  timerContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  timerText: { fontSize: FontSize.md, fontWeight: '700', color: colors.text },
  progressSection: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  progressBarBg: { flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: BorderRadius.full },
  progressText: { fontSize: FontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  restOverlay: { marginHorizontal: Spacing.lg, backgroundColor: colors.primaryDark, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md },
  restLabel: { fontSize: FontSize.sm, color: colors.primaryLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 2 },
  restTime: { fontSize: 48, fontWeight: '700', color: colors.white, marginVertical: Spacing.sm },
  skipRestBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: colors.primaryLight },
  skipRestText: { fontSize: FontSize.sm, color: colors.primaryLight, fontWeight: '600' },
  content: { paddingHorizontal: Spacing.lg },
  exerciseNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, marginVertical: Spacing.md },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.5 },
  exerciseCounter: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  exerciseName: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: Spacing.xs },
  exerciseTarget: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  setsHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  setHeaderText: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase' },
  setRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  setRowCompleted: { backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '30' },
  setNumber: { fontSize: FontSize.md, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  setInput: { backgroundColor: colors.surfaceLight, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, fontSize: FontSize.md, fontWeight: '600', color: colors.text, textAlign: 'center', marginHorizontal: Spacing.xs },
  checkBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  checkBtnDone: { backgroundColor: colors.success },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, paddingBottom: Spacing.xl, backgroundColor: colors.background + 'F0' },
  nextExerciseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  nextExerciseText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  finishBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  completeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  completeTitle: { fontSize: FontSize.xxxl, fontWeight: '700', color: colors.text, marginTop: Spacing.lg },
  completeSubtitle: { fontSize: FontSize.lg, color: colors.textSecondary, marginTop: Spacing.sm },
  completeStats: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.xl, marginBottom: Spacing.xxl },
  completeStat: { alignItems: 'center' },
  completeStatValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  completeStatLabel: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 4 },
  errorToast: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.error + '15', borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md, width: '100%', borderWidth: 1, borderColor: colors.error + '30' },
  errorToastText: { flex: 1, fontSize: FontSize.sm, color: colors.error, fontWeight: '500' },
  retryButton: { backgroundColor: colors.error, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  retryButtonText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
  doneButton: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl },
  doneButtonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  errorText: { fontSize: FontSize.lg, color: colors.textSecondary, textAlign: 'center', marginTop: 100 },
  centeredPanel: { maxWidth: 600, width: '100%', alignSelf: 'center' },
});

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  const workout = sampleWorkouts.find((w) => w.id === id);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

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
        <Text style={styles.errorText}>{t('activeWorkout.loading')}</Text>
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

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const toggleSetComplete = (setIndex: number) => {
    const set = currentExercise.sets[setIndex];

    // When marking as complete (not unchecking), validate inputs
    if (!set.completed) {
      const { valid, reason } = isSetValid(set.weight, set.reps);
      if (!valid) {
        const msg = reason === 'weight'
          ? t('validation.weightRange')
          : t('validation.repsRange');
        showAlert(t('validation.invalidInput'), msg);
        return;
      }
    }

    setExercises((prev) => {
      const updated = [...prev];
      const ex = { ...updated[currentExerciseIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], completed: !sets[setIndex].completed };
      ex.sets = sets;
      updated[currentExerciseIndex] = ex;
      return updated;
    });

    if (!set.completed) {
      setRestTimer(currentExercise.restSeconds);
      setIsResting(true);
    }
  };

  const updateSetField = (setIndex: number, field: 'weight' | 'reps', value: string) => {
    const sanitized = sanitizeNumericInput(value, field);
    setExercises((prev) => {
      const updated = [...prev];
      const ex = { ...updated[currentExerciseIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], [field]: sanitized };
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

  const doSave = async () => {
    if (!user || !workout) return;
    setIsSaving(true);
    setSaveError(null);

    const { error } = await saveWorkoutLog({
      userId: user.id,
      workoutId: workout.id,
      workoutName: language === 'bg' ? workout.nameBg : workout.name,
      durationSeconds: elapsedSeconds,
      exercises: exercises.map((ex, idx) => ({
        exerciseId: ex.exerciseId,
        exerciseName: language === 'bg' ? ex.nameBg : ex.name,
        orderIndex: idx,
        sets: ex.sets.map((s) => ({
          setNumber: s.setNumber,
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps, 10) || 0,
          completed: s.completed,
        })),
      })),
    });

    setIsSaving(false);
    if (error) {
      setSaveError(error);
    }
  };

  const finishWorkout = () => {
    guardAction(async () => {
      setWorkoutComplete(true);
      if (timerRef.current) clearInterval(timerRef.current);
      await doSave();
    });
  };

  if (workoutComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.completeContainer, isWide && styles.centeredPanel]}>
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          <Text style={styles.completeTitle}>{t('exercise.completed')}</Text>
          <Text style={styles.completeSubtitle}>{t('exercise.great')}</Text>
          <View style={styles.completeStats}>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{formatTime(elapsedSeconds)}</Text>
              <Text style={styles.completeStatLabel}>{t('activeWorkout.time')}</Text>
            </View>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{completedSets}/{totalSets}</Text>
              <Text style={styles.completeStatLabel}>{t('exercise.sets')}</Text>
            </View>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{exercises.length}</Text>
              <Text style={styles.completeStatLabel}>{t('activeWorkout.exercises')}</Text>
            </View>
          </View>

          {saveError && (
            <View style={styles.errorToast}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.errorToastText}>{t('activeWorkout.saveFailed')}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={doSave}
                disabled={isSaving}
              >
                <Text style={styles.retryButtonText}>
                  {isSaving ? t('activeWorkout.saving') : t('activeWorkout.retry')}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[isWide && styles.centeredPanel, { flex: 1 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.timerContainer}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${overallProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completedSets}/{totalSets} {t('exercise.sets')}
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
              <Ionicons name="chevron-back" size={20} color={currentExerciseIndex === 0 ? colors.textMuted : colors.text} />
            </Pressable>
            <Text style={styles.exerciseCounter}>
              {currentExerciseIndex + 1} / {exercises.length}
            </Text>
            <Pressable
              onPress={goToNextExercise}
              style={[styles.navBtn, currentExerciseIndex === exercises.length - 1 && styles.navBtnDisabled]}
              disabled={currentExerciseIndex === exercises.length - 1}
            >
              <Ionicons name="chevron-forward" size={20} color={currentExerciseIndex === exercises.length - 1 ? colors.textMuted : colors.text} />
            </Pressable>
          </View>

          <Text style={styles.exerciseName}>{language === 'bg' ? currentExercise.nameBg : currentExercise.name}</Text>
          <Text style={styles.exerciseTarget}>
            {t('exercise.target')}: {currentExercise.sets[0].targetReps} {t('exercise.reps')}
          </Text>

          <View style={styles.setsHeader}>
            <Text style={[styles.setHeaderText, { flex: 0.5 }]}>{t('exercise.set')}</Text>
            <Text style={[styles.setHeaderText, { flex: 1 }]}>{t('exercise.weight')}</Text>
            <Text style={[styles.setHeaderText, { flex: 1 }]}>{t('exercise.repsShort')}</Text>
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
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                editable={!set.completed}
              />
              <TextInput
                style={[styles.setInput, { flex: 1 }]}
                value={set.reps}
                onChangeText={(v) => updateSetField(i, 'reps', v)}
                placeholder={set.targetReps}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                editable={!set.completed}
              />
              <Pressable
                style={[styles.checkBtn, set.completed && styles.checkBtnDone, { flex: 0.5 }]}
                onPress={() => toggleSetComplete(i)}
              >
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={set.completed ? colors.white : colors.textMuted}
                />
              </Pressable>
            </View>
          ))}

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          {currentExerciseIndex < exercises.length - 1 ? (
            <Pressable style={styles.nextExerciseBtn} onPress={goToNextExercise}>
              <Text style={styles.nextExerciseText}>{t('activeWorkout.nextExercise')}</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <Pressable style={styles.finishBtn} onPress={finishWorkout}>
              <Ionicons name="checkmark-circle" size={22} color={colors.white} />
              <Text style={styles.finishBtnText}>{t('exercise.finish')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
