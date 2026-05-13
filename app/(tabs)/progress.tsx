import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getWorkoutStats, getWorkoutHistory } from '../../src/lib/workoutService';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

const dayLabels = ['П', 'В', 'С', 'Ч', 'П', 'С', 'Н'];

interface WorkoutLogEntry {
  id: string;
  workout_name: string;
  date: string;
  duration_seconds: number | null;
}

function WeekCalendar({ weekDays }: { weekDays: boolean[] }) {
  return (
    <View style={styles.weekRow}>
      {dayLabels.map((day, i) => (
        <View key={i} style={styles.dayCol}>
          <Text style={styles.dayLabel}>{day}</Text>
          <View style={[styles.dayCircle, weekDays[i] && styles.dayCircleActive]}>
            {weekDays[i] && (
              <Ionicons name="checkmark" size={16} color={Colors.white} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function ProgressStat({ label, value, change, icon }: {
  label: string;
  value: string;
  change?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const isPositive = change?.startsWith('+');
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
        <Text style={styles.progressLabel}>{label}</Text>
      </View>
      <Text style={styles.progressValue}>{value}</Text>
      {change && (
        <Text style={[styles.progressChange, { color: isPositive ? Colors.success : Colors.error }]}>
          {change}
        </Text>
      )}
    </View>
  );
}

function WorkoutHistoryItem({ name, date, duration }: {
  name: string;
  date: string;
  duration: string;
}) {
  return (
    <View style={styles.historyItem}>
      <View style={styles.historyDot} />
      <View style={styles.historyInfo}>
        <Text style={styles.historyName}>{name}</Text>
        <Text style={styles.historyMeta}>{date} · {duration}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
    </View>
  );
}

function formatDate(dateStr: string): string {
  const months = ['Яну', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-- мин';
  const mins = Math.round(seconds / 60);
  return `${mins} мин`;
}

export default function ProgressScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [stats, setStats] = useState({
    totalWorkouts: 0,
    streak: 0,
    thisWeek: 0,
    weekDays: [false, false, false, false, false, false, false],
  });
  const [history, setHistory] = useState<WorkoutLogEntry[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [s, h] = await Promise.all([
      getWorkoutStats(user.id),
      getWorkoutHistory(user.id, 10),
    ]);
    setStats(s);
    setHistory(h);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const completedThisWeek = stats.weekDays.filter(Boolean).length;
  const breakpoint = useBreakpoint();
  const isLarge = breakpoint === 'lg';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <Text style={styles.title}>{t('progress.title')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Тази седмица</Text>
            <View style={styles.weekCard}>
              <WeekCalendar weekDays={stats.weekDays} />
              <Text style={styles.weekSummary}>
                {completedThisWeek} от 5 тренировки завършени
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <ProgressStat
              label="Тегло"
              value={user ? `${(user as any).weight ?? '--'} кг` : '-- кг'}
              icon="scale"
            />
            <ProgressStat
              label="Тренировки"
              value={`${stats.totalWorkouts}`}
              change={stats.thisWeek > 0 ? `+${stats.thisWeek} тази седмица` : undefined}
              icon="barbell"
            />
            <ProgressStat
              label="Серия"
              value={`${stats.streak} дни`}
              icon="flame"
            />
            <ProgressStat
              label="Тази седмица"
              value={`${stats.thisWeek}`}
              icon="calendar"
            />
          </View>

          <View style={isLarge ? styles.desktopHistoryRow : undefined}>
            <View style={[styles.section, isLarge && styles.desktopHistorySection]}>
              <Text style={styles.sectionTitle}>{t('progress.history')}</Text>
              {history.length > 0 ? (
                <View style={styles.historyCard}>
                  {history.map((log) => (
                    <WorkoutHistoryItem
                      key={log.id}
                      name={log.workout_name}
                      date={formatDate(log.date)}
                      duration={formatDuration(log.duration_seconds)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="barbell-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>
                    Все още няма тренировки.{'\n'}Започни първата си днес!
                  </Text>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  weekCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dayLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: {
    backgroundColor: Colors.primary,
  },
  weekSummary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  progressCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexGrow: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  progressValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  progressChange: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '600',
  },
  historyMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  desktopHistoryRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  desktopHistorySection: {
    flex: 1,
  },
});
