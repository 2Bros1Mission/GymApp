import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { createCustomWorkout, updateCustomWorkout, getCustomWorkout } from '../src/lib/trainerService';
import type { Exercise, MuscleGroup, DifficultyLevel } from '../src/types';

const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'full_body'];
const DIFFICULTIES: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

interface ExerciseForm {
  id: string;
  name: string;
  nameBg: string;
  muscleGroup: MuscleGroup;
  sets: string;
  reps: string;
  restSeconds: string;
}

function newExercise(): ExerciseForm {
  return {
    id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    nameBg: '',
    muscleGroup: 'chest',
    sets: '3',
    reps: '10',
    restSeconds: '60',
  };
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  fieldGroup: { gap: Spacing.xs, marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary, marginLeft: Spacing.xs },
  input: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputSmall: { backgroundColor: colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, fontSize: FontSize.sm, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: 'center', width: 64 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  exerciseCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  exerciseNumber: { fontSize: FontSize.sm, fontWeight: '700', color: colors.primary },
  removeBtn: { padding: Spacing.xs },
  exerciseFieldRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  exerciseFieldLabel: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600', width: 50 },
  muscleSelect: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  muscleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.sm, backgroundColor: colors.surfaceLight },
  muscleChipActive: { backgroundColor: colors.primaryDark },
  muscleChipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  muscleChipTextActive: { color: colors.primaryLight },
  addExerciseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', marginTop: Spacing.sm },
  addExerciseBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.md },
  switchLabel: { fontSize: FontSize.md, fontWeight: '500', color: colors.text },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md + 2, marginTop: Spacing.xl },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.success + '15', borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.md },
  successText: { fontSize: FontSize.sm, color: colors.success, flex: 1 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.error + '15', borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.md },
  errorText: { fontSize: FontSize.sm, color: colors.error, flex: 1 },
});

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const [name, setName] = useState('');
  const [nameBg, setNameBg] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionBg, setDescriptionBg] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [duration, setDuration] = useState('30');
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [exercises, setExercises] = useState<ExerciseForm[]>([newExercise()]);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Load existing workout for editing
  useEffect(() => {
    if (!editId) return;
    setLoadingExisting(true);
    getCustomWorkout(editId).then((w) => {
      if (w) {
        setName(w.name);
        setNameBg(w.nameBg);
        setDescription(w.description);
        setDescriptionBg(w.descriptionBg);
        setDifficulty(w.difficulty);
        setDuration(String(w.durationMinutes));
        setMuscleGroups(w.muscleGroups);
        setIsPublic(w.isPublic);
        setExercises(w.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          nameBg: e.nameBg,
          muscleGroup: e.muscleGroup,
          sets: String(e.sets),
          reps: e.reps,
          restSeconds: String(e.restSeconds),
        })));
      }
      setLoadingExisting(false);
    });
  }, [editId]);

  const toggleMuscleGroup = (mg: MuscleGroup) => {
    setMuscleGroups((prev) =>
      prev.includes(mg) ? prev.filter((g) => g !== mg) : [...prev, mg]
    );
  };

  const updateExercise = (index: number, field: keyof ExerciseForm, value: string) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateExerciseMuscle = (index: number, mg: MuscleGroup) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], muscleGroup: mg };
      return updated;
    });
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    setExercises((prev) => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  };

  const isValid = name.trim() !== '' && exercises.length > 0 && exercises.every((e) => e.name.trim() !== '');

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    setError('');
    setSuccess('');

    const exerciseData: Exercise[] = exercises.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      nameBg: e.nameBg.trim(),
      muscleGroup: e.muscleGroup,
      sets: parseInt(e.sets, 10) || 3,
      reps: e.reps || '10',
      restSeconds: parseInt(e.restSeconds, 10) || 60,
    }));

    const workoutData = {
      name: name.trim(),
      nameBg: nameBg.trim(),
      description: description.trim(),
      descriptionBg: descriptionBg.trim(),
      difficulty,
      durationMinutes: parseInt(duration, 10) || 30,
      muscleGroups,
      exercises: exerciseData,
      isPublic,
    };

    let result;
    if (editId) {
      result = await updateCustomWorkout(editId, workoutData);
    } else {
      result = await createCustomWorkout({ ...workoutData, creatorId: user.id });
    }

    setSaving(false);

    if (result.error) {
      setError(t('builder.saveError'));
    } else {
      setSuccess(t('builder.saved'));
      setTimeout(() => router.back(), 800);
    }
  };

  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>{editId ? t('builder.editTitle') : t('builder.title')}</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Workout name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.workoutName')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('builder.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.workoutNameBg')}</Text>
            <TextInput
              style={styles.input}
              value={nameBg}
              onChangeText={setNameBg}
              placeholder={t('builder.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.description')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.descriptionBg')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={descriptionBg}
              onChangeText={setDescriptionBg}
              multiline
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Difficulty */}
          <Text style={styles.sectionTitle}>{t('builder.difficulty')}</Text>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => (
              <Pressable
                key={d}
                style={[styles.chip, difficulty === d && styles.chipActive]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={[styles.chipText, difficulty === d && styles.chipTextActive]}>
                  {t(`difficulty.${d}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Duration */}
          <View style={[styles.fieldGroup, { marginTop: Spacing.md }]}>
            <Text style={styles.fieldLabel}>{t('builder.duration')}</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              value={duration}
              onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>

          {/* Muscle groups */}
          <Text style={styles.sectionTitle}>{t('builder.muscleGroups')}</Text>
          <View style={styles.chipRow}>
            {MUSCLE_GROUPS.map((mg) => (
              <Pressable
                key={mg}
                style={[styles.chip, muscleGroups.includes(mg) && styles.chipActive]}
                onPress={() => toggleMuscleGroup(mg)}
              >
                <Text style={[styles.chipText, muscleGroups.includes(mg) && styles.chipTextActive]}>
                  {t(`muscle.${mg}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Exercises */}
          <Text style={styles.sectionTitle}>{t('builder.exercises')}</Text>

          {exercises.map((ex, index) => (
            <View key={ex.id} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Text style={styles.exerciseNumber}>#{index + 1}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Pressable onPress={() => moveExercise(index, -1)} disabled={index === 0}>
                      <Ionicons name="arrow-up" size={18} color={index === 0 ? colors.textMuted : colors.text} />
                    </Pressable>
                    <Pressable onPress={() => moveExercise(index, 1)} disabled={index === exercises.length - 1}>
                      <Ionicons name="arrow-down" size={18} color={index === exercises.length - 1 ? colors.textMuted : colors.text} />
                    </Pressable>
                  </View>
                </View>
                <Pressable style={styles.removeBtn} onPress={() => removeExercise(index)}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>

              {/* Exercise name */}
              <TextInput
                style={styles.input}
                value={ex.name}
                onChangeText={(v) => updateExercise(index, 'name', v)}
                placeholder={t('builder.exerciseName')}
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, { marginTop: Spacing.xs }]}
                value={ex.nameBg}
                onChangeText={(v) => updateExercise(index, 'nameBg', v)}
                placeholder={t('builder.exerciseNameBg')}
                placeholderTextColor={colors.textMuted}
              />

              {/* Muscle group */}
              <View style={styles.muscleSelect}>
                {MUSCLE_GROUPS.map((mg) => (
                  <Pressable
                    key={mg}
                    style={[styles.muscleChip, ex.muscleGroup === mg && styles.muscleChipActive]}
                    onPress={() => updateExerciseMuscle(index, mg)}
                  >
                    <Text style={[styles.muscleChipText, ex.muscleGroup === mg && styles.muscleChipTextActive]}>
                      {t(`muscle.${mg}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Sets / Reps / Rest */}
              <View style={styles.exerciseFieldRow}>
                <Text style={styles.exerciseFieldLabel}>{t('builder.sets')}</Text>
                <TextInput
                  style={styles.inputSmall}
                  value={ex.sets}
                  onChangeText={(v) => updateExercise(index, 'sets', v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={styles.exerciseFieldLabel}>{t('builder.reps')}</Text>
                <TextInput
                  style={[styles.inputSmall, { width: 80 }]}
                  value={ex.reps}
                  onChangeText={(v) => updateExercise(index, 'reps', v)}
                  maxLength={10}
                />
                <Text style={styles.exerciseFieldLabel}>{t('builder.rest')}</Text>
                <TextInput
                  style={styles.inputSmall}
                  value={ex.restSeconds}
                  onChangeText={(v) => updateExercise(index, 'restSeconds', v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
            </View>
          ))}

          <Pressable style={styles.addExerciseBtn} onPress={() => setExercises((prev) => [...prev, newExercise()])}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.addExerciseBtnText}>{t('builder.addExercise')}</Text>
          </Pressable>

          {/* Public toggle */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('builder.public')}</Text>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.surfaceLight, true: colors.primary + '60' }}
              thumbColor={isPublic ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Feedback */}
          {success !== '' && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}
          {error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Save button */}
          <Pressable
            style={[styles.saveBtn, (!isValid || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color={colors.white} />
                <Text style={styles.saveBtnText}>{t('builder.save')}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
