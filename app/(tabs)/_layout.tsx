import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize } from '../../src/constants/theme';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { Sidebar } from '../../src/components/Sidebar';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint === 'lg';
  const { colors } = useTheme();
  const { profile } = useAuth();

  const isTrainer = profile?.role === 'trainer';

  return (
    <View style={styles.root}>
      {isDesktop && <Sidebar />}
      <View style={[styles.content, isDesktop && styles.contentDesktop]}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: isDesktop
              ? { display: 'none' }
              : {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                  height: 85,
                  paddingBottom: 25,
                  paddingTop: 8,
                },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: {
              fontSize: FontSize.xs,
              fontWeight: '600',
            },
          }}
        >
          {/* Client tabs */}
          <Tabs.Screen
            name="index"
            options={{
              title: t('tab.home'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
              href: isTrainer ? null : '/(tabs)',
            }}
          />
          <Tabs.Screen
            name="workouts"
            options={{
              title: t('tab.workouts'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="barbell" size={size} color={color} />
              ),
              href: isTrainer ? null : '/(tabs)/workouts',
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: t('tab.progress'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="stats-chart" size={size} color={color} />
              ),
              href: isTrainer ? null : '/(tabs)/progress',
            }}
          />

          {/* Trainer tabs */}
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t('tab.dashboard'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="grid" size={size} color={color} />
              ),
              href: isTrainer ? '/(tabs)/dashboard' : null,
            }}
          />

          {/* Shared */}
          <Tabs.Screen
            name="profile"
            options={{
              title: t('tab.profile'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="person" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
  contentDesktop: {
    // Content takes remaining space next to sidebar
  },
});
