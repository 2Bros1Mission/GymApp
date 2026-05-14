import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { getClientProgress } from '../src/lib/trainerService';
import type { ClientProgress } from '../src/types';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  clientName: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  clientEmail: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xl, fontWeight: '700', color: colors.white },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, minWidth: '45%' as unknown as number, backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', borderLeftWidth: 3 },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },

  // Profile info
  profileSection: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  profileRowLast: { borderBottomWidth: 0 },
  profileLabel: { fontSize: FontSize.sm, color: colors.textSecondary },
  profileValue: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },

  // Weekly activity
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
  dayCol: { alignItems: 'center', gap: Spacing.xs },
  dayLabel: { fontSize: FontSize.xs, color: colors.textSecondary },
  dayDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayDotActive: { backgroundColor: colors.success },
  dayDotInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },

  // Weight chart (simple bar representation)
  chartContainer: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100, paddingTop: Spacing.sm },
  chartBar: { flex: 1, marginHorizontal: 2, borderRadius: BorderRadius.sm, backgroundColor: colors.primary, minHeight: 4 },
  chartLabel: { fontSize: FontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  chartEmpty: { alignItems: 'center', justifyContent: 'center', height: 100 },
  chartEmptyText: { fontSize: FontSize.sm, color: colors.textMuted },

  // Workout history
  workoutItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  workoutIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  workoutInfo: { flex: 1 },
  workoutName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  workoutMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  workoutDuration: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },

  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});

const EMPTY_PROGRESS: ClientProgress = {
  clientId: '',
  clientName: '',
  clientEmail: '',
  weight: null,
  height: null,
  goal: null,
  totalWorkouts: 0,
  currentStreak: 0,
  lastWorkoutDate: null,
  recentWorkouts: [],
  bodyMetrics: [],
  weeklyActivity: [false, false, false, false, false, false, false],
};

export default function ClientProgressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId: string }>();
  const clientId = Array.isArray(params.clientId) ? params.clientId[0] : params.clientId;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint === 'lg';

  const fetcher = useCallback(async () => {
    if (!clientId) throw new Error('No client ID');
    return getClientProgress(clientId);
  }, [clientId]);

  const { data: progress, loading, error, retry } = useFocusAsyncData({
    fetcher,
    defaultValue: EMPTY_PROGRESS,
    enabled: !!clientId,
  });

  const dayLabels = t('progress.dayLabels').split(',');

  const goalLabels: Record<string, string> = {
    lose_weight: t('goal.lose_weight'),
    build_muscle: t('goal.build_muscle'),
    get_stronger: t('goal.get_stronger'),
    stay_healthy: t('goal.stay_healthy'),
    improve_endurance: t('goal.improve_endurance'),
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    return `${mins} ${t('workouts.minutes')}`;
  };

  // Calculate chart bar heights from body metrics
  const renderWeightChart = () => {
    const metrics = progress.bodyMetrics.filter((m) => m.weight !== null);
    if (metrics.length === 0) {
      return (
        <View style={styles.chartEmpty}>
          <Text style={styles.chartEmptyText}>{t('clientProgress.noMetrics')}</Text>
        </View>
      );
    }

    const weights = metrics.map((m) => m.weight!);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const range = maxW - minW || 1;

    // Show last 10 entries max
    const shown = metrics.slice(-10);

    return (
      <>
        <View style={styles.chartRow}>
          {shown.map((m, i) => {
            const heightPct = ((m.weight! - minW) / range) * 80 + 20; // 20–100%
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <View style={[styles.chartBar, { height: `${heightPct}%` as unknown as number }]} />
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={styles.chartLabel}>{shown[0]?.weight?.toFixed(1)} kg</Text>
          <Text style={styles.chartLabel}>{shown[shown.length - 1]?.weight?.toFixed(1)} kg</Text>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.clientName}>{progress.clientName || t('common.loading')}</Text>
            {progress.clientEmail ? (
              <Text style={styles.clientEmail}>{progress.clientEmail}</Text>
            ) : null}
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(progress.clientName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.xl }} />
        ) : !error && (
          <>
            {/* Stats */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Ionicons name="barbell" size={20} color={colors.primary} />
                <Text style={styles.statValue}>{progress.totalWorkouts}</Text>
                <Text style={styles.statLabel}>{t('clientProgress.totalWorkouts')}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.accent }]}>
                <Ionicons name="flame" size={20} color={colors.accent} />
                <Text style={styles.statValue}>{progress.currentStreak}</Text>
                <Text style={styles.statLabel}>{t('clientProgress.streak')}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.success }]}>
                <Ionicons name="calendar" size={20} color={colors.success} />
                <Text style={styles.statValue}>
                  {progress.lastWorkoutDate
                    ? new Date(progress.lastWorkoutDate).toLocaleDateString()
                    : '--'}
                </Text>
                <Text style={styles.statLabel}>{t('clientProgress.lastWorkout')}</Text>
              </View>
            </View>

            {/* Client info */}
            <View style={styles.profileSection}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('profile.weightKg')}</Text>
                <Text style={styles.profileValue}>
                  {progress.weight ? `${progress.weight} kg` : '--'}
                </Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('profile.height')}</Text>
                <Text style={styles.profileValue}>
                  {progress.height ? `${progress.height} cm` : '--'}
                </Text>
              </View>
              <View style={[styles.profileRow, styles.profileRowLast]}>
                <Text style={styles.profileLabel}>{t('profile.fitnessGoals')}</Text>
                <Text style={styles.profileValue}>
                  {progress.goal ? goalLabels[progress.goal] ?? progress.goal : '--'}
                </Text>
              </View>
            </View>

            {/* Weekly activity */}
            <Text style={styles.sectionTitle}>{t('clientProgress.weeklyActivity')}</Text>
            <View style={styles.weekRow}>
              {progress.weeklyActivity.map((active, i) => (
                <View key={i} style={styles.dayCol}>
                  <Text style={styles.dayLabel}>{dayLabels[i] ?? ''}</Text>
                  <View style={[styles.dayDot, active ? styles.dayDotActive : styles.dayDotInactive]}>
                    {active && <Ionicons name="checkmark" size={18} color={colors.white} />}
                  </View>
                </View>
              ))}
            </View>

            {/* Weight chart */}
            <Text style={styles.sectionTitle}>{t('clientProgress.weightHistory')}</Text>
            <View style={styles.chartContainer}>
              {renderWeightChart()}
            </View>

            {/* Workout history */}
            <Text style={styles.sectionTitle}>{t('clientProgress.workoutHistory')}</Text>
            {progress.recentWorkouts.length > 0 ? (
              progress.recentWorkouts.map((w) => (
                <View key={w.id} style={styles.workoutItem}>
                  <View style={styles.workoutIcon}>
                    <Ionicons name="barbell" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutName}>{w.workoutName}</Text>
                    <Text style={styles.workoutMeta}>
                      {new Date(w.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.workoutDuration}>
                    {formatDuration(w.durationSeconds)}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="barbell-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyText}>{t('clientProgress.noWorkouts')}</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
