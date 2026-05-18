import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { ColorPalette, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useTranslation } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  route: string;
  segment: string;
  labelKey: string;
  icon: IoniconsName;
  iconActive: IoniconsName;
}

const CLIENT_NAV_ITEMS: NavItem[] = [
  { route: '/(tabs)', segment: 'index', labelKey: 'tab.home', icon: 'home-outline', iconActive: 'home' },
  { route: '/(tabs)/workouts', segment: 'workouts', labelKey: 'tab.workouts', icon: 'barbell-outline', iconActive: 'barbell' },
  { route: '/(tabs)/progress', segment: 'progress', labelKey: 'tab.progress', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { route: '/conversations', segment: 'conversations', labelKey: 'tab.messages', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { route: '/(tabs)/challenges', segment: 'challenges', labelKey: 'tab.challenges', icon: 'trophy-outline', iconActive: 'trophy' },
  { route: '/(tabs)/profile', segment: 'profile', labelKey: 'tab.profile', icon: 'person-outline', iconActive: 'person' },
];

const TRAINER_NAV_ITEMS: NavItem[] = [
  { route: '/(tabs)/dashboard', segment: 'dashboard', labelKey: 'tab.dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { route: '/conversations', segment: 'conversations', labelKey: 'tab.messages', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { route: '/(tabs)/challenges', segment: 'challenges', labelKey: 'tab.challenges', icon: 'trophy-outline', iconActive: 'trophy' },
  { route: '/(tabs)/profile', segment: 'profile', labelKey: 'tab.profile', icon: 'person-outline', iconActive: 'person' },
];

export const SIDEBAR_WIDTH = 240;

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    justifyContent: 'flex-start',
    height: '100%',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: Spacing.lg,
  },
  logoText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  navSection: {
    flex: 1,
    gap: Spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  navItemActive: {
    backgroundColor: colors.primaryDark,
  },
  navLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: colors.textMuted,
  },
  navLabelActive: {
    color: colors.white,
    fontWeight: '600',
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  profileRole: {
    fontSize: FontSize.xs,
    color: colors.textSecondary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  logoutText: {
    fontSize: FontSize.sm,
    color: colors.error,
    fontWeight: '500',
  },
});

export function Sidebar() {
  const router = useRouter();
  const segments = useSegments();
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activeSegment = (segments as string[])[1] ?? 'index';
  const isTrainer = profile?.role === 'trainer';
  const navItems = isTrainer ? TRAINER_NAV_ITEMS : CLIENT_NAV_ITEMS;

  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <Ionicons name="fitness" size={32} color={colors.primary} />
        <Text style={styles.logoText}>GymApp</Text>
      </View>

      <View style={styles.navSection}>
        {navItems.map((item) => {
          const isActive = activeSegment === item.segment;
          return (
            <Pressable
              key={item.segment}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons
                name={isActive ? item.iconActive : item.icon}
                size={22}
                color={isActive ? colors.white : colors.textMuted}
              />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bottomSection}>
        <Pressable style={styles.profileRow} onPress={() => router.push('/(tabs)/profile' as any)}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color={colors.white} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile?.name ?? '—'}
            </Text>
            <Text style={styles.profileRole}>
              {profile?.role === 'trainer' ? t('role.trainer') : t('role.client')}
            </Text>
          </View>
        </Pressable>

        <Pressable style={styles.logoutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
