import React, { useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useFocusAsyncData } from '../../src/hooks/useAsyncData';
import { useOfflineGuard } from '../../src/hooks/useOfflineGuard';
import { ErrorCard } from '../../src/components/ErrorCard';
import { getChallenges, joinChallenge, deleteChallenge } from '../../src/lib/challengeService';
import { confirmAction } from '../../src/lib/confirm';
import type { Challenge, ChallengeType } from '../../src/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTypeIcon(type: ChallengeType): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'frequency': return 'repeat';
    case 'streak': return 'flame';
    case 'custom': return 'options';
  }
}

function getStatusColor(status: Challenge['status'], colors: ColorPalette): string {
  switch (status) {
    case 'active': return colors.success;
    case 'upcoming': return colors.warning;
    case 'completed': return colors.textMuted;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  createBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Spacing.xl * 2,
  },
  sectionHeader: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: colors.white,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: Spacing.xs,
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: FontSize.xs,
    color: colors.textSecondary,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  rewardText: {
    fontSize: FontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  joinBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: colors.error,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: colors.textMuted,
  },
});

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { guardAction } = useOfflineGuard();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isTrainer = profile?.role === 'trainer';
  const userId = user?.id;

  const { data: challenges, loading, error, retry } = useFocusAsyncData<Challenge[]>({
    fetcher: useCallback(() => getChallenges(userId ?? ''), [userId]),
    defaultValue: [],
    enabled: !!userId,
  });

  const activeChallenges = useMemo(
    () => challenges.filter((c) => c.status === 'active'),
    [challenges],
  );
  const upcomingChallenges = useMemo(
    () => challenges.filter((c) => c.status === 'upcoming'),
    [challenges],
  );
  const completedChallenges = useMemo(
    () => challenges.filter((c) => c.status === 'completed'),
    [challenges],
  );

  const handleJoin = useCallback(
    (challengeId: string) => {
      if (!userId) return;
      guardAction(async () => {
        const result = await joinChallenge(challengeId, userId);
        if (result.error) {
          Alert.alert(t('common.error'), result.error);
          return;
        }
        retry();
      });
    },
    [userId, guardAction, retry, t],
  );

  const handleDelete = useCallback(
    (challenge: Challenge) => {
      confirmAction(
        t('common.delete'),
        t('challenges.deleteConfirm'),
        t('common.delete'),
        t('common.cancel'),
        () => {
          guardAction(async () => {
            const result = await deleteChallenge(challenge.id);
            if (!result.error) {
              retry();
            }
          });
        },
      );
    },
    [t, guardAction, retry],
  );

  const getTypeLabel = useCallback(
    (type: ChallengeType): string => {
      switch (type) {
        case 'frequency': return t('challenges.frequency');
        case 'streak': return t('challenges.streak');
        case 'custom': return t('challenges.custom');
      }
    },
    [t],
  );

  const getStatusLabel = useCallback(
    (status: Challenge['status']): string => {
      switch (status) {
        case 'active': return t('challenges.active');
        case 'upcoming': return t('challenges.upcoming');
        case 'completed': return t('challenges.completed');
      }
    },
    [t],
  );

  const renderCard = useCallback(
    (challenge: Challenge) => {
      const statusColor = getStatusColor(challenge.status, colors);

      return (
        <Pressable
          key={challenge.id}
          style={styles.card}
          onPress={() => router.push(`/challenge-detail?id=${challenge.id}` as any)}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {challenge.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{getStatusLabel(challenge.status)}</Text>
            </View>
          </View>

          <View style={styles.typeBadge}>
            <Ionicons name={getTypeIcon(challenge.challengeType)} size={14} color={colors.textSecondary} />
            <Text style={styles.typeBadgeText}>{getTypeLabel(challenge.challengeType)}</Text>
          </View>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.dateText}>
              {formatDate(challenge.startDate)} — {formatDate(challenge.endDate)}
            </Text>
          </View>

          {challenge.rewardDescription && (
            <View style={styles.rewardRow}>
              <Ionicons name="gift-outline" size={14} color={colors.primary} />
              <Text style={styles.rewardText} numberOfLines={1}>
                {challenge.rewardDescription}
              </Text>
            </View>
          )}

          <View style={styles.cardActions}>
            {isTrainer && challenge.creatorId === userId && (
              <Pressable
                style={styles.deleteBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleDelete(challenge);
                }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
              </Pressable>
            )}

            {!isTrainer && challenge.status === 'active' && (
              <Pressable
                style={styles.joinBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleJoin(challenge.id);
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.white} />
                <Text style={styles.joinBtnText}>{t('challenges.join')}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      );
    },
    [colors, styles, isTrainer, userId, router, t, handleJoin, handleDelete, getTypeLabel, getStatusLabel],
  );

  const renderSection = useCallback(
    (title: string, items: Challenge[]) => {
      if (items.length === 0) return null;
      return (
        <View>
          <Text style={styles.sectionHeader}>{title}</Text>
          {items.map(renderCard)}
        </View>
      );
    },
    [styles, renderCard],
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('challenges.title')}</Text>
        </View>
        <ErrorCard message={error} onRetry={retry} loading={loading} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('challenges.title')}</Text>
        {isTrainer && (
          <Pressable
            style={styles.createBtn}
            onPress={() => router.push('/create-challenge' as any)}
          >
            <Ionicons name="add" size={20} color={colors.white} />
            <Text style={styles.createBtnText}>{t('challenges.create')}</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('challenges.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderSection(t('challenges.active'), activeChallenges)}
          {renderSection(t('challenges.upcoming'), upcomingChallenges)}
          {renderSection(t('challenges.completed'), completedChallenges)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
