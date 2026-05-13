import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { t } from '../constants/i18n';
import { useAuth } from '../contexts/AuthContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  route: string;
  segment: string;
  labelKey: string;
  icon: IoniconsName;
  iconActive: IoniconsName;
}

const NAV_ITEMS: NavItem[] = [
  { route: '/(tabs)', segment: 'index', labelKey: 'tab.home', icon: 'home-outline', iconActive: 'home' },
  { route: '/(tabs)/workouts', segment: 'workouts', labelKey: 'tab.workouts', icon: 'barbell-outline', iconActive: 'barbell' },
  { route: '/(tabs)/progress', segment: 'progress', labelKey: 'tab.progress', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { route: '/(tabs)/profile', segment: 'profile', labelKey: 'tab.profile', icon: 'person-outline', iconActive: 'person' },
];

export const SIDEBAR_WIDTH = 240;

export function Sidebar() {
  const router = useRouter();
  const segments = useSegments();
  const { profile, signOut } = useAuth();

  // The active tab segment is typically segments[1] inside (tabs)
  const activeSegment = segments[1] ?? 'index';

  return (
    <View style={styles.container}>
      {/* Logo / App Name */}
      <View style={styles.logoSection}>
        <Ionicons name="fitness" size={32} color={Colors.primary} />
        <Text style={styles.logoText}>GymApp</Text>
      </View>

      {/* Navigation Items */}
      <View style={styles.navSection}>
        {NAV_ITEMS.map((item) => {
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
                color={isActive ? Colors.white : Colors.textMuted}
              />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom: Profile + Logout */}
      <View style={styles.bottomSection}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color={Colors.white} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile?.name ?? '—'}
            </Text>
            <Text style={styles.profileRole}>
              {profile?.role === 'trainer' ? 'Треньор' : 'Клиент'}
            </Text>
          </View>
        </View>

        <Pressable style={styles.logoutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
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
    borderBottomColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  logoText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.white,
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
    backgroundColor: Colors.primaryDark,
  },
  navLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  navLabelActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.white,
  },
  profileRole: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
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
    color: Colors.error,
    fontWeight: '500',
  },
});
