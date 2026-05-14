import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getWorkoutStats, getWorkoutHistory } from '../../src/lib/workoutService';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { SkeletonWeekCalendar, SkeletonStatCard, SkeletonHistoryItem } from '../../src/components/SkeletonLoader';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAsyncData } from '../../src/hooks/useAsyncData';
import { ErrorCard } from '../../src/components/ErrorCard';

interface WorkoutLogEntry {
  id: string;
  workout_name: string;
  date: string;
  duration_seconds: number | null;
}

interface ProgressData {
  stats: { totalWorkouts: number; streak: number; thisWeek: number; weekDays: boolean[] };
  history: WorkoutLogEntry[];
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text },
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md },
  weekCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: Spacing.sm },
  dayLabel: { fontSize: FontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  dayCircleActive: { backgroundColor: colors.primary },
  weekSummary: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.lg },
  progressCard: { width: '48%', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, flexGrow: 1 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  progressLabel: { fontSize: FontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  progressValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  progressChange: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 },
  historyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.md },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  historyInfo: { flex: 1 },
  historyName: { fontSize: FontSize.md, color: colors.text, fontWeight: '600' },
  historyMeta: { fontSize: FontSize.xs, color: colors.textSecondary },
  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  desktopHistoryRow: { flexDirection: 'row', gap: Spacing.lg },
  desktopHistorySection: { flex: 1 },
});

function WeekCalendar({ weekDays, dayLabels, colors }: { weekDays: boolean[]; dayLabels: string[]; colors: ColorPalette }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.weekRow}>
      {dayLabels.map((day, i) => (
        <View key={i} style={styles.dayCol}>
          <Text style={styles.dayLabel}>{day}</Text>
          <View style={[styles.dayCircle, weekDays[i] && styles.dayCircleActive]}>
            {weekDays[i] && (
              <Ionicons name="checkmark" size={16} color={colors.white} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function ProgressStat({ label, value, change, icon, colors }: {
  label: string;
  value: string;
  change?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  colors: ColorPalette;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPositive = change?.startsWith('+');
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={styles.progressLabel}>{label}</Text>
      </View>
      <Text style={styles.progressValue}>{value}</Text>
      {change && (
        <Text style={[styles.progressChange, { color: isPositive ? colors.success : colors.error }]}>
          {change}
        </Text>
      )}
    </View>
  );
}

function WorkoutHistoryItem({ name, date, duration, colors, onPress }: {
  name: string;
  date: string;
  duration: string;
  colors: ColorPalette;
  onPress?: () => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={styles.historyItem} onPress={onPress}>
      <View style={styles.historyDot} />
      <View style={styles.historyInfo}>
        <Text style={styles.historyName}>{name}</Text>
        <Text style={styles.historyMeta}>{date} · {duration}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function formatDate(dateStr: string, months: string[]): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDuration(seconds: number | null, minLabel: string): string {
  if (!seconds) return `-- ${minLabel}`;
  const mins = Math.round(seconds / 60);
  return `${mins} ${minLabel}`;
}

export default function ProgressScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fetcher = useCallback(async (): Promise<ProgressData> => {
    if (!user) return { stats: { totalWorkouts: 0, streak: 0, thisWeek: 0, weekDays: [false, false, false, false, false, false, false] }, history: [] };
    const [stats, history] = await Promise.all([
      getWorkoutStats(user.id),
      getWorkoutHistory(user.id, 10),
    ]);
    return { stats, history };
  }, [user]);

  const { data, loading, error, retry } = useAsyncData({
    fetcher,
    defaultValue: {
      stats: { totalWorkouts: 0, streak: 0, thisWeek: 0, weekDays: [false, false, false, false, false, false, false] },
      history: [],
    } as ProgressData,
    enabled: !!user,
  });

  const { stats, history } = data;
  const completedThisWeek = stats.weekDays.filter(Boolean).length;
  const breakpoint = useBreakpoint();
  const isLarge = breakpoint === 'lg';
  const dayLabels = t('progress.dayLabels').split(',');
  const months = t('progress.months').split(',');
  const minLabel = t('progress.min');
  const kgLabel = t('exercise.weight');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <Text style={styles.title}>{t('progress.title')}</Text>
          </View>

          {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

          {!error && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('progress.thisWeekSection')}</Text>
                {loading ? (
                  <SkeletonWeekCalendar />
                ) : (
                  <View style={styles.weekCard}>
                    <WeekCalendar weekDays={stats.weekDays} dayLabels={dayLabels} colors={colors} />
                    <Text style={styles.weekSummary}>
                      {t('progress.weeklyCompleted', { completed: String(completedThisWeek), goal: '5' })}
                    </Text>
                  </View>
                )}
              </View>

              {loading ? (
                <View style={styles.statsGrid}>
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                </View>
              ) : (
                <View style={styles.statsGrid}>
                  <ProgressStat
                    label={t('progress.weight')}
                    value={`${profile?.weight ?? '--'} ${kgLabel}`}
                    icon="scale"
                    colors={colors}
                  />
                  <ProgressStat
                    label={t('progress.workouts')}
                    value={`${stats.totalWorkouts}`}
                    change={stats.thisWeek > 0 ? t('progress.thisWeekChange', { count: String(stats.thisWeek) }) : undefined}
                    icon="barbell"
                    colors={colors}
                  />
                  <ProgressStat
                    label={t('home.streak')}
                    value={`${stats.streak} ${t('home.days')}`}
                    icon="flame"
                    colors={colors}
                  />
                  <ProgressStat
                    label={t('home.thisWeek')}
                    value={`${stats.thisWeek}`}
                    icon="calendar"
                    colors={colors}
                  />
                </View>
              )}

              <View style={isLarge ? styles.desktopHistoryRow : undefined}>
                <View style={[styles.section, isLarge && styles.desktopHistorySection]}>
                  <Text style={styles.sectionTitle}>{t('progress.history')}</Text>
                  {loading ? (
                    <View style={styles.historyCard}>
                      <SkeletonHistoryItem />
                      <SkeletonHistoryItem />
                      <SkeletonHistoryItem />
                    </View>
                  ) : history.length > 0 ? (
                    <View style={styles.historyCard}>
                      {history.map((log) => (
                        <WorkoutHistoryItem
                          key={log.id}
                          name={log.workout_name}
                          date={formatDate(log.date, months)}
                          duration={formatDuration(log.duration_seconds, minLabel)}
                          colors={colors}
                          onPress={() => router.push(`/workout-detail?workoutLogId=${log.id}`)}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyCard}>
                      <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
                      <Text style={styles.emptyText}>
                        {t('progress.noWorkouts')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}

          <View style={{ height: Spacing.xl }} />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
