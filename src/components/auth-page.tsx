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
  Users,
  Shield,
  LineChart,
  BookOpen,
} from 'lucide-react';

const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Shield,
  analyst: LineChart,
  viewer: BookOpen,
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  analyst: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  viewer: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
};

export function AuthPage() {
  const { login, loginAsDemo, isLoading, error, clearError } = useAuthStore();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showManualLogin, setShowManualLogin] = useState(false);

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
    <div className="relative flex min-h-screen">
      {/* Theme & Language switcher */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/10">
            <BarChart3 className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Data Viz</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight whitespace-pre-line">
            {t('auth.welcomeTitle')}
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-md">
            {t('auth.welcomeSubtitle')}
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: t('auth.chartTypes'), desc: t('auth.chartTypesDesc') },
              { label: t('auth.connectors'), desc: t('auth.connectorsDesc') },
              { label: t('auth.filters'), desc: t('auth.filtersDesc') },
              { label: t('auth.aiInsights'), desc: t('auth.aiInsightsDesc') },
            ].map((feature) => (
              <div
                key={feature.label}
                className="rounded-lg bg-primary-foreground/5 p-3 border border-primary-foreground/10"
              >
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-primary-foreground/60">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-primary-foreground/40">
          © 2026 Data Viz. Open-source analytics platform.
        </p>
      </div>

      {/* Right panel — auth */}
      <div className="flex w-full lg:w-[55%] flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Data Viz</span>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('auth.chooseAccount')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('auth.pickUserDescription')}
            </p>
          </div>

          {/* Demo user cards */}
          <div className="space-y-2">
            {DEMO_USERS.map((demoUser) => {
              const RoleIcon = ROLE_ICONS[demoUser.role] || Users;
              const roleColor = ROLE_COLORS[demoUser.role] || '';

              return (
                <button
                  key={demoUser.id}
                  onClick={() => handleDemoLogin(demoUser)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm active:scale-[0.99] cursor-pointer disabled:opacity-50"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg shrink-0">
                    {demoUser.avatar}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {demoUser.displayName}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${roleColor}`}>
                        <RoleIcon className="h-3 w-3" />
                        {demoUser.role}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {demoUser.description}
                    </p>
                  </div>

                  {/* Credentials hint */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {demoUser.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {demoUser.password}
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
                className="bg-background px-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showManualLogin ? t('auth.hideManualLogin') : t('auth.orSignInManually')}
              </button>
            </div>
          </div>

          {/* Manual login form (collapsed by default) */}
          {showManualLogin && (
            <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                  className="h-10"
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
                    className="h-10 pr-10"
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
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-10 cursor-pointer gap-2"
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
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.demoDeployment')}
          </p>
        </div>
      </div>
    </div>
  );
}
