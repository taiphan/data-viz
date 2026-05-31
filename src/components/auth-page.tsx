'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeSwitcher } from '@/components/theme-switcher';
import {
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Clear error when switching modes
  useEffect(() => {
    clearError();
  }, [mode, clearError]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, displayName || undefined);
      }
    },
    [mode, username, password, displayName, login, register],
  );

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setUsername('');
    setPassword('');
    setDisplayName('');
  };

  const isFormValid =
    username.trim().length >= 3 &&
    password.length >= (mode === 'register' ? 8 : 1);

  return (
    <div className="relative flex min-h-screen">
      {/* Theme switcher */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeSwitcher />
      </div>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/10">
            <BarChart3 className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Data Viz</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Self-service analytics
            <br />
            for your team.
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-md">
            Upload data, build charts, create interactive dashboards.
            Connect to 60+ data sources with enterprise-grade security.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: '14 Chart Types', desc: 'Bar, line, scatter, sankey...' },
              { label: '60+ Connectors', desc: 'Databases, APIs, cloud storage' },
              { label: 'Real-time Filters', desc: 'Interactive dashboards' },
              { label: 'AI Insights', desc: 'Auto-detect patterns' },
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

      {/* Right panel — auth form */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
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
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Sign in to access your dashboards and data.'
                : 'Get started with your analytics workspace.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name (register only) */}
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">
                  Display Name
                </Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="How should we call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  className="h-10"
                />
              </div>
            )}

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="h-10"
                minLength={3}
                maxLength={32}
              />
              {mode === 'register' && username.length > 0 && username.length < 3 && (
                <p className="text-xs text-muted-foreground">At least 3 characters</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Min. 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="h-10 pr-10"
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {mode === 'register' && password.length > 0 && password.length < 8 && (
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-10 cursor-pointer gap-2"
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          </form>

          {/* Switch mode */}
          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </span>{' '}
            <button
              onClick={switchMode}
              className="font-medium text-primary hover:underline cursor-pointer"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
