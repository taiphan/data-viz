'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  Monitor,
  Moon,
  Sun,
  SunMoon,
  Contrast,
  Waves,
  TreePine,
  Sunset,
  Stars,
  Palette,
  CreditCard,
} from 'lucide-react';

const themes = [
  { id: 'system', label: 'System', icon: Monitor, group: 'default' },
  { id: 'light', label: 'Light', icon: Sun, group: 'default' },
  { id: 'dark', label: 'Dark', icon: Moon, group: 'default' },
  { id: 'fecredit', label: 'FE CREDIT', icon: CreditCard, group: 'color' },
  { id: 'ocean', label: 'Ocean', icon: Waves, group: 'color' },
  { id: 'forest', label: 'Forest', icon: TreePine, group: 'color' },
  { id: 'sunset', label: 'Sunset', icon: Sunset, group: 'color' },
  { id: 'midnight', label: 'Midnight', icon: Stars, group: 'color' },
  { id: 'high-contrast', label: 'High Contrast', icon: Contrast, group: 'accessibility' },
  { id: 'high-contrast-light', label: 'HC Light', icon: SunMoon, group: 'accessibility' },
] as const;

const groupLabels: Record<string, string> = {
  default: 'Standard',
  color: 'Color Themes',
  accessibility: 'Accessibility',
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Toggle theme"
      >
        <Palette className="h-4 w-4" />
      </button>
    );
  }

  const current = themes.find((t) => t.id === theme) ?? themes[0];
  const CurrentIcon = current.icon;

  const groups = ['default', 'color', 'accessibility'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label="Toggle theme"
        aria-expanded={open}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border bg-popover p-1.5 shadow-lg">
            {groups.map((group, gi) => (
              <div key={group}>
                {gi > 0 && <div className="my-1 h-px bg-border" />}
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {groupLabels[group]}
                </p>
                {themes
                  .filter((t) => t.group === group)
                  .map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setTheme(id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        theme === id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-popover-foreground hover:bg-accent/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                      {theme === id && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
