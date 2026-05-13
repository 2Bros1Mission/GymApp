import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useTheme } from '../../src/contexts/ThemeContext';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'space-between',
    paddingBottom: Spacing.xl,
  },
  contentWide: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginTop: Spacing.xxl * 2,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryDark + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: FontSize.lg,
    color: colors.primary,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  description: {
    fontSize: FontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  features: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  featureText: {
    fontSize: FontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  buttons: {
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, isWide && styles.contentWide]}>
        <View style={styles.heroSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="barbell" size={64} color={colors.primary} />
          </View>
          <Text style={styles.title}>GymApp</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
          <Text style={styles.description}>{t('auth.welcomeDesc')}</Text>
        </View>

        <View style={styles.features}>
          <View style={styles.featureRow}>
            <Ionicons name="barbell-outline" size={22} color={colors.accent} />
            <Text style={styles.featureText}>{t('auth.featurePrograms')}</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="stats-chart-outline" size={22} color={colors.accent} />
            <Text style={styles.featureText}>{t('auth.featureProgress')}</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="people-outline" size={22} color={colors.accent} />
            <Text style={styles.featureText}>{t('auth.featureTrainer')}</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.primaryButtonText}>{t('auth.createAccount')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.secondaryButtonText}>{t('auth.haveAccount')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
