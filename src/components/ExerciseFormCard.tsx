import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';
import type { MuscleGroup } from '../types';
import type { ExerciseForm } from '../hooks/useWorkoutBuilderForm';

const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'full_body'];

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  number: { fontSize: FontSize.sm, fontWeight: '700', color: colors.primary },
  removeBtn: { padding: Spacing.xs },
  input: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputSmall: { backgroundColor: colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, fontSize: FontSize.sm, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: 'center', width: 64 },
  fieldRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  fieldLabel: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600', width: 50 },
  muscleSelect: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  muscleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.sm, backgroundColor: colors.surfaceLight },
  muscleChipActive: { backgroundColor: colors.primaryDark },
  muscleChipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  muscleChipTextActive: { color: colors.primaryLight },
});

interface ExerciseFormCardProps {
  exercise: ExerciseForm;
  index: number;
  total: number;
  onUpdate: (index: number, field: keyof ExerciseForm, value: string) => void;
  onUpdateMuscle: (index: number, mg: MuscleGroup) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

export function ExerciseFormCard({ exercise, index, total, onUpdate, onUpdateMuscle, onRemove, onMove }: ExerciseFormCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Text style={styles.number}>#{index + 1}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={() => onMove(index, -1)} disabled={index === 0}>
              <Ionicons name="arrow-up" size={18} color={index === 0 ? colors.textMuted : colors.text} />
            </Pressable>
            <Pressable onPress={() => onMove(index, 1)} disabled={index === total - 1}>
              <Ionicons name="arrow-down" size={18} color={index === total - 1 ? colors.textMuted : colors.text} />
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.removeBtn} onPress={() => onRemove(index)}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        value={exercise.name}
        onChangeText={(v) => onUpdate(index, 'name', v)}
        placeholder={t('builder.exerciseName')}
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={[styles.input, { marginTop: Spacing.xs }]}
        value={exercise.nameBg}
        onChangeText={(v) => onUpdate(index, 'nameBg', v)}
        placeholder={t('builder.exerciseNameBg')}
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.muscleSelect}>
        {MUSCLE_GROUPS.map((mg) => (
          <Pressable
            key={mg}
            style={[styles.muscleChip, exercise.muscleGroup === mg && styles.muscleChipActive]}
            onPress={() => onUpdateMuscle(index, mg)}
          >
            <Text style={[styles.muscleChipText, exercise.muscleGroup === mg && styles.muscleChipTextActive]}>
              {t(`muscle.${mg}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{t('builder.sets')}</Text>
        <TextInput
          style={styles.inputSmall}
          value={exercise.sets}
          onChangeText={(v) => onUpdate(index, 'sets', v.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.fieldLabel}>{t('builder.reps')}</Text>
        <TextInput
          style={[styles.inputSmall, { width: 80 }]}
          value={exercise.reps}
          onChangeText={(v) => onUpdate(index, 'reps', v)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>{t('builder.rest')}</Text>
        <TextInput
          style={styles.inputSmall}
          value={exercise.restSeconds}
          onChangeText={(v) => onUpdate(index, 'restSeconds', v.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
          maxLength={3}
        />
      </View>
    </View>
  );
}
