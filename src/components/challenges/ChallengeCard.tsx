import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTranslation } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Challenge, DiscoveryCard } from '../../types';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<Challenge['challengeType'], IoniconsName> = {
  frequency: 'barbell-outline',
  streak: 'flame-outline',
  custom_auto: 'star-outline',
  custom_self_reported: 'star-outline',
};

// availableAt is a full ISO timestamptz string (explicit timezone), so
// new Date() parsing is safe here — the project's "no new Date on
// 'YYYY-MM-DD'" rule targets date-ONLY strings, which parse as UTC
// midnight and shift in Europe/Sofia (PR #160 regression).
function minutesUntil(availableAt: string): number {
  return Math.max(1, Math.ceil((new Date(availableAt).getTime() - Date.now()) / 60000));
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCooldown: { opacity: 0.55 },
  cardLimit: { opacity: 0.4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
  title: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, marginBottom: 2 },
  meta: { fontSize: FontSize.sm, color: colors.textSecondary },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  pointsText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  stateRibbon: { marginTop: Spacing.sm, fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
});

const DIFFICULTY_COLOR: Record<'easy' | 'medium' | 'hard', keyof ColorPalette> = {
  easy: 'success',
  medium: 'accent',
  hard: 'error',
};

interface ChallengeCardProps {
  card: DiscoveryCard;
  onPress: (card: DiscoveryCard) => void;
}

export function ChallengeCard({ card, onPress }: ChallengeCardProps) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { challenge, state, availableAt } = card;
  const title = language === 'bg' ? challenge.titleBg ?? challenge.title : challenge.title;

  return (
    <Pressable
      testID={`challenge-card-${challenge.id}`}
      style={[styles.card, state === 'cooldown' && styles.cardCooldown, state === 'limit_reached' && styles.cardLimit]}
      onPress={() => onPress(card)}
    >
      <View style={styles.topRow}>
        <Ionicons name={TYPE_ICONS[challenge.challengeType]} size={20} color={colors.primary} />
        {challenge.difficulty && (
          <View style={[styles.badge, { backgroundColor: colors[DIFFICULTY_COLOR[challenge.difficulty]] }]}>
            <Text style={styles.badgeText}>{t(`challenges.difficulty.${challenge.difficulty}`)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{t('challenges.card.target', { value: String(challenge.targetValue) })}</Text>
      <View style={styles.pointsRow}>
        <Ionicons name="medal-outline" size={16} color={colors.accent} />
        <Text style={styles.pointsText}>{challenge.points} {t('challenges.card.points')}</Text>
      </View>
      {state === 'cooldown' && availableAt && (
        <Text style={styles.stateRibbon}>{t('challenges.card.availableIn', { minutes: String(minutesUntil(availableAt)) })}</Text>
      )}
      {state === 'limit_reached' && (
        <Text style={styles.stateRibbon}>{t('challenges.card.limitReached')}</Text>
      )}
    </Pressable>
  );
}
