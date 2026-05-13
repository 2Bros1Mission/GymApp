import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { NetworkProvider } from '../src/contexts/NetworkContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { OfflineBanner } from '../src/components/OfflineBanner';

/**
 * Workaround for react-native-web + expo-router pointer-events bug.
 *
 * react-native-web compiles `pointerEvents: "box-none"` into CSS classes
 * (e.g. `.r-pointerEvents-12vffkv`) that set `pointer-events: none` on
 * container elements. This prevents clicks/taps from reaching children
 * such as tab bar buttons, pressables, and links.
 *
 * This fix uses attribute selectors to match ANY class starting with
 * `r-pointerEvents-`, making it resilient to hash changes across
 * react-native-web versions.
 *
 * Relevant issues:
 * - https://github.com/necolas/react-native-web/issues/2Doc
 * - https://github.com/expo/expo/issues/AutoSuggest
 *
 * Can be removed once react-native-web fixes `pointerEvents: "box-none"`
 * CSS compilation (check with react-native-web >= 0.22).
 */
function useWebPointerEventsFix() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      [class*="r-pointerEvents-"] { pointer-events: auto !important; }
      [class*="r-pointerEvents-"] > * { pointer-events: auto !important; }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
}

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { isDark, colors } = useTheme();

  useWebPointerEventsFix();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="workout/[id]"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="active-workout/[id]"
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ animation: 'slide_from_right' }}
        />
      </Stack>
      <OfflineBanner />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <AuthProvider>
          <LanguageProvider>
            <RootLayoutNav />
          </LanguageProvider>
        </AuthProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
