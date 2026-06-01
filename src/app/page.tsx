'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkbookStore } from '@/lib/store';
import { AuthPage } from '@/components/auth-page';
import { AppHeader } from '@/components/data-viz/app-header';
import { DataImport } from '@/components/data-viz/data-import';
import { FieldPanel } from '@/components/data-viz/field-panel';
import { ChartCanvas } from '@/components/data-viz/chart-canvas';
import { FilterPanel } from '@/components/data-viz/filter-panel';
import { SheetTabs } from '@/components/data-viz/sheet-tabs';
import { ParameterPanel } from '@/components/data-viz/parameter-panel';

// ============================================================
// Lazy-loaded — non-critical, deferred to reduce initial bundle
// ============================================================
const RoleGuide = dynamic(
  () => import('@/components/role-guide').then((m) => ({ default: m.RoleGuide })),
  { ssr: false },
);

const KeyboardShortcuts = dynamic(
  () => import('@/components/keyboard-shortcuts').then((m) => ({ default: m.KeyboardShortcuts })),
  { ssr: false },
);

const DataPrepPanel = dynamic(
  () =>
    import('@/components/data-viz/data-prep-panel').then((m) => ({
      default: m.DataPrepPanel,
    })),
  { ssr: false },
);

export default function DataVizPage() {
  const { user } = useAuthStore();
  const { workbook } = useWorkbookStore();

  // Show auth page if not logged in
  if (!user) {
    return <AuthPage />;
  }

  const hasData = workbook.dataSources.length > 0 && workbook.dataSources.some((d) => d.rows.length > 0);
  const hasDataMeta = workbook.dataSources.length > 0;

  // Show workspace if we have data (either in memory or metadata from persistence)
  if (!hasData && !hasDataMeta) {
    return (
      <div className="h-screen flex flex-col">
        <AppHeader />
        <DataImport />
        <RoleGuide />
        <KeyboardShortcuts />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top: App header */}
      <AppHeader />

      {/* Data source bar */}
      <DataImport />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Field panel + Data prep */}
        <aside className="flex flex-col shrink-0 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <FieldPanel />
          </div>
          <DataPrepPanel />
        </aside>

        {/* Center: Chart canvas */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <ChartCanvas />
        </main>

        {/* Right: Filter panel + Parameter panel */}
        <aside className="flex shrink-0 overflow-hidden">
          <FilterPanel />
          <ParameterPanel />
        </aside>
      </div>

      {/* Bottom: Sheet tabs */}
      <SheetTabs />

      {/* Lazy-loaded overlays */}
      <RoleGuide />
      <KeyboardShortcuts />
    </div>
  );
}
