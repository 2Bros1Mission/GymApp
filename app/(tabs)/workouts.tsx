import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { sampleWorkouts } from '../../src/data/workouts';
import { DifficultyLevel, MuscleGroup, Workout } from '../../src/types';

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

const difficultyColors: Record<DifficultyLevel, string> = {
  beginner: Colors.success,
  intermediate: Colors.accent,
  advanced: Colors.error,
};

type FilterType = 'all' | DifficultyLevel;

function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  const language = 'bg';
  const mainMuscle = workout.muscleGroups[0];

  return (
    <Pressable style={styles.workoutCard} onPress={onPress}>
      <View style={styles.cardLeft}>
        <View style={[styles.iconCircle, { backgroundColor: difficultyColors[workout.difficulty] + '20' }]}>
          <Ionicons
            name={muscleGroupIcons[mainMuscle]}
            size={24}
            color={difficultyColors[workout.difficulty]}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {language === 'bg' ? workout.nameBg : workout.name}
          </Text>
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
        <View style={[styles.difficultyDot, { backgroundColor: difficultyColors[workout.difficulty] }]} />
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('all');

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
      <View style={styles.header}>
        <Text style={styles.title}>{t('workouts.title')}</Text>
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
        data={filteredWorkouts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <WorkoutCard
            workout={item}
            onPress={() => router.push(`/workout/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  filterRow: {
    maxHeight: 50,
    marginBottom: Spacing.md,
  },
  filterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: Colors.white,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  muscleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  muscleChip: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  muscleChipText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  difficultyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
