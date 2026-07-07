import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import { DiscoveryView } from '../../src/components/challenges/DiscoveryView';

type ChallengeTab = 'discovery' | 'myChallenges' | 'leaderboard';

const SEGMENTS: ChallengeTab[] = ['discovery', 'myChallenges', 'leaderboard'];

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  segmentTextActive: { color: colors.white },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: FontSize.md, color: colors.textSecondary },
});

export default function ChallengesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Default is Discovery (hardcoded): the "My Challenges if the user has
  // active participations" smart default belongs to #143, which owns that
  // data dependency.
  const [activeTab, setActiveTab] = useState<ChallengeTab>('discovery');

  return (
    <SafeAreaView style={styles.container}>
      <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.title}>{t('challenges.title')}</Text>
        </View>
        <View style={styles.segmentRow}>
          {SEGMENTS.map((seg) => (
            <Pressable
              key={seg}
              style={[styles.segment, activeTab === seg && styles.segmentActive]}
              onPress={() => setActiveTab(seg)}
            >
              <Text style={[styles.segmentText, activeTab === seg && styles.segmentTextActive]}>
                {t(`challenges.segment.${seg}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {activeTab === 'discovery' && <DiscoveryView />}
        {activeTab !== 'discovery' && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{t('challenges.comingSoon')}</Text>
          </View>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
