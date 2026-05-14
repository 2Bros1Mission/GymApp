import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import {
  getClientGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  completeGoal,
  getPendingSuggestions,
  respondToSuggestion,
  refreshGoalProgress,
} from '../src/lib/goalService';
import type { ClientGoal, GoalSuggestion, GoalType } from '../src/types';

const GOAL_TYPES: GoalType[] = ['weight_target', 'lift_target', 'frequency', 'custom'];

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, flex: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md, marginTop: Spacing.md },
  sectionSubtext: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.md },

  suggestionCard: {
    backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  suggestionType: { fontSize: FontSize.xs, fontWeight: '600', color: colors.accent, textTransform: 'uppercase' },
  suggestionTrainer: { fontSize: FontSize.xs, color: colors.textSecondary },
  suggestionTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginBottom: Spacing.xs },
  suggestionDetail: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.xs },
  suggestionMessage: { fontSize: FontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.sm },
  suggestionActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  acceptBtn: { backgroundColor: colors.success },
  adjustBtn: { backgroundColor: colors.accent },
  rejectBtn: { backgroundColor: colors.error },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },

  goalCard: {
    backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  goalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  goalTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, flex: 1 },
  goalTypeBadge: { backgroundColor: colors.primaryDark, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  goalTypeBadgeText: { fontSize: 10, fontWeight: '600', color: colors.primaryLight },
  goalDetail: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.xs },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: BorderRadius.full },
  progressText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.primary, minWidth: 60, textAlign: 'right' },
  goalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  goalActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },

  formOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  formCard: { backgroundColor: colors.background, borderRadius: BorderRadius.lg, padding: Spacing.lg, maxHeight: '85%' },
  formTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.lg },
  inputLabel: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: FontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  typePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  typeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  typeChipTextActive: { color: colors.white },
  formActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  formBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  saveBtn: { backgroundColor: colors.primary },
  saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },

  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedText: { fontSize: FontSize.xs, color: colors.success, fontWeight: '600' },
});

interface GoalForm {
  goalType: GoalType;
  title: string;
  targetValue: string;
  unit: string;
  exerciseName: string;
  deadline: string;
}

const emptyForm: GoalForm = { goalType: 'custom', title: '', targetValue: '', unit: '', exerciseName: '', deadline: '' };

export default function GoalsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [showForm, setShowForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const goalsFetcher = useCallback(async (): Promise<ClientGoal[]> => {
    if (!user) return [];
    const goals = await getClientGoals(user.id);
    return refreshGoalProgress(user.id, goals);
  }, [user]);

  const suggestionsFetcher = useCallback(async (): Promise<GoalSuggestion[]> => {
    if (!user) return [];
    return getPendingSuggestions(user.id);
  }, [user]);

  const { data: goals, loading: goalsLoading, retry: refetchGoals } = useFocusAsyncData({
    fetcher: goalsFetcher,
    defaultValue: [] as ClientGoal[],
    enabled: !!user,
  });

  const { data: suggestions, loading: suggestionsLoading, retry: refetchSuggestions } = useFocusAsyncData({
    fetcher: suggestionsFetcher,
    defaultValue: [] as GoalSuggestion[],
    enabled: !!user,
  });

  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');

  const openCreateForm = () => {
    setForm(emptyForm);
    setEditingGoalId(null);
    setShowForm(true);
  };

  const openEditForm = (goal: ClientGoal) => {
    setForm({
      goalType: goal.goalType,
      title: goal.title,
      targetValue: goal.targetValue?.toString() ?? '',
      unit: goal.unit ?? '',
      exerciseName: goal.exerciseName ?? '',
      deadline: goal.deadline ?? '',
    });
    setEditingGoalId(goal.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      if (editingGoalId) {
        const { error } = await updateGoal(editingGoalId, {
          title: form.title.trim(),
          targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
          unit: form.unit || null,
          exerciseName: form.exerciseName || null,
          deadline: form.deadline || null,
        });
        if (error) { Alert.alert('Error', error); return; }
        Alert.alert(t('goals.updated'));
      } else {
        const { error } = await createGoal({
          clientId: user.id,
          goalType: form.goalType,
          title: form.title.trim(),
          targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
          unit: form.unit || null,
          exerciseName: form.exerciseName || null,
          deadline: form.deadline || null,
        });
        if (error) { Alert.alert('Error', error); return; }
        Alert.alert(t('goals.created'));
      }
      setShowForm(false);
      refetchGoals();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (goal: ClientGoal) => {
    Alert.alert(t('goals.deleteConfirm'), t('goals.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await deleteGoal(goal.id);
          refetchGoals();
        },
      },
    ]);
  };

  const handleComplete = async (goal: ClientGoal) => {
    await completeGoal(goal.id);
    Alert.alert(t('goals.markedComplete'));
    refetchGoals();
  };

  const handleAcceptSuggestion = async (suggestion: GoalSuggestion) => {
    if (!user) return;
    const { error } = await respondToSuggestion(suggestion.id, 'accepted', {
      clientId: user.id,
      goalType: suggestion.goalType,
      title: suggestion.title,
      targetValue: suggestion.targetValue,
      unit: suggestion.unit,
      exerciseName: suggestion.exerciseName,
      deadline: suggestion.deadline,
      targetGoalId: suggestion.targetGoalId,
      suggestionType: suggestion.suggestionType,
    });
    if (error) { Alert.alert('Error', error); return; }
    Alert.alert(t('suggestions.accepted'));
    refetchSuggestions();
    refetchGoals();
  };

  const handleAdjustAndSave = async (suggestion: GoalSuggestion) => {
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      const { error } = await respondToSuggestion(suggestion.id, 'adjusted', {
        clientId: user.id,
        goalType: form.goalType,
        title: form.title.trim(),
        targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
        unit: form.unit || null,
        exerciseName: form.exerciseName || null,
        deadline: form.deadline || null,
        targetGoalId: suggestion.targetGoalId,
        suggestionType: suggestion.suggestionType,
      });
      if (error) { Alert.alert('Error', error); return; }
      Alert.alert(t('suggestions.adjusted'));
      setShowForm(false);
      refetchSuggestions();
      refetchGoals();
    } finally {
      setSaving(false);
    }
  };

  const handleRejectSuggestion = async (suggestion: GoalSuggestion) => {
    const { error } = await respondToSuggestion(suggestion.id, 'rejected');
    if (error) { Alert.alert('Error', error); return; }
    refetchSuggestions();
  };

  // Track which suggestion we're adjusting
  const [adjustingSuggestion, setAdjustingSuggestion] = useState<GoalSuggestion | null>(null);

  const openAdjustForm = (suggestion: GoalSuggestion) => {
    setForm({
      goalType: suggestion.goalType,
      title: suggestion.title,
      targetValue: suggestion.targetValue?.toString() ?? '',
      unit: suggestion.unit ?? '',
      exerciseName: suggestion.exerciseName ?? '',
      deadline: suggestion.deadline ?? '',
    });
    setEditingGoalId(null);
    setAdjustingSuggestion(suggestion);
    setShowForm(true);
  };

  const handleFormSave = async () => {
    if (adjustingSuggestion) {
      await handleAdjustAndSave(adjustingSuggestion);
      setAdjustingSuggestion(null);
    } else {
      await handleSave();
    }
  };

  const getProgressPct = (goal: ClientGoal): number => {
    if (!goal.targetValue || goal.targetValue === 0) return 0;
    const current = goal.currentValue ?? 0;
    return Math.min(Math.max(current / goal.targetValue, 0), 1);
  };

  const renderGoalCard = (goal: ClientGoal) => {
    const pct = getProgressPct(goal);
    const progressColor = pct >= 1 ? colors.success : colors.primary;

    return (
      <View key={goal.id} style={styles.goalCard}>
        <View style={styles.goalCardHeader}>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <View style={styles.goalTypeBadge}>
            <Text style={styles.goalTypeBadgeText}>{t(`goals.type.${goal.goalType}`)}</Text>
          </View>
        </View>

        {goal.targetValue != null && (
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: progressColor }]} />
            </View>
            <Text style={[styles.progressText, { color: progressColor }]}>
              {goal.currentValue ?? 0} / {goal.targetValue} {goal.unit ?? ''}
            </Text>
          </View>
        )}

        {goal.deadline && (
          <Text style={styles.goalDetail}>{t('goals.deadline')}: {new Date(goal.deadline).toLocaleDateString()}</Text>
        )}

        {goal.status === 'completed' ? (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.completedText}>{t('goals.completed')}</Text>
          </View>
        ) : (
          <View style={styles.goalActions}>
            <Pressable style={styles.goalActionBtn} onPress={() => handleComplete(goal)}>
              <Ionicons name="checkmark" size={18} color={colors.success} />
            </Pressable>
            <Pressable style={styles.goalActionBtn} onPress={() => openEditForm(goal)}>
              <Ionicons name="pencil" size={16} color={colors.primary} />
            </Pressable>
            <Pressable style={styles.goalActionBtn} onPress={() => handleDelete(goal)}>
              <Ionicons name="trash" size={16} color={colors.error} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderSuggestionCard = (suggestion: GoalSuggestion) => (
    <View key={suggestion.id} style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <Text style={styles.suggestionType}>
          {suggestion.suggestionType === 'new_goal' ? t('suggestions.newGoal') : t('suggestions.suggestAdjustment')}
        </Text>
        <Text style={styles.suggestionTrainer}>{t('suggestions.fromTrainer', { name: suggestion.trainerName ?? '' })}</Text>
      </View>
      <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
      {suggestion.targetValue != null && (
        <Text style={styles.suggestionDetail}>
          {t('goals.targetValue')}: {suggestion.targetValue} {suggestion.unit ?? ''}
        </Text>
      )}
      {suggestion.targetGoalTitle && (
        <Text style={styles.suggestionDetail}>{t('suggestions.adjustment', { title: suggestion.targetGoalTitle })}</Text>
      )}
      {suggestion.message && (
        <Text style={styles.suggestionMessage}>&ldquo;{suggestion.message}&rdquo;</Text>
      )}
      <View style={styles.suggestionActions}>
        <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleAcceptSuggestion(suggestion)}>
          <Text style={styles.actionBtnText}>{t('suggestions.accept')}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.adjustBtn]} onPress={() => openAdjustForm(suggestion)}>
          <Text style={styles.actionBtnText}>{t('suggestions.adjust')}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleRejectSuggestion(suggestion)}>
          <Text style={styles.actionBtnText}>{t('suggestions.reject')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const loading = goalsLoading || suggestionsLoading;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('goals.title')}</Text>
          <Pressable style={styles.addBtn} onPress={openCreateForm}>
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.lg }} />}

        {/* Pending suggestions */}
        {suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('suggestions.pending')}</Text>
            {suggestions.map(renderSuggestionCard)}
          </>
        )}

        {/* Active goals */}
        <Text style={styles.sectionTitle}>{t('goals.active')}</Text>
        {!loading && activeGoals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('goals.noGoals')}</Text>
            <Pressable style={[styles.addBtn, { width: 'auto' as unknown as number, paddingHorizontal: Spacing.md, flexDirection: 'row', gap: Spacing.xs }]} onPress={openCreateForm}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: '700', fontSize: FontSize.sm }}>{t('goals.addGoal')}</Text>
            </Pressable>
          </View>
        )}
        {activeGoals.map(renderGoalCard)}

        {/* Completed goals */}
        {completedGoals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('goals.completed')}</Text>
            {completedGoals.map(renderGoalCard)}
          </>
        )}
      </ScrollView>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <View style={styles.formOverlay}>
          <ScrollView style={styles.formCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.formTitle}>
              {editingGoalId ? t('goals.editGoal') : adjustingSuggestion ? t('suggestions.adjust') : t('goals.addGoal')}
            </Text>

            {!editingGoalId && (
              <>
                <Text style={styles.inputLabel}>{t('goals.goalType')}</Text>
                <View style={styles.typePicker}>
                  {GOAL_TYPES.map((gt) => (
                    <Pressable
                      key={gt}
                      style={[styles.typeChip, form.goalType === gt && styles.typeChipActive]}
                      onPress={() => setForm((f) => ({ ...f, goalType: gt }))}
                    >
                      <Text style={[styles.typeChipText, form.goalType === gt && styles.typeChipTextActive]}>
                        {t(`goals.type.${gt}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>{t('goals.titleField')}</Text>
            <TextInput
              style={styles.input}
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder={t('goals.titleField')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>{t('goals.targetValue')}</Text>
            <TextInput
              style={styles.input}
              value={form.targetValue}
              onChangeText={(v) => setForm((f) => ({ ...f, targetValue: v }))}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>{t('goals.unit')}</Text>
            <TextInput
              style={styles.input}
              value={form.unit}
              onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))}
              placeholder="kg, times/week, etc."
              placeholderTextColor={colors.textMuted}
            />

            {(form.goalType === 'lift_target') && (
              <>
                <Text style={styles.inputLabel}>{t('goals.exerciseName')}</Text>
                <TextInput
                  style={styles.input}
                  value={form.exerciseName}
                  onChangeText={(v) => setForm((f) => ({ ...f, exerciseName: v }))}
                  placeholder={t('goals.exerciseName')}
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}

            <Text style={styles.inputLabel}>{t('goals.deadline')}</Text>
            <TextInput
              style={styles.input}
              value={form.deadline}
              onChangeText={(v) => setForm((f) => ({ ...f, deadline: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.formActions}>
              <Pressable style={[styles.formBtn, styles.cancelBtn]} onPress={() => { setShowForm(false); setAdjustingSuggestion(null); }}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.formBtn, styles.saveBtn]} onPress={handleFormSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? '...' : t('goals.save')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}
