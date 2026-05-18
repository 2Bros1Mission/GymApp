import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { formatDate } from '../lib/formatDate';
import { useTranslation } from '../contexts/LanguageContext';
import type { Language } from '../contexts/LanguageContext';

interface BadgeDisplayProps {
  badgeName: string;
  challengeTitle?: string;
  earnedAt: string;
}

export function BadgeDisplay({ badgeName, challengeTitle, earnedAt }: BadgeDisplayProps) {
  const { colors } = useTheme();
  const { language } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="trophy" size={28} color="#FFD700" />
      </View>
      <View style={styles.info}>
        <Text style={styles.badgeName} numberOfLines={1}>
          {badgeName}
        </Text>
        {challengeTitle != null && challengeTitle.length > 0 && (
          <Text style={styles.challengeTitle} numberOfLines={1}>
            {challengeTitle}
          </Text>
        )}
        <Text style={styles.earnedAt}>
          {formatDate(earnedAt, language as Language)}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      gap: Spacing.md,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(255,215,0,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
    },
    badgeName: {
      fontSize: FontSize.md,
      fontWeight: '700',
      color: colors.text,
    },
    challengeTitle: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    earnedAt: {
      fontSize: FontSize.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
