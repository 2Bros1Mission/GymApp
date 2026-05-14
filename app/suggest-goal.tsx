import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import { getClientGoalsForTrainer, suggestGoal, suggestAdjustment } from '../src/lib/goalService';
import type { ClientGoal, GoalType } from '../src/types';

const GOAL_TYPES: GoalType[] = ['weight_target', 'lift_target', 'frequency', 'custom'];

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, flex: 1 },

  targetGoalCard: {
    backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md,
    marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  targetGoalLabel: { fontSize: FontSize.xs, color: colors.textSecondary, marginBottom: Spacing.xs },
  targetGoalTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text },
  targetGoalDetail: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2 },

  inputLabel: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: FontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  typePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  typeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  typeChipTextActive: { color: colors.white },

  messageInput: { backgroundColor: colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: FontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 80, textAlignVertical: 'top' },

  submitBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xl },
  submitBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  submitBtnDisabled: { opacity: 0.5 },
});

export default function SuggestGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId: string; goalId?: string }>();
  const clientId = Array.isArray(params.clientId) ? params.clientId[0] : params.clientId;
  const goalId = Array.isArray(params.goalId) ? params.goalId[0] : params.goalId;

  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [goalType, setGoalType] = useState<GoalType>('custom');
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdjustment = !!goalId;

  const goalsFetcher = useCallback(async (): Promise<ClientGoal[]> => {
    if (!clientId) return [];
    return getClientGoalsForTrainer(clientId);
  }, [clientId]);

  const { data: clientGoals } = useFocusAsyncData({
    fetcher: goalsFetcher,
    defaultValue: [] as ClientGoal[],
    enabled: !!clientId,
  });

  const targetGoal = isAdjustment ? clientGoals.find((g) => g.id === goalId) : null;

  // Pre-fill from target goal if adjusting
  useMemo(() => {
    if (targetGoal && !title) {
      setGoalType(targetGoal.goalType);
      setTitle(targetGoal.title);
      setTargetValue(targetGoal.targetValue?.toString() ?? '');
      setUnit(targetGoal.unit ?? '');
      setExerciseName(targetGoal.exerciseName ?? '');
      setDeadline(targetGoal.deadline ?? '');
    }
  }, [targetGoal]);

  const handleSubmit = async () => {
    if (!user || !clientId || !title.trim()) return;
    setSaving(true);
    try {
      let result: { error?: string };
      if (isAdjustment && goalId) {
        result = await suggestAdjustment({
          trainerId: user.id,
          clientId,
          targetGoalId: goalId,
          goalType,
          title: title.trim(),
          targetValue: targetValue ? parseFloat(targetValue) : null,
          unit: unit || null,
          exerciseName: exerciseName || null,
          deadline: deadline || null,
          message: message || null,
        });
      } else {
        result = await suggestGoal({
          trainerId: user.id,
          clientId,
          goalType,
          title: title.trim(),
          targetValue: targetValue ? parseFloat(targetValue) : null,
          unit: unit || null,
          exerciseName: exerciseName || null,
          deadline: deadline || null,
          message: message || null,
        });
      }
      if (result.error) {
        Alert.alert('Error', result.error);
        return;
      }
      Alert.alert(t('suggestions.sent'));
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>
            {isAdjustment ? t('suggestions.suggestAdjustment') : t('suggestions.suggest')}
          </Text>
        </View>

        {targetGoal && (
          <View style={styles.targetGoalCard}>
            <Text style={styles.targetGoalLabel}>{t('suggestions.suggestAdjustment')}</Text>
            <Text style={styles.targetGoalTitle}>{targetGoal.title}</Text>
            {targetGoal.targetValue != null && (
              <Text style={styles.targetGoalDetail}>
                {t('goals.targetValue')}: {targetGoal.targetValue} {targetGoal.unit ?? ''}
              </Text>
            )}
          </View>
        )}

        <Text style={styles.inputLabel}>{t('goals.goalType')}</Text>
        <View style={styles.typePicker}>
          {GOAL_TYPES.map((gt) => (
            <Pressable
              key={gt}
              style={[styles.typeChip, goalType === gt && styles.typeChipActive]}
              onPress={() => setGoalType(gt)}
            >
              <Text style={[styles.typeChipText, goalType === gt && styles.typeChipTextActive]}>
                {t(`goals.type.${gt}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.inputLabel}>{t('goals.titleField')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('goals.titleField')}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.inputLabel}>{t('goals.targetValue')}</Text>
        <TextInput
          style={styles.input}
          value={targetValue}
          onChangeText={setTargetValue}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.inputLabel}>{t('goals.unit')}</Text>
        <TextInput
          style={styles.input}
          value={unit}
          onChangeText={setUnit}
          placeholder="kg, times/week, etc."
          placeholderTextColor={colors.textMuted}
        />

        {goalType === 'lift_target' && (
          <>
            <Text style={styles.inputLabel}>{t('goals.exerciseName')}</Text>
            <TextInput
              style={styles.input}
              value={exerciseName}
              onChangeText={setExerciseName}
              placeholder={t('goals.exerciseName')}
              placeholderTextColor={colors.textMuted}
            />
          </>
        )}

        <Text style={styles.inputLabel}>{t('goals.deadline')}</Text>
        <TextInput
          style={styles.input}
          value={deadline}
          onChangeText={setDeadline}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.inputLabel}>{t('suggestions.rationale')}</Text>
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          placeholder={t('suggestions.rationale')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Pressable
          style={[styles.submitBtn, (!title.trim() || saving) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!title.trim() || saving}
        >
          <Text style={styles.submitBtnText}>
            {saving ? '...' : isAdjustment ? t('suggestions.suggestAdjustment') : t('suggestions.suggest')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
