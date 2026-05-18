import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useTranslation } from '../../src/contexts/LanguageContext';
import { FontSize, Spacing } from '../../src/constants/theme';

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: Spacing.lg }}>
        <Text style={{ fontSize: FontSize.xl, fontWeight: '700', color: colors.text }}>
          {t('challenges.title')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
