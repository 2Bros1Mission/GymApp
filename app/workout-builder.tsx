import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useWorkoutBuilderForm } from '../src/hooks/useWorkoutBuilderForm';
import { ExerciseFormCard } from '../src/components/ExerciseFormCard';
import type { MuscleGroup, DifficultyLevel } from '../src/types';

const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'full_body'];
const DIFFICULTIES: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const form = useWorkoutBuilderForm(editId);

  if (form.loadingExisting) {
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
              value={form.name}
              onChangeText={form.setName}
              placeholder={t('builder.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.workoutNameBg')}</Text>
            <TextInput
              style={styles.input}
              value={form.nameBg}
              onChangeText={form.setNameBg}
              placeholder={t('builder.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.description')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={form.setDescription}
              multiline
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('builder.descriptionBg')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={form.descriptionBg}
              onChangeText={form.setDescriptionBg}
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
                style={[styles.chip, form.difficulty === d && styles.chipActive]}
                onPress={() => form.setDifficulty(d)}
              >
                <Text style={[styles.chipText, form.difficulty === d && styles.chipTextActive]}>
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
              value={form.duration}
              onChangeText={(v) => form.setDuration(v.replace(/[^0-9]/g, ''))}
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
                style={[styles.chip, form.muscleGroups.includes(mg) && styles.chipActive]}
                onPress={() => form.toggleMuscleGroup(mg)}
              >
                <Text style={[styles.chipText, form.muscleGroups.includes(mg) && styles.chipTextActive]}>
                  {t(`muscle.${mg}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Exercises */}
          <Text style={styles.sectionTitle}>{t('builder.exercises')}</Text>

          {form.exercises.map((ex, index) => (
            <ExerciseFormCard
              key={ex.id}
              exercise={ex}
              index={index}
              total={form.exercises.length}
              onUpdate={form.updateExercise}
              onUpdateMuscle={form.updateExerciseMuscle}
              onRemove={form.removeExercise}
              onMove={form.moveExercise}
            />
          ))}

          <Pressable style={styles.addExerciseBtn} onPress={form.addExercise}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.addExerciseBtnText}>{t('builder.addExercise')}</Text>
          </Pressable>

          {/* Public toggle */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('builder.public')}</Text>
            <Switch
              value={form.isPublic}
              onValueChange={form.setIsPublic}
              trackColor={{ false: colors.surfaceLight, true: colors.primary + '60' }}
              thumbColor={form.isPublic ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Feedback */}
          {form.success !== '' && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.successText}>{form.success}</Text>
            </View>
          )}
          {form.error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{form.error}</Text>
            </View>
          )}

          {/* Save button */}
          <Pressable
            style={[styles.saveBtn, (!form.isValid || form.saving) && styles.saveBtnDisabled]}
            onPress={form.handleSave}
            disabled={!form.isValid || form.saving}
          >
            {form.saving ? (
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
