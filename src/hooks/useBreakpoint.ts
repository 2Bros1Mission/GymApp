import { useWindowDimensions } from 'react-native';
import { Breakpoint, BREAKPOINTS } from '../constants/responsive';

/**
 * Returns the current responsive breakpoint based on window width.
 *
 * - `sm`: 0–639px (mobile)
 * - `md`: 640–1023px (tablet)
 * - `lg`: 1024px+ (desktop)
 *
 * Automatically re-renders when the window is resized.
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();

  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  return 'sm';
}
