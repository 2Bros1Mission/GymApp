import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
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
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.text, marginBottom: Spacing.md, marginTop: Spacing.lg },
  faqCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, overflow: 'hidden' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  faqQuestion: { fontSize: FontSize.md, fontWeight: '600', color: colors.text, flex: 1, marginRight: Spacing.sm },
  faqAnswer: { fontSize: FontSize.sm, color: colors.textSecondary, lineHeight: 22, padding: Spacing.md, paddingTop: 0 },
  contactCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.lg, marginTop: Spacing.md, alignItems: 'center', gap: Spacing.sm },
  contactIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryDark + '30', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  contactDesc: { fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  contactEmail: { fontSize: FontSize.md, fontWeight: '700', color: colors.primary },
  versionCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  versionLabel: { fontSize: FontSize.sm, color: colors.textSecondary },
  versionValue: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
});

const FAQ_KEYS = [1, 2, 3, 4, 5] as const;

export default function HelpScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breakpoint = useBreakpoint();
  const isWide = breakpoint !== 'sm';

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

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
          <Text style={styles.title}>{t('help.title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.sectionTitle}>{t('help.faqTitle')}</Text>

        {FAQ_KEYS.map((key, index) => (
          <Pressable key={key} style={styles.faqCard} onPress={() => toggleFaq(index)}>
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{t(`help.faq${key}q`)}</Text>
              <Ionicons
                name={expandedIndex === index ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textMuted}
              />
            </View>
            {expandedIndex === index && (
              <Text style={styles.faqAnswer}>{t(`help.faq${key}a`)}</Text>
            )}
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>{t('help.contactTitle')}</Text>

        <View style={styles.contactCard}>
          <View style={styles.contactIcon}>
            <Ionicons name="mail" size={28} color={colors.primary} />
          </View>
          <Text style={styles.contactDesc}>{t('help.contactDesc')}</Text>
          <Text style={styles.contactEmail}>{t('help.contactEmail')}</Text>
        </View>

        <View style={styles.versionCard}>
          <Text style={styles.versionLabel}>{t('help.versionLabel')}</Text>
          <Text style={styles.versionValue}>1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
