import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTranslation } from '../src/contexts/LanguageContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useBreakpoint } from '../src/hooks/useBreakpoint';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  scrollContentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, marginBottom: Spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  lastUpdated: { fontSize: FontSize.xs, color: colors.textMuted, marginBottom: Spacing.lg, textAlign: 'center' },
  sectionCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text, marginBottom: Spacing.sm },
  sectionBody: { fontSize: FontSize.sm, color: colors.textSecondary, lineHeight: 22 },
});

const SECTIONS = [1, 2, 3, 4, 5, 6] as const;

export default function TermsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('terms.title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.lastUpdated}>{t('terms.lastUpdated')}</Text>

        {SECTIONS.map((num) => (
          <View key={num} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(`terms.section${num}title`)}</Text>
            <Text style={styles.sectionBody}>{t(`terms.section${num}body`)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
