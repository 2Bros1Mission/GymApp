import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize } from '../constants/theme';
import { useNetwork } from '../contexts/NetworkContext';
import { useTranslation } from '../contexts/LanguageContext';

export function OfflineBanner() {
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isConnected ? -60 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isConnected, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          paddingTop: insets.top + 4,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents={isConnected ? 'none' : 'auto'}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={Colors.white} />
      <Text style={styles.bannerText}>{t('network.offline')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    zIndex: 999,
  },
  bannerText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.white,
  },
});
