import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { containerStyle } from '../constants/responsive';

interface ResponsiveContainerProps {
  /** Override the default max-width for the current breakpoint */
  maxWidth?: number;
  /** Additional styles applied to the container */
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * Wrapper component that centers content and constrains width
 * based on the current responsive breakpoint.
 *
 * Use this in every screen to get consistent responsive behavior:
 *
 * ```tsx
 * <ResponsiveContainer>
 *   <Text>Content is centered and constrained</Text>
 * </ResponsiveContainer>
 * ```
 */
export function ResponsiveContainer({
  maxWidth,
  style,
  children,
}: ResponsiveContainerProps) {
  const breakpoint = useBreakpoint();
  const responsive = containerStyle(breakpoint);

  return (
    <View
      style={[
        styles.container,
        responsive,
        maxWidth != null && { maxWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});
