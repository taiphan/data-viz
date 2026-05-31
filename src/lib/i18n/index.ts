import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale, Translations } from './types';
import { en } from './en';
import { vi } from './vi';

export type { Locale, Translations };
export { en, vi };

const translations: Record<Locale, Translations> = { en, vi };

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
};

const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇺🇸',
  vi: '🇻🇳',
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'data-viz-locale' },
  ),
);

/**
 * Hook to get the current translations object.
 */
export function useTranslations(): Translations {
  const locale = useI18nStore((s) => s.locale);
  return translations[locale];
}

/**
 * Hook that returns a translation function t(key).
 * Falls back to the key itself if not found.
 */
export function useT(): (key: string) => string {
  const locale = useI18nStore((s) => s.locale);
  return (key: string): string => {
    const dict = translations[locale] as unknown as Record<string, string>;
    return dict[key] ?? key;
  };
}

/**
 * Hook to get locale metadata and switcher.
 */
export function useLocaleInfo() {
  const { locale, setLocale } = useI18nStore();
  return {
    locale,
    setLocale,
    label: LOCALE_LABELS[locale],
    flag: LOCALE_FLAGS[locale],
    allLocales: Object.entries(LOCALE_LABELS).map(([id, label]) => ({
      id: id as Locale,
      label,
      flag: LOCALE_FLAGS[id as Locale],
    })),
  };
}
