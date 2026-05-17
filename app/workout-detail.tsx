import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useFocusAsyncData } from '../src/hooks/useAsyncData';
import { getWorkoutDetail, addWorkoutFeedback } from '../src/lib/feedbackService';
import type { WorkoutDetail } from '../src/types';
import { formatDate } from '../src/lib/formatDate';
import type { Language } from '../src/contexts/LanguageContext';

const EMPTY_DETAIL: WorkoutDetail = {
  id: '',
  workoutName: '',
  date: '',
  durationSeconds: null,
  completed: false,
  notes: null,
  exercises: [],
  feedback: [],
};

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, flex: 1 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  statText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  completedBadge: { backgroundColor: colors.success + '20' },
  completedText: { color: colors.success },
  notCompletedBadge: { backgroundColor: colors.error + '20' },
  notCompletedText: { color: colors.error },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md, marginTop: Spacing.md },

  notesCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  notesText: { fontSize: FontSize.sm, color: colors.text, lineHeight: 20 },

  exerciseCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  exerciseName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, marginBottom: Spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  setRowLast: { borderBottomWidth: 0 },
  setLabel: { width: 40, fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600' },
  setDetail: { flex: 1, fontSize: FontSize.sm, color: colors.text },
  setCheck: { width: 24, alignItems: 'center' },

  feedbackEntry: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  feedbackAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  feedbackAvatarText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  feedbackBubble: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  feedbackName: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  feedbackTime: { fontSize: FontSize.xs, color: colors.textMuted },
  feedbackMessage: { fontSize: FontSize.sm, color: colors.text, lineHeight: 20 },

  emptyFeedback: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyFeedbackText: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' },

  inputRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, alignItems: 'flex-end' },
  feedbackInput: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSize.sm, color: colors.text, borderWidth: 1, borderColor: colors.border, maxHeight: 100, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function formatRelativeTime(dateStr: string, language: Language): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date, language);
}

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ workoutLogId: string; clientId?: string }>();
  const workoutLogId = Array.isArray(params.workoutLogId) ? params.workoutLogId[0] : params.workoutLogId;

  const { t, language } = useTranslation();
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isTrainer = profile?.role === 'trainer';

  const [feedbackText, setFeedbackText] = useState('');
  const [sending, setSending] = useState(false);

  const fetcher = useCallback(async () => {
    if (!workoutLogId) throw new Error('No workout log ID');
    return getWorkoutDetail(workoutLogId);
  }, [workoutLogId]);

  const { data: detail, loading, error, retry } = useFocusAsyncData({
    fetcher,
    defaultValue: EMPTY_DETAIL,
    enabled: !!workoutLogId,
  });

  const handleSendFeedback = async () => {
    if (!user || !feedbackText.trim() || sending) return;
    setSending(true);
    try {
      const result = await addWorkoutFeedback({
        workoutLogId,
        trainerId: user.id,
        message: feedbackText.trim(),
      });
      if (result.error) {
        Alert.alert(t('feedback.error'), result.error);
        return;
      }
      setFeedbackText('');
      retry();
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {detail.workoutName || t('workoutDetail.title')}
          </Text>
        </View>

        {loading && !detail.id && (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.xl }} />
        )}

        {error && (
          <Pressable style={styles.notesCard} onPress={retry}>
            <Text style={{ color: colors.error, fontSize: FontSize.sm }}>{error}</Text>
          </Pressable>
        )}

        {detail.id && (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.statText}>{formatDate(detail.date, language)}</Text>
              </View>
              <View style={styles.statBadge}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.statText}>{formatDuration(detail.durationSeconds)}</Text>
              </View>
              <View style={[styles.statBadge, detail.completed ? styles.completedBadge : styles.notCompletedBadge]}>
                <Ionicons
                  name={detail.completed ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={detail.completed ? colors.success : colors.error}
                />
                <Text style={[styles.statText, detail.completed ? styles.completedText : styles.notCompletedText]}>
                  {detail.completed ? t('workoutDetail.completed') : t('workoutDetail.notCompleted')}
                </Text>
              </View>
            </View>

            {/* Client notes */}
            {detail.notes && (
              <>
                <Text style={styles.sectionTitle}>{t('workoutDetail.clientNotes')}</Text>
                <View style={styles.notesCard}>
                  <Text style={styles.notesText}>{detail.notes}</Text>
                </View>
              </>
            )}

            {/* Exercises */}
            <Text style={styles.sectionTitle}>
              {t('workoutDetail.exercises')} ({detail.exercises.length})
            </Text>
            {detail.exercises.map((ex) => (
              <View key={ex.id} style={styles.exerciseCard}>
                <Text style={styles.exerciseName}>{ex.exerciseName}</Text>
                {ex.sets.map((s, i) => (
                  <View key={s.id} style={[styles.setRow, i === ex.sets.length - 1 && styles.setRowLast]}>
                    <Text style={styles.setLabel}>#{s.setNumber}</Text>
                    <Text style={styles.setDetail}>{s.weight} kg x {s.reps}</Text>
                    <View style={styles.setCheck}>
                      {s.completed && <Ionicons name="checkmark" size={16} color={colors.success} />}
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {/* Feedback section */}
            <Text style={styles.sectionTitle}>{t('feedback.title')}</Text>
            {detail.feedback.length > 0 ? (
              detail.feedback.map((fb) => (
                <View key={fb.id} style={styles.feedbackEntry}>
                  <View style={styles.feedbackAvatar}>
                    <Text style={styles.feedbackAvatarText}>
                      {(fb.trainerName || 'T').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.feedbackBubble}>
                    <View style={styles.feedbackHeader}>
                      <Text style={styles.feedbackName}>{fb.trainerName || t('feedback.fromTrainer')}</Text>
                      <Text style={styles.feedbackTime}>{formatRelativeTime(fb.createdAt, language)}</Text>
                    </View>
                    <Text style={styles.feedbackMessage}>{fb.message}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyFeedback}>
                <Ionicons name="chatbubble-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyFeedbackText}>{t('feedback.noFeedback')}</Text>
              </View>
            )}

            {/* Trainer input */}
            {isTrainer && (
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.feedbackInput}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder={t('feedback.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={2000}
                />
                <Pressable
                  style={[styles.sendBtn, (!feedbackText.trim() || sending) && styles.sendBtnDisabled]}
                  onPress={handleSendFeedback}
                  disabled={!feedbackText.trim() || sending}
                >
                  <Ionicons name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            )}
          </>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
