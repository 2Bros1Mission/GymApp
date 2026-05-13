import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { Sidebar, SIDEBAR_WIDTH } from '../../src/components/Sidebar';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

export default function TabLayout() {
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint === 'lg';

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
                  backgroundColor: Colors.surface,
                  borderTopColor: Colors.border,
                  borderTopWidth: 1,
                  height: 85,
                  paddingBottom: 25,
                  paddingTop: 8,
                },
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarLabelStyle: {
              fontSize: FontSize.xs,
              fontWeight: '600',
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t('tab.home'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="workouts"
            options={{
              title: t('tab.workouts'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="barbell" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: t('tab.progress'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                <Ionicons name="stats-chart" size={size} color={color} />
              ),
            }}
          />
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
