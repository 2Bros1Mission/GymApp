import { ViewStyle } from 'react-native';

export type Breakpoint = 'sm' | 'md' | 'lg';

export const BREAKPOINTS = {
  sm: 0,
  md: 640,
  lg: 1024,
} as const;

export const MAX_WIDTHS: Record<Breakpoint, number | '100%'> = {
  sm: '100%',
  md: 720,
  lg: 1200,
};

/**
 * Returns a centered container style with the appropriate max-width
 * based on the current breakpoint.
 */
export function containerStyle(breakpoint: Breakpoint): ViewStyle {
  const maxWidth = MAX_WIDTHS[breakpoint];

  return {
    width: '100%',
    maxWidth: maxWidth === '100%' ? undefined : maxWidth,
    alignSelf: 'center',
  };
}
