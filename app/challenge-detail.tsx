import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../src/constants/theme';
import { useTheme } from '../src/contexts/ThemeContext';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useAuth } from '../src/contexts/AuthContext';
import { useAsyncData } from '../src/hooks/useAsyncData';
import { useOfflineGuard } from '../src/hooks/useOfflineGuard';
import { ErrorCard } from '../src/components/ErrorCard';
import { CelebrationModal } from '../src/components/CelebrationModal';
import {
  getChallengeDetail,
  getChallengeLeaderboard,
  joinChallenge,
  completeChallenge,
  updateCustomProgress,
  getParticipants,
  subscribeToChallengeUpdates,
  unsubscribeFromChannel,
  getIssuedDiscountCodes,
  getEarnedRewards,
} from '../src/lib/challengeService';
import { confirmAction } from '../src/lib/confirm';
import { formatDate } from '../src/lib/formatDate';
import type { Challenge, LeaderboardEntry, ChallengeParticipant, ChallengeReward } from '../src/types';
import type { Language } from '../src/contexts/LanguageContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MEDAL_ICONS: Record<number, string> = { 1: 'trophy', 2: 'medal', 3: 'ribbon' };
const MEDAL_COLORS: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };

function getDaysLeft(endDate: string): number {
  const now = new Date();
  const end = new Date(endDate);
  // Normalize both to noon to avoid DST issues
  now.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
}

function challengeTypeLabel(type: Challenge['challengeType'], t: (k: string) => string): string {
  switch (type) {
    case 'frequency': return t('challenges.frequency');
    case 'streak': return t('challenges.streak');
    case 'custom': return t('challenges.custom');
    default: return type;
  }
}

function statusColor(status: Challenge['status'], colors: ColorPalette): string {
  switch (status) {
    case 'active': return colors.success;
    case 'upcoming': return colors.accent;
    case 'completed': return colors.textSecondary;
    default: return colors.textSecondary;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  const isTrainer = profile?.role === 'trainer';

  // ─── Data fetching ──────────────────────────────────────────────────────

  const challengeFetcher = useCallback(
    () => getChallengeDetail(id ?? ''),
    [id],
  );
  const {
    data: challenge,
    loading: challengeLoading,
    error: challengeError,
    retry: retryChallenge,
  } = useAsyncData<Challenge | null>({
    fetcher: challengeFetcher,
    defaultValue: null,
    enabled: !!id,
  });

  const leaderboardFetcher = useCallback(
    () => getChallengeLeaderboard(id ?? ''),
    [id],
  );
  const {
    data: leaderboard,
    loading: leaderboardLoading,
    error: leaderboardError,
    retry: refreshLeaderboard,
  } = useAsyncData<LeaderboardEntry[]>({
    fetcher: leaderboardFetcher,
    defaultValue: [],
    enabled: !!id,
  });

  const participantsFetcher = useCallback(
    () => getParticipants(id ?? ''),
    [id],
  );
  const {
    data: participants,
    retry: refreshParticipants,
  } = useAsyncData<ChallengeParticipant[]>({
    fetcher: participantsFetcher,
    defaultValue: [],
    enabled: !!id,
  });

  const rewardsFetcher = useCallback(
    () => (isTrainer ? getIssuedDiscountCodes(id ?? '') : getEarnedRewards(user?.id ?? '')),
    [id, isTrainer, user?.id],
  );
  const {
    data: rewards,
    retry: refreshRewards,
  } = useAsyncData<ChallengeReward[]>({
    fetcher: rewardsFetcher,
    defaultValue: [],
    enabled: !!id && !!user,
  });

  // ─── Local state ────────────────────────────────────────────────────────

  const [joining, setJoining] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [progressInputs, setProgressInputs] = useState<Record<string, string>>({});
  const [updatingProgress, setUpdatingProgress] = useState<string | null>(null);

  // ─── Realtime subscription ──────────────────────────────────────────────

  useEffect(() => {
    if (!id || challenge?.status !== 'active') return;

    const channel = subscribeToChallengeUpdates(id, () => {
      refreshLeaderboard();
    });

    return () => {
      unsubscribeFromChannel(channel);
    };
  }, [id, challenge?.status, refreshLeaderboard]);

  // ─── Derived state ─────────────────────────────────────────────────────

  const isParticipant = useMemo(
    () => participants.some((p) => p.userId === user?.id),
    [participants, user?.id],
  );

  const canJoin = useMemo(
    () =>
      !isParticipant &&
      !isTrainer &&
      challenge != null &&
      (challenge.status === 'active' || challenge.status === 'upcoming'),
    [isParticipant, isTrainer, challenge],
  );

  const canComplete = useMemo(
    () =>
      isTrainer &&
      challenge != null &&
      challenge.status === 'active' &&
      challenge.creatorId === user?.id,
    [isTrainer, challenge, user?.id],
  );

  const canUpdateProgress = useMemo(
    () =>
      isTrainer &&
      challenge != null &&
      challenge.challengeType === 'custom' &&
      challenge.status === 'active' &&
      challenge.creatorId === user?.id,
    [isTrainer, challenge, user?.id],
  );

  const daysLeft = useMemo(
    () => (challenge ? getDaysLeft(challenge.endDate) : 0),
    [challenge],
  );

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleJoin = useCallback(() => {
    if (!id || !user) return;
    guardAction(async () => {
      setJoining(true);
      try {
        const result = await joinChallenge(id, user.id);
        if (result.error) {
          Alert.alert(t('common.error'), result.error);
        } else {
          refreshParticipants();
          refreshLeaderboard();
        }
      } finally {
        setJoining(false);
      }
    });
  }, [id, user, guardAction, t, refreshParticipants, refreshLeaderboard]);

  const handleComplete = useCallback(() => {
    if (!id) return;
    confirmAction(
      t('challenges.complete'),
      t('challenges.completeConfirm'),
      t('challenges.complete'),
      t('common.cancel'),
      () => {
        guardAction(async () => {
          setCompleting(true);
          try {
            const result = await completeChallenge(id);
            if (!result.success) {
              Alert.alert(t('common.error'), result.error ?? '');
            } else {
              retryChallenge();
              refreshLeaderboard();
              refreshRewards();
              setShowCelebration(true);
            }
          } finally {
            setCompleting(false);
          }
        });
      },
    );
  }, [id, guardAction, t, retryChallenge, refreshLeaderboard, refreshRewards]);

  const handleUpdateProgress = useCallback(
    (participantId: string) => {
      const raw = progressInputs[participantId];
      const value = Number(raw);
      if (!raw || isNaN(value) || value < 0) return;

      guardAction(async () => {
        setUpdatingProgress(participantId);
        try {
          const result = await updateCustomProgress(participantId, value);
          if (!result.success) {
            Alert.alert(t('common.error'), result.error ?? '');
          } else {
            setProgressInputs((prev) => ({ ...prev, [participantId]: '' }));
            refreshLeaderboard();
            refreshParticipants();
          }
        } finally {
          setUpdatingProgress(null);
        }
      });
    },
    [progressInputs, guardAction, t, refreshLeaderboard, refreshParticipants],
  );

  // ─── Loading / Error states ─────────────────────────────────────────────

  if (challengeLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (challengeError || !challenge) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('challenges.title')}</Text>
          <View style={{ width: 44 }} />
        </View>
        <ErrorCard message={challengeError ?? 'Not found'} onRetry={retryChallenge} />
      </SafeAreaView>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {challenge.title}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Challenge Info Card ──────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('challenges.type')}</Text>
            <Text style={styles.infoValue}>
              {challengeTypeLabel(challenge.challengeType, t)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('challenges.target')}</Text>
            <Text style={styles.infoValue}>{challenge.targetValue}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('challenges.startDate')}</Text>
            <Text style={styles.infoValue}>
              {formatDate(challenge.startDate, language as Language)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('challenges.endDate')}</Text>
            <Text style={styles.infoValue}>
              {formatDate(challenge.endDate, language as Language)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('challenges.participants')}</Text>
            <Text style={styles.infoValue}>{participants.length}</Text>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusColor(challenge.status, colors) }]}>
            <Text style={styles.statusText}>
              {challenge.status === 'active'
                ? t('challenges.active')
                : challenge.status === 'upcoming'
                  ? t('challenges.upcoming')
                  : t('challenges.completed')}
            </Text>
          </View>

          {/* Days left */}
          {challenge.status === 'active' && daysLeft > 0 && (
            <Text style={styles.daysLeft}>
              {daysLeft} {t('challenges.daysLeft')}
            </Text>
          )}
          {challenge.status === 'active' && daysLeft <= 0 && (
            <Text style={[styles.daysLeft, { color: colors.error }]}>{t('challenges.ended')}</Text>
          )}

          {/* Description */}
          {challenge.description != null && challenge.description.length > 0 && (
            <Text style={styles.description}>{challenge.description}</Text>
          )}
        </View>

        {/* ── Join Button ─────────────────────────────────────────────── */}
        {canJoin && (
          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.actionButtonText}>{t('challenges.join')}</Text>
            )}
          </Pressable>
        )}

        {isParticipant && !isTrainer && (
          <View style={[styles.joinedBadge, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.joinedText, { color: colors.success }]}>{t('challenges.joined')}</Text>
          </View>
        )}

        {/* ── Complete Button (trainer only) ──────────────────────────── */}
        {canComplete && (
          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.accent }]}
            onPress={handleComplete}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.actionButtonText}>{t('challenges.complete')}</Text>
            )}
          </Pressable>
        )}

        {/* ── Leaderboard ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('challenges.leaderboard')}</Text>

        {leaderboardLoading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: Spacing.md }} />
        )}

        {leaderboardError != null && (
          <ErrorCard message={leaderboardError} onRetry={refreshLeaderboard} />
        )}

        {!leaderboardLoading && leaderboard.length === 0 && (
          <Text style={styles.emptyText}>{t('challenges.empty')}</Text>
        )}

        {leaderboard.map((entry, idx) => {
          const rank = idx + 1;
          const pct = entry.target > 0 ? Math.min((entry.progress / entry.target) * 100, 100) : 0;
          const medalIcon = MEDAL_ICONS[rank];
          const medalColor = MEDAL_COLORS[rank];

          return (
            <View key={entry.userId} style={styles.leaderboardRow}>
              <View style={styles.rankCell}>
                {challenge.status === 'completed' && medalIcon ? (
                  <Ionicons name={medalIcon as keyof typeof Ionicons.glyphMap} size={20} color={medalColor} />
                ) : (
                  <Text style={styles.rankText}>{rank}</Text>
                )}
              </View>
              <View style={styles.entryInfo}>
                <Text style={styles.entryName} numberOfLines={1}>
                  {entry.userName}
                  {entry.userId === user?.id ? ` (${t('challenges.yourRank')})` : ''}
                </Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: pct >= 100 ? colors.success : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {entry.progress}/{entry.target}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* ── Custom Progress Update (trainer + custom type) ──────────── */}
        {canUpdateProgress && participants.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('challenges.progress')}</Text>
            {participants.map((p) => (
              <View key={p.id} style={styles.progressUpdateRow}>
                <Text style={styles.participantName} numberOfLines={1}>
                  {p.userName ?? p.userId}
                </Text>
                <View style={styles.progressInputRow}>
                  <TextInput
                    style={styles.progressInput}
                    keyboardType="numeric"
                    placeholder={String(p.progress)}
                    placeholderTextColor={colors.textSecondary}
                    value={progressInputs[p.id] ?? ''}
                    onChangeText={(txt) =>
                      setProgressInputs((prev) => ({ ...prev, [p.id]: txt }))
                    }
                  />
                  <Pressable
                    style={[styles.updateBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleUpdateProgress(p.id)}
                    disabled={updatingProgress === p.id}
                  >
                    {updatingProgress === p.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="checkmark" size={18} color={colors.white} />
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Rewards Section ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('challenges.rewards')}</Text>

        {/* Reward info from challenge */}
        {challenge.rewardType != null && (
          <View style={styles.rewardInfoCard}>
            <Ionicons name="gift" size={20} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={styles.rewardTypeText}>
                {challenge.rewardType === 'badge'
                  ? t('challenges.badge')
                  : challenge.rewardType === 'discount'
                    ? t('challenges.discount')
                    : challenge.rewardType === 'battle_pass'
                      ? t('challenges.battlePass')
                      : t('challenges.customReward')}
              </Text>
              {challenge.rewardDescription != null && (
                <Text style={styles.rewardDescText}>{challenge.rewardDescription}</Text>
              )}
              {challenge.discountValue != null && (
                <Text style={styles.rewardDescText}>
                  {t('challenges.discountValue')}: {challenge.discountValue}
                  {challenge.discountType === 'percentage' ? '%' : ''}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Earned badges / discount codes */}
        {rewards.length > 0 && (
          <View style={styles.rewardsList}>
            {rewards.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                <Ionicons
                  name={reward.rewardType === 'badge' ? 'ribbon' : 'pricetag'}
                  size={18}
                  color={colors.accent}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  {reward.badgeName != null && (
                    <Text style={styles.rewardBadgeName}>{reward.badgeName}</Text>
                  )}
                  {reward.discountCode != null && (
                    <Text style={styles.rewardCode}>{reward.discountCode}</Text>
                  )}
                  {reward.description != null && (
                    <Text style={styles.rewardDescText}>{reward.description}</Text>
                  )}
                  {reward.redeemed && (
                    <Text style={[styles.redeemedBadge, { color: colors.textSecondary }]}>
                      {t('challenges.redeemed')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {rewards.length === 0 && challenge.status === 'completed' && (
          <Text style={styles.emptyText}>{t('challenges.noRewards')}</Text>
        )}

        {/* Bottom spacing */}
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <CelebrationModal
        visible={showCelebration}
        onClose={() => setShowCelebration(false)}
        challengeTitle={challenge?.title ?? ''}
        leaderboard={leaderboard}
        rewards={[]}
        currentUserId={user?.id ?? ''}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      marginBottom: Spacing.md,
      gap: Spacing.md,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: FontSize.xl,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },

    // Info card
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.xs,
    },
    infoLabel: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    infoValue: {
      fontSize: FontSize.sm,
      color: colors.text,
      fontWeight: '700',
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      marginTop: Spacing.sm,
    },
    statusText: {
      fontSize: FontSize.xs,
      fontWeight: '700',
      color: colors.white,
      textTransform: 'uppercase',
    },
    daysLeft: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    description: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
      lineHeight: 20,
    },

    // Actions
    actionButton: {
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    actionButtonText: {
      fontSize: FontSize.md,
      fontWeight: '700',
      color: colors.white,
    },
    joinedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      marginBottom: Spacing.md,
    },
    joinedText: {
      fontSize: FontSize.sm,
      fontWeight: '700',
    },

    // Leaderboard
    sectionTitle: {
      fontSize: FontSize.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: Spacing.md,
      marginTop: Spacing.md,
    },
    emptyText: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginVertical: Spacing.md,
    },
    leaderboardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.xs,
    },
    rankCell: {
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      fontSize: FontSize.md,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    entryInfo: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    entryName: {
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    progressBar: {
      flex: 1,
      height: 6,
      backgroundColor: colors.surfaceLight,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: BorderRadius.full,
    },
    progressText: {
      fontSize: FontSize.xs,
      fontWeight: '600',
      color: colors.primary,
      minWidth: 50,
      textAlign: 'right',
    },

    // Custom progress update
    progressUpdateRow: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.xs,
    },
    participantName: {
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: colors.text,
      marginBottom: Spacing.xs,
    },
    progressInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    progressInput: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      fontSize: FontSize.sm,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    updateBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Rewards
    rewardInfoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
    rewardTypeText: {
      fontSize: FontSize.sm,
      fontWeight: '700',
      color: colors.text,
    },
    rewardDescText: {
      fontSize: FontSize.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    rewardsList: {
      marginTop: Spacing.xs,
    },
    rewardCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.xs,
    },
    rewardBadgeName: {
      fontSize: FontSize.sm,
      fontWeight: '700',
      color: colors.text,
    },
    rewardCode: {
      fontSize: FontSize.sm,
      fontWeight: '700',
      color: colors.accent,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    redeemedBadge: {
      fontSize: FontSize.xs,
      fontWeight: '600',
      marginTop: 2,
    },
  });
