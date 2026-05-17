import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { sampleWorkouts } from '../../src/data/workouts';
import { DifficultyLevel, MuscleGroup, Workout, WorkoutAssignment, CustomWorkout } from '../../src/types';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useTheme } from '../../src/contexts/ThemeContext';
import { SkeletonWorkoutCard } from '../../src/components/SkeletonLoader';
import { useFocusAsyncData } from '../../src/hooks/useAsyncData';
import { getClientAssignments, getCustomWorkouts, deleteCustomWorkout } from '../../src/lib/trainerService';
import { formatDate } from '../../src/lib/formatDate';

const muscleGroupIcons: Record<MuscleGroup, React.ComponentProps<typeof Ionicons>['name']> = {
  chest: 'body',
  back: 'body',
  shoulders: 'body',
  biceps: 'fitness',
  triceps: 'fitness',
  legs: 'walk',
  core: 'body',
  full_body: 'barbell',
};

type FilterType = 'all' | DifficultyLevel;

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text },
  filterRow: { maxHeight: 50, marginBottom: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.white },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.md },
  iconCircle: { width: 48, height: 48, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  cardMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginBottom: Spacing.xs },
  muscleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  muscleChip: { backgroundColor: colors.surfaceLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.sm },
  muscleChipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  difficultyDot: { width: 8, height: 8, borderRadius: 4 },
  assignedSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  assignedTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md },
  assignedCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent },
  assignedCardName: { fontSize: FontSize.md, fontWeight: '700', color: colors.text },
  assignedCardMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  assignedCardDue: { fontSize: FontSize.xs, color: colors.accent, marginTop: 4, fontWeight: '600' },
  startBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  startBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  myWorkoutsSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  myWorkoutsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  myWorkoutsTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  createBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  myWorkoutCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myWorkoutInfo: { flex: 1 },
  myWorkoutName: { fontSize: FontSize.md, fontWeight: '700', color: colors.text },
  myWorkoutMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  myWorkoutActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  emptyMyWorkouts: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyMyWorkoutsText: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm, textAlign: 'center' },
});

function WorkoutCard({ workout, onPress, colors }: { workout: Workout; onPress: () => void; colors: ColorPalette }) {
  const { t, language } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mainMuscle = workout.muscleGroups[0];

  const difficultyColor =
    workout.difficulty === 'beginner' ? colors.success
    : workout.difficulty === 'intermediate' ? colors.accent
    : colors.error;

  return (
    <Pressable style={styles.workoutCard} onPress={onPress}>
      <View style={styles.cardLeft}>
        <View style={[styles.iconCircle, { backgroundColor: difficultyColor + '20' }]}>
          <Ionicons name={muscleGroupIcons[mainMuscle]} size={24} color={difficultyColor} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{language === 'bg' ? workout.nameBg : workout.name}</Text>
          <Text style={styles.cardMeta}>
            {workout.exercises.length} {t('workouts.exercises')} · {workout.durationMinutes} {t('workouts.minutes')}
          </Text>
          <View style={styles.muscleChips}>
            {workout.muscleGroups.map((mg) => (
              <View key={mg} style={styles.muscleChip}>
                <Text style={styles.muscleChipText}>{t(`muscle.${mg}`)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.difficultyDot, { backgroundColor: difficultyColor }]} />
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { user, profile } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const breakpoint = useBreakpoint();
  const numColumns = breakpoint === 'lg' ? 3 : breakpoint === 'md' ? 2 : 1;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isClient = profile?.role === 'client';

  const assignmentsFetcher = useCallback(async (): Promise<WorkoutAssignment[]> => {
    if (!user || !isClient) return [];
    return getClientAssignments(user.id);
  }, [user, isClient]);

  const { data: assignments, loading: assignmentsLoading } = useFocusAsyncData({
    fetcher: assignmentsFetcher,
    defaultValue: [] as WorkoutAssignment[],
    enabled: !!user && isClient,
  });

  const myWorkoutsFetcher = useCallback(async (): Promise<CustomWorkout[]> => {
    if (!user) return [];
    return getCustomWorkouts(user.id);
  }, [user]);

  const { data: myWorkouts, loading: myWorkoutsLoading, retry: refetchMyWorkouts } = useFocusAsyncData({
    fetcher: myWorkoutsFetcher,
    defaultValue: [] as CustomWorkout[],
    enabled: !!user,
  });

  const handleDeleteWorkout = useCallback((workoutId: string, workoutName: string) => {
    Alert.alert(
      t('builder.deleteConfirm'),
      workoutName,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteCustomWorkout(workoutId);
            if (!error) refetchMyWorkouts();
          },
        },
      ]
    );
  }, [t, refetchMyWorkouts]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('workouts.all') },
    { key: 'beginner', label: t('workouts.beginner') },
    { key: 'intermediate', label: t('workouts.intermediate') },
    { key: 'advanced', label: t('workouts.advanced') },
  ];

  const filteredWorkouts = filter === 'all'
    ? sampleWorkouts
    : sampleWorkouts.filter((w) => w.difficulty === filter);

  return (
    <SafeAreaView style={styles.container}>
      <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.title}>{t('workouts.title')}</Text>
        </View>

        {/* Assigned workouts section for clients */}
        {isClient && assignments.length > 0 && (
          <View style={styles.assignedSection}>
            <Text style={styles.assignedTitle}>{t('assignments.title')}</Text>
            {assignments.map((a) => (
              <Pressable
                key={a.id}
                style={styles.assignedCard}
                onPress={() => router.push(`/workout/${a.workoutId}`)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assignedCardName}>
                      {language === 'bg' && a.workoutNameBg ? a.workoutNameBg : a.workoutName ?? '--'}
                    </Text>
                    <Text style={styles.assignedCardMeta}>
                      {t('assignments.fromTrainer', { name: a.trainerName ?? '--' })}
                    </Text>
                    {a.dueDate && (
                      <Text style={styles.assignedCardDue}>
                        {t('assignments.dueDateLabel', { date: formatDate(a.dueDate, language) })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.startBtn}>
                    <Text style={styles.startBtnText}>{t('assignments.start')}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {isClient && assignmentsLoading && (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: Spacing.md }} />
        )}

        {/* My Custom Workouts section */}
        <View style={styles.myWorkoutsSection}>
          <View style={styles.myWorkoutsHeader}>
            <Text style={styles.myWorkoutsTitle}>{t('builder.myWorkouts')}</Text>
            <Pressable style={styles.createBtn} onPress={() => router.push('/workout-builder')}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.createBtnText}>{t('builder.title')}</Text>
            </Pressable>
          </View>

          {myWorkoutsLoading && <ActivityIndicator color={colors.primary} />}

          {!myWorkoutsLoading && myWorkouts.length === 0 && (
            <View style={styles.emptyMyWorkouts}>
              <Text style={styles.emptyMyWorkoutsText}>{t('builder.noWorkouts')}</Text>
              <Pressable style={styles.createBtn} onPress={() => router.push('/workout-builder')}>
                <Ionicons name="add" size={16} color={colors.white} />
                <Text style={styles.createBtnText}>{t('builder.createFirst')}</Text>
              </Pressable>
            </View>
          )}

          {myWorkouts.map((w) => (
            <View key={w.id} style={styles.myWorkoutCard}>
              <Pressable style={styles.myWorkoutInfo} onPress={() => router.push(`/workout/${w.id}`)}>
                <Text style={styles.myWorkoutName}>
                  {language === 'bg' && w.nameBg ? w.nameBg : w.name}
                </Text>
                <Text style={styles.myWorkoutMeta}>
                  {w.exercises.length} {t('workouts.exercises')} · {w.durationMinutes} {t('workouts.minutes')}
                </Text>
              </Pressable>
              <View style={styles.myWorkoutActions}>
                <Pressable style={styles.actionBtn} onPress={() => router.push(`/workout-builder?id=${w.id}`)}>
                  <Ionicons name="pencil" size={16} color={colors.primary} />
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleDeleteWorkout(w.id, w.name)}>
                  <Ionicons name="trash" size={16} color={colors.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {filters.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <FlatList
          data={loading ? [] : filteredWorkouts}
          keyExtractor={(item) => item.id}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          renderItem={({ item }) => (
            <View style={numColumns > 1 ? { flex: 1, maxWidth: `${100 / numColumns}%`, padding: Spacing.xs } : undefined}>
              <WorkoutCard
                workout={item}
                onPress={() => router.push(`/workout/${item.id}`)}
                colors={colors}
              />
            </View>
          )}
          ListEmptyComponent={loading ? (
            <View>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonWorkoutCard key={i} />
              ))}
            </View>
          ) : undefined}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
