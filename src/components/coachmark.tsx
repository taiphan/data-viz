'use client';

import { useState, useEffect } from 'react';
import { useCoachmarkStore, CoachmarkId } from '@/lib/coachmark-store';
import { useAuthStore } from '@/lib/auth-store';
import { useGuideStore } from '@/lib/guide-store';
import { useT } from '@/lib/i18n';
import { Lightbulb, X } from 'lucide-react';

interface Props {
  id: CoachmarkId;
  title: string;
  description: string;
  /** Position relative to the parent (which must be position: relative) */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** Only show after the role guide is fully completed/dismissed */
  requireGuideCompleted?: boolean;
}

const POSITION_STYLES: Record<string, string> = {
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  right: 'left-full ml-2 top-1/2 -translate-y-1/2',
};

const ARROW_STYLES: Record<string, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-card border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-card border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-card border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-card border-y-transparent border-l-transparent',
};

export function Coachmark({
  id,
  title,
  description,
  position = 'bottom',
  delay = 800,
  requireGuideCompleted = true,
}: Props) {
  const { isDismissed, dismiss } = useCoachmarkStore();
  const { user } = useAuthStore();
  const { hasSeen, isOpen: guideOpen } = useGuideStore();
  const t = useT();
  const [visible, setVisible] = useState(false);

  const dismissed = isDismissed(id);
  const guideCompleted = user ? hasSeen(user.id) : false;

  useEffect(() => {
    if (dismissed) return;
    if (requireGuideCompleted && (!guideCompleted || guideOpen)) return;

    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [dismissed, guideCompleted, guideOpen, delay, requireGuideCompleted]);

  if (dismissed || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    dismiss(id);
  };

  return (
    <div
      className={`absolute z-30 ${POSITION_STYLES[position]} animate-in fade-in slide-in-from-top-1 duration-300 pointer-events-auto`}
    >
      {/* Arrow */}
      <span
        className={`absolute h-0 w-0 border-[6px] ${ARROW_STYLES[position]}`}
      />

      {/* Card */}
      <div className="w-64 rounded-lg border bg-card shadow-xl shadow-primary/10 ring-1 ring-primary/20 overflow-hidden">
        <div className="flex items-start gap-2 p-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-tight">{title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {description}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Dismiss tip"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="block w-full border-t border-border/50 bg-muted/30 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          {t('coachmark.gotIt')}
        </button>
      </div>
    </div>
  );
}
