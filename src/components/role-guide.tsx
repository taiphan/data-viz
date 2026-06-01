'use client';

import { useEffect } from 'react';
import { useGuideStore } from '@/lib/guide-store';
import { useAuthStore } from '@/lib/auth-store';
import { useI18nStore, useT } from '@/lib/i18n';
import { GUIDE_CONTENT } from '@/lib/guide-content';
import { Button } from '@/components/ui/button';
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Check,
} from 'lucide-react';

export function RoleGuide() {
  const { user } = useAuthStore();
  const { isOpen, currentStep, closeGuide, setStep, markSeen, hasSeen } = useGuideStore();
  const locale = useI18nStore((s) => s.locale);
  const t = useT();

  // Auto-show on first login per user
  useEffect(() => {
    if (user && !hasSeen(user.id) && !isOpen) {
      // Small delay so the workspace renders first
      const timer = setTimeout(() => {
        useGuideStore.getState().openGuide();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, hasSeen, isOpen]);

  if (!user || !isOpen) return null;

  const guide = GUIDE_CONTENT[locale]?.[user.role] ?? GUIDE_CONTENT.en[user.role] ?? GUIDE_CONTENT.en.viewer;
  const totalSteps = guide.steps.length;
  const isLastStep = currentStep === totalSteps;
  const currentStepData = currentStep < totalSteps ? guide.steps[currentStep] : null;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setStep(currentStep - 1);
  };

  const handleFinish = () => {
    markSeen(user.id);
    closeGuide();
  };

  const handleSkip = () => {
    markSeen(user.id);
    closeGuide();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border bg-card shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="relative flex items-start gap-4 p-6 pb-4 border-b">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl ring-1 ring-primary/20">
              {user.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold tracking-tight">{guide.greeting}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-primary/20">
                  <Sparkles className="h-2.5 w-2.5" />
                  {user.role}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {guide.subtitle}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1.5 px-6 pt-4">
            {Array.from({ length: totalSteps + 1 }).map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`group relative h-1.5 flex-1 rounded-full transition-all ${
                  i < currentStep
                    ? 'bg-primary'
                    : i === currentStep
                      ? 'bg-primary'
                      : 'bg-muted hover:bg-muted-foreground/30'
                }`}
                aria-label={`Step ${i + 1}`}
              >
                {i === currentStep && (
                  <span className="absolute inset-0 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* Step counter */}
          <div className="px-6 pt-3 text-xs text-muted-foreground font-medium">
            {isLastStep ? (
              <span className="text-primary">✓ {t('guide.complete')}</span>
            ) : (
              <>{t('guide.step')} {currentStep + 1} {t('guide.of')} {totalSteps}</>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 min-h-[280px]">
            {currentStepData ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                    {currentStepData.icon}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <h3 className="text-lg font-semibold tracking-tight">
                      {currentStepData.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {currentStepData.description}
                    </p>
                  </div>
                </div>

                {currentStepData.bullets && (
                  <ul className="space-y-2 pl-15">
                    {currentStepData.bullets.map((bullet, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-sm leading-relaxed"
                      >
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" strokeWidth={3} />
                        <span className="text-foreground/90">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              // Closing screen
              <div className="text-center py-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-bold tracking-tight mb-2">
                  {guide.closingTitle}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  {guide.closingMessage}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground cursor-pointer"
            >
              {t('guide.skip')}
            </Button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="cursor-pointer gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('guide.previous')}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="cursor-pointer gap-1 shadow-sm"
              >
                {isLastStep ? (
                  <>
                    {t('guide.getStarted')}
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    {currentStep === totalSteps - 1 ? t('guide.finish') : t('guide.next')}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
