'use client';

import { useAuthStore } from '@/lib/auth-store';
import { useWorkbookStore } from '@/lib/store';
import { AuthPage } from '@/components/auth-page';
import { RoleGuide } from '@/components/role-guide';
import { AppHeader } from '@/components/data-viz/app-header';
import { DataImport } from '@/components/data-viz/data-import';
import { FieldPanel } from '@/components/data-viz/field-panel';
import { ChartCanvas } from '@/components/data-viz/chart-canvas';
import { FilterPanel } from '@/components/data-viz/filter-panel';
import { SheetTabs } from '@/components/data-viz/sheet-tabs';
import { DataPrepPanel } from '@/components/data-viz/data-prep-panel';
import { ParameterPanel } from '@/components/data-viz/parameter-panel';

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

      {/* Role-based onboarding guide */}
      <RoleGuide />
    </div>
  );
}
