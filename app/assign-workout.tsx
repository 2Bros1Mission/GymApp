import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';
import { useAsyncData } from '../src/hooks/useAsyncData';
import { ErrorCard } from '../src/components/ErrorCard';
import { getTrainerClients, getCustomWorkout, assignWorkout } from '../src/lib/trainerService';
import type { TrainerClient, CustomWorkout } from '../src/types';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  workoutCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.primary },
  workoutName: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text },
  workoutMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginBottom: Spacing.md },
  clientRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  clientRowSelected: { borderWidth: 1, borderColor: colors.primary },
  clientAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  clientAvatarText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  clientName: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  notesInput: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSize.sm, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 80, textAlignVertical: 'top', marginBottom: Spacing.lg },
  assignBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  assignBtnDisabled: { opacity: 0.5 },
  assignBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.success + '15', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  successText: { fontSize: FontSize.sm, color: colors.success, flex: 1 },
});

export default function AssignWorkoutScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [success, setSuccess] = useState(false);

  const clientsFetcher = useCallback(async (): Promise<TrainerClient[]> => {
    if (!user) return [];
    return getTrainerClients(user.id);
  }, [user]);

  const workoutFetcher = useCallback(async (): Promise<CustomWorkout | null> => {
    if (!workoutId) return null;
    return getCustomWorkout(workoutId);
  }, [workoutId]);

  const { data: clients, loading: clientsLoading, error: clientsError, retry: retryClients } = useAsyncData({
    fetcher: clientsFetcher,
    defaultValue: [] as TrainerClient[],
    enabled: !!user,
  });

  const { data: workout, loading: workoutLoading } = useAsyncData({
    fetcher: workoutFetcher,
    defaultValue: null as CustomWorkout | null,
    enabled: !!workoutId,
  });

  const toggleClient = (clientId: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const handleAssign = async () => {
    if (!user || !workoutId || selectedClients.length === 0) return;
    setAssigning(true);

    const errors: string[] = [];
    for (const clientId of selectedClients) {
      const result = await assignWorkout({
        trainerId: user.id,
        clientId,
        workoutId,
        notes: notes.trim() || undefined,
      });
      if (result.error) errors.push(result.error);
    }

    setAssigning(false);

    if (errors.length > 0) {
      Alert.alert(t('common.error'), errors[0]);
    } else {
      setSuccess(true);
      setTimeout(() => router.back(), 1200);
    }
  };

  const loading = clientsLoading || workoutLoading;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('assignments.assignWorkout')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {success && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.successText}>{t('assignments.assigned')}</Text>
          </View>
        )}

        {clientsError && <ErrorCard message={clientsError} onRetry={retryClients} loading={clientsLoading} />}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {workout && (
              <View style={styles.workoutCard}>
                <Text style={styles.workoutName}>
                  {language === 'bg' && workout.nameBg ? workout.nameBg : workout.name}
                </Text>
                <Text style={styles.workoutMeta}>
                  {workout.exercises.length} {t('workouts.exercises')} · {workout.durationMinutes} {t('workouts.minutes')}
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>{t('assignments.selectClients')}</Text>

            {clients.map((c) => {
              const selected = selectedClients.includes(c.clientId);
              return (
                <Pressable
                  key={c.id}
                  style={[styles.clientRow, selected && styles.clientRowSelected]}
                  onPress={() => toggleClient(c.clientId)}
                >
                  <View style={styles.clientAvatar}>
                    <Text style={styles.clientAvatarText}>
                      {(c.clientName ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.clientName}>{c.clientName ?? '--'}</Text>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                </Pressable>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>{t('assignments.notes')}</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('assignments.notes')}
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Pressable
              style={[styles.assignBtn, (assigning || selectedClients.length === 0) && styles.assignBtnDisabled]}
              onPress={handleAssign}
              disabled={assigning || selectedClients.length === 0}
            >
              {assigning ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.assignBtnText}>
                  {t('assignments.assign')} ({selectedClients.length})
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
