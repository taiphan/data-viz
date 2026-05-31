'use client';

import { useState } from 'react';
import { useLocaleInfo } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale, allLocales } = useLocaleInfo();
  const [open, setOpen] = useState(false);

  const current = allLocales.find((l) => l.id === locale) ?? allLocales[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        aria-label="Change language"
        aria-expanded={open}
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline">{current.flag}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border bg-popover p-1.5 shadow-lg">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Language
            </p>
            {allLocales.map(({ id, label, flag }) => (
              <button
                key={id}
                onClick={() => {
                  setLocale(id as Locale);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer ${
                  locale === id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-popover-foreground hover:bg-accent/50'
                }`}
              >
                <span>{flag}</span>
                <span>{label}</span>
                {locale === id && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
