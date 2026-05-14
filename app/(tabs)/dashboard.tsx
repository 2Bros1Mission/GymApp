import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { ErrorCard } from '../../src/components/ErrorCard';
import { useFocusAsyncData } from '../../src/hooks/useAsyncData';
import { getTrainerClients, getActiveInvites, getCustomWorkouts } from '../../src/lib/trainerService';
import type { TrainerClient, TrainerInvite, CustomWorkout } from '../../src/types';

interface DashboardData {
  clients: TrainerClient[];
  invites: TrainerInvite[];
  workouts: CustomWorkout[];
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg },
  greeting: { fontSize: FontSize.md, color: colors.textSecondary },
  userName: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: colors.accent + '20', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: Spacing.xs },
  roleBadgeText: { fontSize: FontSize.xs, color: colors.accent, fontWeight: '700' },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', borderLeftWidth: 3 },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text },
  seeAllText: { fontSize: FontSize.sm, color: colors.primary, fontWeight: '600' },
  quickActionsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  quickAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, borderWidth: 1, borderColor: colors.border },
  quickActionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickActionText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  quickActionTextPrimary: { color: colors.white },
  clientItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  clientAvatarText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
  clientInfo: { flex: 1 },
  clientName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  clientDate: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  inviteItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  inviteCode: { fontSize: FontSize.md, fontWeight: '700', color: colors.primary, letterSpacing: 2 },
  inviteExpiry: { fontSize: FontSize.xs, color: colors.textMuted },
  emptyCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg, marginHorizontal: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  workoutItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  workoutDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.md },
  workoutInfo: { flex: 1 },
  workoutName: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  workoutMeta: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
});

export default function TrainerDashboardScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fetcher = useCallback(async (): Promise<DashboardData> => {
    if (!user) return { clients: [], invites: [], workouts: [] };
    const [clients, invites, workouts] = await Promise.all([
      getTrainerClients(user.id),
      getActiveInvites(user.id),
      getCustomWorkouts(user.id),
    ]);
    return { clients, invites, workouts };
  }, [user]);

  const { data, loading, error, retry } = useFocusAsyncData({
    fetcher,
    defaultValue: { clients: [], invites: [], workouts: [] } as DashboardData,
    enabled: !!user,
  });

  const { clients, invites, workouts } = data;
  const displayName = profile?.name || t('home.defaultName');

  const getDifficultyColor = (d: string) =>
    d === 'beginner' ? colors.success : d === 'intermediate' ? colors.accent : colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <Text style={styles.greeting}>{t('home.greeting')},</Text>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{t('role.trainer')}</Text>
            </View>
          </View>

          {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}

          {/* Stats */}
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : !error && (
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Ionicons name="people" size={22} color={colors.primary} />
                <Text style={styles.statValue}>{clients.length}</Text>
                <Text style={styles.statLabel}>{t('dashboard.clients')}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.accent }]}>
                <Ionicons name="barbell" size={22} color={colors.accent} />
                <Text style={styles.statValue}>{workouts.length}</Text>
                <Text style={styles.statLabel}>{t('dashboard.programs')}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.success }]}>
                <Ionicons name="mail" size={22} color={colors.success} />
                <Text style={styles.statValue}>{invites.length}</Text>
                <Text style={styles.statLabel}>{t('dashboard.pendingInvites')}</Text>
              </View>
            </View>
          )}

          {/* Quick actions */}
          <View style={styles.quickActionsRow}>
            <Pressable
              style={[styles.quickAction, styles.quickActionPrimary]}
              onPress={() => router.push('/trainer-clients')}
            >
              <Ionicons name="person-add" size={18} color={colors.white} />
              <Text style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                {t('dashboard.inviteClient')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => router.push('/workout-builder')}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.text} />
              <Text style={styles.quickActionText}>{t('dashboard.createWorkout')}</Text>
            </Pressable>
          </View>

          {/* Recent clients */}
          {!error && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.recentClients')}</Text>
                {clients.length > 0 && (
                  <Pressable onPress={() => router.push('/trainer-clients')}>
                    <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
                  </Pressable>
                )}
              </View>

              {clients.length > 0 ? (
                clients.slice(0, 3).map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.clientItem}
                    onPress={() => router.push(`/client-progress?clientId=${c.clientId}`)}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>
                        {(c.clientName ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{c.clientName ?? '--'}</Text>
                      <Text style={styles.clientDate}>
                        {t('trainer.connectedSince')} {new Date(c.connectedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="people-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>{t('trainer.noClients')}</Text>
                </View>
              )}

              {/* Programs */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.myPrograms')}</Text>
                {workouts.length > 0 && (
                  <Pressable onPress={() => router.push('/my-workouts')}>
                    <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
                  </Pressable>
                )}
              </View>

              {workouts.length > 0 ? (
                workouts.slice(0, 3).map((w) => (
                  <Pressable key={w.id} style={styles.workoutItem} onPress={() => router.push(`/workout-builder?id=${w.id}`)}>
                    <View style={[styles.workoutDot, { backgroundColor: getDifficultyColor(w.difficulty) }]} />
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutName}>{language === 'bg' && w.nameBg ? w.nameBg : w.name}</Text>
                      <Text style={styles.workoutMeta}>
                        {w.exercises.length} {t('workouts.exercises')} · {w.durationMinutes} {t('workouts.minutes')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="barbell-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>{t('builder.noWorkouts')}</Text>
                </View>
              )}

              {/* Pending invites */}
              {invites.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('dashboard.pendingInvites')}</Text>
                  </View>
                  {invites.slice(0, 3).map((inv) => (
                    <View key={inv.id} style={styles.inviteItem}>
                      <Text style={styles.inviteCode}>{inv.code}</Text>
                      <Text style={styles.inviteExpiry}>
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <View style={{ height: Spacing.xl }} />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
