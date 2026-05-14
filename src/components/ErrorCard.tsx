import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg, backgroundColor: colors.error + '12',
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: colors.error + '25',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  textContainer: { flex: 1 },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: colors.error, marginBottom: 2 },
  message: { fontSize: FontSize.xs, color: colors.textSecondary },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: colors.error, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm,
  },
  retryBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
});

interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry: () => void;
  loading?: boolean;
}

export function ErrorCard({ title, message, onRetry, loading = false }: ErrorCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={24} color={colors.error} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title ?? t('common.error')}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      <Pressable style={styles.retryBtn} onPress={onRetry} disabled={loading}>
        <Ionicons name="refresh" size={18} color={colors.white} />
        <Text style={styles.retryBtnText}>
          {loading ? t('common.loading') : t('home.retry')}
        </Text>
      </Pressable>
    </View>
  );
}
