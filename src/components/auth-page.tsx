'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuthStore, DEMO_USERS, DemoUser } from '@/lib/auth-store';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { LanguageSwitcher } from '@/components/language-switcher';
import {
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  Shield,
  LineChart,
  BookOpen,
  Sparkles,
  Database,
  Zap,
  Activity,
} from 'lucide-react';

const ROLE_META: Record<
  string,
  { icon: React.ElementType; bg: string; text: string; ring: string }
> = {
  admin: {
    icon: Shield,
    bg: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500/20',
  },
  analyst: {
    icon: LineChart,
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-500/20',
  },
  viewer: {
    icon: BookOpen,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/20',
  },
};

const FEATURE_ICONS = [BarChart3, Database, Zap, Activity];

export function AuthPage() {
  const { login, loginAsDemo, isLoading, error, clearError } = useAuthStore();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [showManualLogin, clearError]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await login(username, password);
    },
    [username, password, login],
  );

  const handleDemoLogin = (user: DemoUser) => {
    loginAsDemo(user);
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Decorative gradient mesh background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Theme & Language switcher */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-1 rounded-full border bg-background/80 backdrop-blur-md p-1 shadow-sm">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>

      {/* ============================================== */}
      {/* Left panel — premium branding                  */}
      {/* ============================================== */}
      <div className="relative hidden lg:flex lg:w-[48%] flex-col justify-between p-12 overflow-hidden">
        {/* Gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/85" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.08) 0%, transparent 50%)',
          }}
        />

        {/* Floating chart preview decoration */}
        <div
          aria-hidden="true"
          className="absolute -right-20 top-1/4 opacity-10 rotate-12"
        >
          <svg width="320" height="240" viewBox="0 0 320 240" className="text-primary-foreground">
            <rect x="20" y="120" width="32" height="100" rx="3" fill="currentColor" opacity="0.6" />
            <rect x="62" y="80" width="32" height="140" rx="3" fill="currentColor" opacity="0.7" />
            <rect x="104" y="40" width="32" height="180" rx="3" fill="currentColor" opacity="0.8" />
            <rect x="146" y="100" width="32" height="120" rx="3" fill="currentColor" opacity="0.7" />
            <rect x="188" y="60" width="32" height="160" rx="3" fill="currentColor" opacity="0.9" />
            <rect x="230" y="20" width="32" height="200" rx="3" fill="currentColor" opacity="1" />
            <path
              d="M 36 130 Q 80 90, 120 50 T 220 70"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              opacity="0.5"
              strokeDasharray="4 4"
            />
          </svg>
        </div>

        {/* Content layer */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/10 backdrop-blur-sm ring-1 ring-primary-foreground/20 shadow-lg shadow-black/10">
              <BarChart3 className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-primary-foreground">Data Viz</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-medium text-primary-foreground/80">
                <Sparkles className="h-2.5 w-2.5" />
                v1.1
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 backdrop-blur-sm px-3 py-1 text-[11px] font-medium text-primary-foreground/90">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live demo · No signup required
            </div>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight whitespace-pre-line text-primary-foreground">
              {t('auth.welcomeTitle')}
            </h1>
            <p className="text-base text-primary-foreground/75 max-w-md leading-relaxed">
              {t('auth.welcomeSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { label: t('auth.chartTypes'), desc: t('auth.chartTypesDesc') },
              { label: t('auth.connectors'), desc: t('auth.connectorsDesc') },
              { label: t('auth.filters'), desc: t('auth.filtersDesc') },
              { label: t('auth.aiInsights'), desc: t('auth.aiInsightsDesc') },
            ].map((feature, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <div
                  key={feature.label}
                  className="group rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-3.5 backdrop-blur-sm transition-all hover:bg-primary-foreground/10 hover:border-primary-foreground/25"
                >
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
                    <Icon className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                  <p className="text-sm font-semibold text-primary-foreground">{feature.label}</p>
                  <p className="text-[11px] text-primary-foreground/60 mt-0.5 leading-snug">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-[11px] text-primary-foreground/50">
          <span>© 2026 Data Viz</span>
          <span className="h-3 w-px bg-primary-foreground/20" />
          <span>Open-source analytics</span>
          <span className="h-3 w-px bg-primary-foreground/20" />
          <span>MIT License</span>
        </div>
      </div>

      {/* ============================================== */}
      {/* Right panel — auth                             */}
      {/* ============================================== */}
      <div className="relative flex w-full lg:w-[52%] flex-col items-center justify-center px-6 py-16 lg:py-12 overflow-y-auto">
        <div className="w-full max-w-md space-y-7">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
              <BarChart3 className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">Data Viz</span>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              {t('auth.chooseAccount')}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('auth.pickUserDescription')}
            </p>
          </div>

          {/* Demo user cards */}
          <div className="space-y-2">
            {DEMO_USERS.map((demoUser) => {
              const meta = ROLE_META[demoUser.role] || ROLE_META.viewer;
              const RoleIcon = meta.icon;
              const isHovered = hoveredUser === demoUser.id;

              return (
                <button
                  key={demoUser.id}
                  onClick={() => handleDemoLogin(demoUser)}
                  onMouseEnter={() => setHoveredUser(demoUser.id)}
                  onMouseLeave={() => setHoveredUser(null)}
                  disabled={isLoading}
                  className="group relative w-full overflow-hidden rounded-xl border bg-card p-3.5 text-left transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* Hover gradient accent */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 ${
                      isHovered ? 'opacity-100' : ''
                    }`}
                  />

                  <div className="relative flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl ring-2 transition-all ${
                        isHovered ? 'ring-primary/30 scale-105' : 'ring-transparent'
                      }`}
                    >
                      {demoUser.avatar}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight truncate">
                          {demoUser.displayName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}
                        >
                          <RoleIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
                          {demoUser.role}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {demoUser.description}
                      </p>
                    </div>

                    {/* Credentials hint (compact) */}
                    <div className="hidden md:flex flex-col items-end shrink-0 gap-0.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {demoUser.username}
                      </code>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {demoUser.password}
                      </code>
                    </div>

                    {/* Arrow */}
                    <ArrowRight
                      className={`h-4 w-4 shrink-0 transition-all duration-200 ${
                        isHovered
                          ? 'text-primary translate-x-0.5'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <button
                onClick={() => setShowManualLogin(!showManualLogin)}
                className="bg-background px-3 py-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-full"
              >
                {showManualLogin ? t('auth.hideManualLogin') : t('auth.orSignInManually')}
              </button>
            </div>
          </div>

          {/* Manual login form */}
          {showManualLogin && (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">
                  {t('auth.username')}
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={t('auth.enterUsername')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t('auth.password')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.enterPassword')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 cursor-pointer gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
                disabled={isLoading || !username.trim() || !password}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t('auth.signIn')}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Footer hint */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {t('auth.demoDeployment')}
          </div>
        </div>
      </div>
    </div>
  );
}
