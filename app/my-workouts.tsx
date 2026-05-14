import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { confirmAction } from '../src/lib/confirm';
import { getCustomWorkouts, deleteCustomWorkout } from '../src/lib/trainerService';
import type { CustomWorkout } from '../src/types';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  workoutCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  cardLeft: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  cardMeta: { fontSize: FontSize.xs, color: colors.textSecondary },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  chip: { backgroundColor: colors.surfaceLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.sm },
  chipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, marginTop: Spacing.lg },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  createBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  diffDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm },
});

export default function MyWorkoutsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const fetcher = useCallback(async (): Promise<CustomWorkout[]> => {
    if (!user) return [];
    return getCustomWorkouts(user.id);
  }, [user]);

  const { data: workouts, loading, error, retry } = useFocusAsyncData({
    fetcher,
    defaultValue: [] as CustomWorkout[],
    enabled: !!user,
  });

  const handleDelete = (workout: CustomWorkout) => {
    const doDelete = async () => {
      const result = await deleteCustomWorkout(workout.id);
      if (result.error) {
        Alert.alert(t('common.error'), result.error);
        return;
      }
      retry();
    };

    confirmAction(
      t('builder.removeExercise'),
      t('builder.deleteConfirm'),
      t('common.delete'),
      t('common.cancel'),
      doDelete,
    );
  };

  const getDifficultyColor = (d: string) =>
    d === 'beginner' ? colors.success : d === 'intermediate' ? colors.accent : colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('builder.myWorkouts')}</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/workout-builder')}>
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
        </View>

        {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : !error && workouts.length > 0 ? (
          workouts.map((w) => (
            <Pressable
              key={w.id}
              style={styles.workoutCard}
              onPress={() => router.push(`/workout-builder?id=${w.id}`)}
            >
              <View style={[styles.diffDot, { backgroundColor: getDifficultyColor(w.difficulty) }]} />
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle}>{language === 'bg' && w.nameBg ? w.nameBg : w.name}</Text>
                <Text style={styles.cardMeta}>
                  {w.exercises.length} {t('workouts.exercises')} · {w.durationMinutes} {t('workouts.minutes')} · {t(`difficulty.${w.difficulty}`)}
                </Text>
                {w.muscleGroups.length > 0 && (
                  <View style={styles.cardChips}>
                    {w.muscleGroups.map((mg) => (
                      <View key={mg} style={styles.chip}>
                        <Text style={styles.chipText}>{t(`muscle.${mg}`)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => handleDelete(w)}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </Pressable>
          ))
        ) : !error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('builder.noWorkouts')}</Text>
            <Pressable style={styles.createBtn} onPress={() => router.push('/workout-builder')}>
              <Ionicons name="add-circle" size={22} color={colors.white} />
              <Text style={styles.createBtnText}>{t('builder.createFirst')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
