import type { Language } from '../contexts/LanguageContext';

const LOCALE_MAP: Record<Language, string> = {
  bg: 'bg-BG',
  en: 'en-US',
};

export function formatDate(
  date: Date | string,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE_MAP[language], options);
}
