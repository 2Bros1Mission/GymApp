import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { sampleWorkouts } from '../../src/data/workouts';
import { useAuth } from '../../src/contexts/AuthContext';
import { getWorkoutStats } from '../../src/lib/workoutService';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { SkeletonStatCard, SkeletonBox } from '../../src/components/SkeletonLoader';

function StatCard({ icon, label, value, color }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();
  const todayWorkout = sampleWorkouts[0];

  const [stats, setStats] = useState({
    totalWorkouts: 0,
    streak: 0,
    thisWeek: 0,
  });
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const s = await getWorkoutStats(user.id);
      setStats(s);
    } catch (err) {
      console.error('Failed to load stats:', err);
      setStatsError(err instanceof Error ? err.message : t('home.statsError'));
    } finally {
      setStatsLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const displayName = profile?.name || t('home.defaultName');

  const breakpoint = useBreakpoint();
  const isLarge = breakpoint === 'lg';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{t('home.greeting')},</Text>
              <Text style={styles.userName}>{displayName} 💪</Text>
            </View>
            <Pressable style={styles.notificationBtn}>
              <Ionicons name="notifications-outline" size={24} color={Colors.text} />
            </Pressable>
          </View>

          {statsError && (
            <View style={styles.errorCard}>
              <View style={styles.errorCardContent}>
                <Ionicons name="cloud-offline-outline" size={24} color={Colors.error} />
                <View style={styles.errorCardText}>
                  <Text style={styles.errorCardTitle}>{t('home.statsError')}</Text>
                  <Text style={styles.errorCardMessage}>{statsError}</Text>
                </View>
              </View>
              <Pressable style={styles.retryBtn} onPress={loadStats} disabled={statsLoading}>
                <Ionicons name="refresh" size={18} color={Colors.white} />
                <Text style={styles.retryBtnText}>
                  {statsLoading ? t('common.loading') : t('home.retry')}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={isLarge ? styles.desktopRow : undefined}>
            <View style={isLarge ? styles.desktopMain : undefined}>
              <View style={styles.todayCard}>
                <View style={styles.todayHeader}>
                  <Text style={styles.todayTitle}>{t('home.todayWorkout')}</Text>
                  <View style={styles.difficultyBadge}>
                    <Text style={styles.difficultyText}>
                      {t(`difficulty.${todayWorkout.difficulty}`)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.workoutName}>
                  {language === 'bg' ? todayWorkout.nameBg : todayWorkout.name}
                </Text>
                <Text style={styles.workoutMeta}>
                  {todayWorkout.exercises.length} {t('workouts.exercises')} · {todayWorkout.durationMinutes} {t('workouts.minutes')}
                </Text>
                <Pressable
                  style={styles.startButton}
                  onPress={() => router.push(`/workout/${todayWorkout.id}`)}
                >
                  <Ionicons name="play" size={20} color={Colors.white} />
                  <Text style={styles.startButtonText}>{t('home.startWorkout')}</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>{t('home.goals')}</Text>
              {statsLoading && !statsError ? (
                <View style={styles.goalCard}>
                  <SkeletonBox width="100%" height={6} borderRadius={3} />
                </View>
              ) : (
                <View style={styles.goalCard}>
                  <View style={styles.goalRow}>
                    <Text style={styles.goalText}>{t('home.weeklyWorkouts')}</Text>
                    <Text style={styles.goalProgress}>{stats.thisWeek}/5</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.min((stats.thisWeek / 5) * 100, 100)}%` }]} />
                  </View>
                </View>
              )}
            </View>

            <View style={isLarge ? styles.desktopSide : undefined}>
              <Text style={styles.sectionTitle}>{t('home.quickStats')}</Text>
              {statsLoading && !statsError ? (
                <View style={[styles.statsRow, isLarge && styles.statsRowDesktop]}>
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                </View>
              ) : (
              <View style={[styles.statsRow, isLarge && styles.statsRowDesktop]}>
                <StatCard
                  icon="flame"
                  label={t('home.streak')}
                  value={`${stats.streak} ${t('home.days')}`}
                  color={Colors.accent}
                />
                <StatCard
                  icon="calendar"
                  label={t('home.thisWeek')}
                  value={`${stats.thisWeek}/5`}
                  color={Colors.primary}
                />
                <StatCard
                  icon="trophy"
                  label={t('home.totalWorkouts')}
                  value={`${stats.totalWorkouts}`}
                  color={Colors.success}
                />
              </View>
              )}
            </View>
          </View>

          <View style={{ height: Spacing.xl }} />
        </ResponsiveContainer>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  greeting: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  todayTitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 1,
  },
  difficultyBadge: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  difficultyText: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  workoutName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  workoutMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  startButtonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  goalCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  goalText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  goalProgress: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  errorCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.error + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '25',
  },
  errorCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorCardText: {
    flex: 1,
  },
  errorCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.error,
    marginBottom: 2,
  },
  errorCardMessage: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
  },
  retryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  desktopRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  desktopMain: {
    flex: 2,
  },
  desktopSide: {
    flex: 1,
  },
  statsRowDesktop: {
    flexDirection: 'column',
    paddingHorizontal: 0,
  },
});
