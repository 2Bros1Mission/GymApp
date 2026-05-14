import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ColorPalette } from '../constants/theme';

const STORAGE_KEY = 'theme_preference';

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ColorPalette;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  toggleTheme: () => {},
  colors: darkColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Default to dark theme until AsyncStorage is checked
  const [isDark, setIsDark] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored !== null) {
        setIsDark(stored === 'dark');
      } else {
        // Use system preference as default
        setIsDark(systemScheme !== 'light');
      }
      setReady(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    await AsyncStorage.setItem(STORAGE_KEY, newIsDark ? 'dark' : 'light');
  };

  // Don't render children until preference is loaded (avoids flash)
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors: isDark ? darkColors : lightColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
