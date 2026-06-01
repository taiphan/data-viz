'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGuideStore } from '@/lib/guide-store';
import { useT } from '@/lib/i18n';
import { Keyboard, X } from 'lucide-react';

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const META_KEY = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  labelKey: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['?'], labelKey: 'shortcuts.openHelp' },
  { keys: ['G'], labelKey: 'shortcuts.openGuide' },
  { keys: [META_KEY, 'K'], labelKey: 'shortcuts.openSearch' },
  { keys: [META_KEY, 'B'], labelKey: 'shortcuts.toggleTheme' },
  { keys: [META_KEY, 'N'], labelKey: 'shortcuts.addChart' },
  { keys: [META_KEY, 'D'], labelKey: 'shortcuts.duplicateChart' },
  { keys: [META_KEY, '⌫'], labelKey: 'shortcuts.removeChart' },
  { keys: ['Esc'], labelKey: 'shortcuts.escape' },
];

/**
 * Global keyboard shortcuts handler + help dialog.
 * Mount once in the app.
 */
export function KeyboardShortcuts() {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const openGuide = useGuideStore((s) => s.openGuide);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // ? - show help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      // G - open onboarding guide
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openGuide();
        return;
      }

      // Cmd/Ctrl + B - toggle theme
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        const html = document.documentElement;
        const isDark = html.classList.contains('dark') || html.classList.contains('high-contrast');
        // Trigger via next-themes if available
        const event = new CustomEvent('toggle-theme', { detail: { isDark } });
        window.dispatchEvent(event);
        return;
      }

      // Esc - close help
      if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    },
    [openGuide],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!helpOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setHelpOpen(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 p-5 pb-4 border-b">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold tracking-tight flex-1">
              {t('shortcuts.title')}
            </h2>
            <button
              onClick={() => setHelpOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-2">
            {SHORTCUTS.map(({ keys, labelKey }) => (
              <div
                key={labelKey}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm text-foreground">{t(labelKey)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {keys.map((key, idx) => (
                    <span key={idx} className="flex items-center gap-1">
                      {idx > 0 && <span className="text-muted-foreground text-xs">+</span>}
                      <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Press{' '}
              <kbd className="inline-flex h-5 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px]">
                ?
              </kbd>{' '}
              anytime to see this help
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
