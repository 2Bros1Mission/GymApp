import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { sampleWorkouts } from '../../src/data/workouts';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const language = 'bg';

  const workout = sampleWorkouts.find((w) => w.id === id);

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Тренировката не е намерена</Text>
      </SafeAreaView>
    );
  }

  const difficultyColor =
    workout.difficulty === 'beginner' ? Colors.success
    : workout.difficulty === 'intermediate' ? Colors.accent
    : Colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {language === 'bg' ? workout.nameBg : workout.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>{workout.durationMinutes} {t('workouts.minutes')}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="barbell-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>{workout.exercises.length} {t('workouts.exercises')}</Text>
          </View>
          <View style={[styles.difficultyPill, { backgroundColor: difficultyColor + '20' }]}>
            <View style={[styles.difficultyDotSmall, { backgroundColor: difficultyColor }]} />
            <Text style={[styles.difficultyPillText, { color: difficultyColor }]}>
              {t(`difficulty.${workout.difficulty}`)}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>
          {language === 'bg' ? workout.descriptionBg : workout.description}
        </Text>

        <View style={styles.muscleGroupRow}>
          {workout.muscleGroups.map((mg) => (
            <View key={mg} style={styles.muscleTag}>
              <Text style={styles.muscleTagText}>{t(`muscle.${mg}`)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Упражнения</Text>

        {workout.exercises.map((exercise, index) => (
          <View key={exercise.id} style={styles.exerciseCard}>
            <View style={styles.exerciseNumber}>
              <Text style={styles.exerciseNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.exerciseInfo}>
              <Text style={styles.exerciseName}>
                {language === 'bg' ? exercise.nameBg : exercise.name}
              </Text>
              <View style={styles.exerciseMeta}>
                <Text style={styles.exerciseMetaText}>
                  {exercise.sets} {t('exercise.sets')} × {exercise.reps} {t('exercise.reps')}
                </Text>
                <Text style={styles.exerciseRest}>
                  {t('exercise.rest')}: {exercise.restSeconds}с
                </Text>
              </View>
            </View>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={styles.startButton}
          onPress={() => router.push(`/active-workout/${workout.id}`)}
        >
          <Ionicons name="play" size={22} color={Colors.white} />
          <Text style={styles.startButtonText}>{t('workouts.start')}</Text>
        </Pressable>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  difficultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  difficultyDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyPillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  muscleGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  muscleTag: {
    backgroundColor: Colors.primaryDark + '40',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  muscleTagText: {
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  exerciseNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  exerciseMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  exerciseMetaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  exerciseRest: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.background + 'F0',
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
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
  },
  errorText: {
    fontSize: FontSize.lg,
    color: Colors.error,
    textAlign: 'center',
    marginTop: 100,
  },
});
