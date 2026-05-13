import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { BorderRadius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = BorderRadius.sm, style }: SkeletonBoxProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surfaceLight,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton card that mimics a stat card */
export function SkeletonStatCard() {
  const { colors } = useTheme();
  return (
    <View style={[skeletonStyles.statCard, { backgroundColor: colors.surface, borderLeftColor: colors.surfaceLight }]}>
      <SkeletonBox width={20} height={20} borderRadius={10} />
      <SkeletonBox width={60} height={24} style={{ marginTop: Spacing.sm }} />
      <SkeletonBox width={40} height={12} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Skeleton card that mimics a workout list item */
export function SkeletonWorkoutCard() {
  const { colors } = useTheme();
  return (
    <View style={[skeletonStyles.workoutCard, { backgroundColor: colors.surface }]}>
      <SkeletonBox width={48} height={48} borderRadius={24} />
      <View style={skeletonStyles.workoutCardInfo}>
        <SkeletonBox width="70%" height={16} />
        <SkeletonBox width="50%" height={12} style={{ marginTop: 6 }} />
        <SkeletonBox width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/** Skeleton for the weekly calendar section */
export function SkeletonWeekCalendar() {
  const { colors } = useTheme();
  return (
    <View style={[skeletonStyles.weekCard, { backgroundColor: colors.surface }]}>
      <View style={skeletonStyles.weekRow}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={skeletonStyles.dayCol}>
            <SkeletonBox width={14} height={12} />
            <SkeletonBox width={36} height={36} borderRadius={18} style={{ marginTop: Spacing.sm }} />
          </View>
        ))}
      </View>
      <SkeletonBox width="60%" height={14} style={{ marginTop: Spacing.md, alignSelf: 'center' }} />
    </View>
  );
}

/** Skeleton for a history list item */
export function SkeletonHistoryItem() {
  return (
    <View style={skeletonStyles.historyItem}>
      <SkeletonBox width={10} height={10} borderRadius={5} />
      <View style={{ flex: 1 }}>
        <SkeletonBox width="60%" height={14} />
        <SkeletonBox width="40%" height={10} style={{ marginTop: 4 }} />
      </View>
      <SkeletonBox width={20} height={20} borderRadius={10} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  workoutCardInfo: {
    flex: 1,
  },
  weekCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
