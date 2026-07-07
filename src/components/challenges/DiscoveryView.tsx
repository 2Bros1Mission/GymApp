import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, Spacing, FontSize } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFocusAsyncData } from '../../hooks/useAsyncData';
import { useOfflineGuard } from '../../hooks/useOfflineGuard';
import { confirmAction } from '../../lib/confirm';
import { getDiscoveryPool, getUserChallengeState, pickChallenge } from '../../lib/challengeService';
import { ErrorCard } from '../ErrorCard';
import { ChallengeCard } from './ChallengeCard';
import type { DiscoveryCard, UserChallengeState } from '../../types';

interface DiscoveryData {
  pool: { daily: DiscoveryCard[]; weekly: DiscoveryCard[]; monthly: DiscoveryCard[] };
  state: UserChallengeState[];
}

const CADENCES = ['daily', 'weekly', 'monthly'] as const;
const SECTION_EMOJI: Record<(typeof CADENCES)[number], string> = {
  daily: '🔥',
  weekly: '📅',
  monthly: '🏆',
};

// Known pick-error codes with dedicated copy; everything else → unknown.
const PICK_ERROR_KEYS = new Set(['cooldown', 'limit_reached', 'already_active']);
function pickErrorKey(error: string | undefined): string {
  return PICK_ERROR_KEYS.has(error ?? '')
    ? `challenges.pick.error.${error}`
    : 'challenges.pick.error.unknown';
}

// availableAt is a full ISO timestamptz — safe to parse (see ChallengeCard).
function minutesUntil(availableAt: string): number {
  return Math.max(1, Math.ceil((new Date(availableAt).getTime() - Date.now()) / 60000));
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl },
  sectionHeader: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginTop: Spacing.lg, marginBottom: Spacing.md },
  emptyWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyText: { fontSize: FontSize.md, color: colors.textSecondary, textAlign: 'center' },
});

export function DiscoveryView() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { guardAction } = useOfflineGuard();

  // Depend on the primitive id, not the `user` object reference: some
  // auth-context implementations (and the test mock) return a fresh
  // object each render, which would otherwise re-create `fetcher` (and
  // cascade into `execute`) every render and re-trigger the focus effect.
  const userId = user?.id;
  const fetcher = useCallback(async (): Promise<DiscoveryData> => {
    const [pool, state] = await Promise.all([
      getDiscoveryPool(userId!),
      getUserChallengeState(userId!),
    ]);
    return { pool, state };
  }, [userId]);

  const { data, loading, error, retry } = useFocusAsyncData<DiscoveryData>({
    fetcher,
    defaultValue: { pool: { daily: [], weekly: [], monthly: [] }, state: [] },
    enabled: !!userId,
  });

  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { if (!loading) setRefreshing(false); }, [loading]);
  const onRefresh = () => { setRefreshing(true); retry(); };

  const handlePress = (card: DiscoveryCard) => {
    if (card.state === 'cooldown') {
      Alert.alert(
        t('challenges.pick.title'),
        t('challenges.card.availableIn', { minutes: String(card.availableAt ? minutesUntil(card.availableAt) : 1) }),
      );
      return;
    }
    if (card.state === 'limit_reached') {
      Alert.alert(t('challenges.card.limitReached'), t('challenges.card.limitReachedMsg'));
      return;
    }
    const title = language === 'bg' ? card.challenge.titleBg ?? card.challenge.title : card.challenge.title;
    guardAction(() =>
      confirmAction(
        t('challenges.pick.title'),
        t('challenges.pick.message', { title }),
        t('challenges.pick.confirm'),
        t('common.cancel'),
        async () => {
          const res = await pickChallenge(card.challenge.id);
          if (res.ok) {
            retry();
          } else {
            Alert.alert(t('challenges.pick.errorTitle'), t(pickErrorKey(res.error)));
          }
        },
      ),
    );
  };

  if (loading && !refreshing && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { pool, state } = data;
  const isEmpty = CADENCES.every((c) => pool[c].length === 0);

  const countsFor = (cadence: (typeof CADENCES)[number]): string => {
    const row = state.find((s) => s.cadence === cadence);
    return `(${row?.completionsThisPeriod ?? 0}/${row?.maxCompletions ?? 0})`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {error && <ErrorCard message={error} onRetry={retry} loading={loading} />}
      {!error && isEmpty && (
        <View style={styles.emptyWrap}>
          <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('challenges.empty')}</Text>
        </View>
      )}
      {!error && !isEmpty && CADENCES.map((cadence) => (
        <View key={cadence}>
          <Text style={styles.sectionHeader}>
            {SECTION_EMOJI[cadence]} {t(`challenges.section.${cadence}`)} {countsFor(cadence)}
          </Text>
          {pool[cadence].map((card) => (
            <ChallengeCard key={card.challenge.id} card={card} onPress={handlePress} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
