import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';
import type { LeaderboardEntry, ChallengeReward } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COUNT = 20;
const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#6366F1'];
const MEDAL_EMOJIS: Record<number, string> = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };

interface CelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  challengeTitle: string;
  leaderboard: LeaderboardEntry[];
  rewards: ChallengeReward[];
  currentUserId: string;
}

interface ConfettiParticle {
  animY: Animated.Value;
  animOpacity: Animated.Value;
  x: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

function createParticles(): ConfettiParticle[] {
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    animY: new Animated.Value(0),
    animOpacity: new Animated.Value(1),
    x: Math.random() * SCREEN_WIDTH,
    size: 6 + Math.random() * 10,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 1500,
    duration: 2000 + Math.random() * 2000,
  }));
}

export function CelebrationModal({
  visible,
  onClose,
  challengeTitle,
  leaderboard,
  rewards,
  currentUserId,
}: CelebrationModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const particlesRef = useRef<ConfettiParticle[]>(createParticles());

  useEffect(() => {
    if (!visible) return;

    // Reset and start confetti
    const particles = particlesRef.current;
    particles.forEach((p) => {
      p.animY.setValue(0);
      p.animOpacity.setValue(1);
    });

    const animations = particles.map((p) =>
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.animY, {
            toValue: SCREEN_HEIGHT + 50,
            duration: p.duration,
            useNativeDriver: true,
          }),
          Animated.timing(p.animOpacity, {
            toValue: 0,
            duration: p.duration,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const composite = Animated.stagger(50, animations);
    composite.start();

    return () => {
      composite.stop();
    };
  }, [visible]);

  const top3 = leaderboard.slice(0, 3);
  const winner = top3[0];
  const isCurrentUserWinner = winner?.userId === currentUserId;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Confetti */}
        {particlesRef.current.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.confettiDot,
              {
                left: p.x,
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                backgroundColor: p.color,
                transform: [{ translateY: p.animY }],
                opacity: p.animOpacity,
              },
            ]}
          />
        ))}

        <View style={styles.card}>
          {/* Trophy header */}
          <Ionicons name="trophy" size={48} color="#FFD700" style={styles.trophyIcon} />
          <Text style={styles.congratsText}>{t('challenges.completed')}</Text>
          <Text style={styles.challengeTitle} numberOfLines={2}>
            {challengeTitle}
          </Text>

          {/* Winner highlight */}
          {winner && (
            <View style={styles.winnerSection}>
              <Ionicons name="trophy" size={24} color="#FFD700" />
              <Text style={styles.winnerName}>
                {winner.userName}
                {isCurrentUserWinner ? ` (${t('challenges.yourRank')})` : ''}
              </Text>
            </View>
          )}

          {/* Top 3 leaderboard */}
          {top3.length > 0 && (
            <View style={styles.leaderboardSection}>
              {top3.map((entry, idx) => {
                const rank = idx + 1;
                const medal = MEDAL_EMOJIS[rank] ?? '';
                const isCurrentUser = entry.userId === currentUserId;
                return (
                  <View
                    key={entry.userId}
                    style={[styles.leaderboardRow, isCurrentUser && styles.currentUserRow]}
                  >
                    <Text style={styles.medalText}>{medal}</Text>
                    <Text style={styles.entryName} numberOfLines={1}>
                      {entry.userName}
                    </Text>
                    <Text style={styles.entryScore}>
                      {entry.progress}/{entry.target}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Earned rewards */}
          {rewards.length > 0 && (
            <View style={styles.rewardsSection}>
              <Text style={styles.rewardsSectionTitle}>{t('challenges.rewards')}</Text>
              {rewards.map((reward) => (
                <View key={reward.id} style={styles.rewardRow}>
                  <Ionicons
                    name={reward.rewardType === 'badge' ? 'ribbon' : 'pricetag'}
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={styles.rewardText} numberOfLines={1}>
                    {reward.badgeName ?? reward.description ?? reward.discountCode ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    confettiDot: {
      position: 'absolute',
      top: -20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      width: '85%',
      maxWidth: 400,
      alignItems: 'center',
    },
    trophyIcon: {
      marginBottom: Spacing.sm,
    },
    congratsText: {
      fontSize: FontSize.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: Spacing.xs,
      textTransform: 'uppercase',
    },
    challengeTitle: {
      fontSize: FontSize.lg,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    winnerSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: 'rgba(255,215,0,0.15)',
      borderRadius: BorderRadius.md,
    },
    winnerName: {
      fontSize: FontSize.lg,
      fontWeight: '700',
      color: '#FFD700',
    },
    leaderboardSection: {
      width: '100%',
      marginBottom: Spacing.md,
    },
    leaderboardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.xs,
    },
    currentUserRow: {
      backgroundColor: colors.surfaceLight,
    },
    medalText: {
      fontSize: FontSize.lg,
      width: 30,
      textAlign: 'center',
    },
    entryName: {
      flex: 1,
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: colors.text,
      marginLeft: Spacing.xs,
    },
    entryScore: {
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: colors.primary,
      marginLeft: Spacing.sm,
    },
    rewardsSection: {
      width: '100%',
      marginBottom: Spacing.md,
    },
    rewardsSectionTitle: {
      fontSize: FontSize.sm,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: Spacing.sm,
    },
    rewardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    rewardText: {
      flex: 1,
      fontSize: FontSize.sm,
      color: colors.text,
    },
    closeButton: {
      backgroundColor: colors.primary,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xxl,
      borderRadius: BorderRadius.md,
      marginTop: Spacing.sm,
    },
    closeButtonText: {
      fontSize: FontSize.md,
      fontWeight: '700',
      color: colors.white,
    },
  });
