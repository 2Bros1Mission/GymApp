// Shared semantic colors (same in both themes)
const semanticColors = {
  primary: '#4F46E5',
  primaryLight: '#6366F1',
  primaryDark: '#3730A3',
  accent: '#F59E0B',
  accentLight: '#FBBF24',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent' as const,
};

export const darkColors = {
  ...semanticColors,
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceLight: '#252542',
  card: '#1E1E35',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: '#2D2D4A',
  divider: '#252542',
};

export const lightColors = {
  ...semanticColors,
  background: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceLight: '#F0F0F5',
  card: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F3F4F6',
};

/** Union type for the full color palette (same shape for both themes) */
export type ColorPalette = typeof darkColors;

/** Default static export — dark theme (used where dynamic theming is not needed) */
export const Colors: ColorPalette = darkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};
