'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

export const AVAILABLE_THEMES = [
  'light',
  'dark',
  'high-contrast',
  'high-contrast-light',
  'ocean',
  'forest',
  'sunset',
  'midnight',
] as const;

export type ThemeId = (typeof AVAILABLE_THEMES)[number] | 'system';

/**
 * Theme provider that supports:
 * - system (follows OS preference)
 * - light / dark (neutral)
 * - high-contrast / high-contrast-light (accessibility)
 * - ocean (cool blue professional)
 * - forest (green nature)
 * - sunset (warm amber/orange)
 * - midnight (deep indigo)
 *
 * Applies the theme class to <html> so CSS variables switch accordingly.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={[...AVAILABLE_THEMES]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
