import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { translations } from '../constants/i18n';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

type Language = 'bg' | 'en';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageState | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile, user, refreshProfile } = useAuth();
  const [language, setLanguageState] = useState<Language>(profile?.language ?? 'bg');

  // Sync language from profile when it changes
  useEffect(() => {
    if (profile?.language) {
      setLanguageState(profile.language);
    }
  }, [profile?.language]);

  // Update language in state + persist to Supabase
  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);

    if (user) {
      await supabase
        .from('profiles')
        .update({ language: lang })
        .eq('id', user.id);

      await refreshProfile();
    }
  }, [user, refreshProfile]);

  // Reactive translation function — bound to current language
  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let value = translations[language]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replaceAll(`{${k}}`, v);
      }
    }
    return value;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

/**
 * Convenience hook that returns just the translation function and language.
 * Usage: const { t, language } = useTranslation();
 */
export function useTranslation() {
  const { t, language } = useLanguage();
  return { t, language };
}
