'use client';

import { useState } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { SAMPLE_DATASETS, buildSampleDataSource } from '@/lib/sample-data';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Loader2, Database } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  sales: 'from-emerald-500/10 to-teal-500/10 ring-emerald-500/20',
  marketing: 'from-orange-500/10 to-amber-500/10 ring-orange-500/20',
  finance: 'from-blue-500/10 to-indigo-500/10 ring-blue-500/20',
  operations: 'from-violet-500/10 to-purple-500/10 ring-violet-500/20',
};

export function SampleDataDialog({ open, onOpenChange }: Props) {
  const { addDataSource } = useWorkbookStore();
  const t = useT();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (!open) return null;

  const handleLoad = async (datasetId: string) => {
    setLoadingId(datasetId);
    // Tiny delay so the spinner is visible (sample is generated synchronously)
    await new Promise((r) => setTimeout(r, 300));

    const dataSource = buildSampleDataSource(datasetId);
    if (dataSource) {
      addDataSource(dataSource);

      // Auto-assign first dimension to X and first measure to Y
      const store = useWorkbookStore.getState();
      const activeChart = store.getActiveChart();
      if (activeChart) {
        const firstDimension = dataSource.fields.find((f) => f.role === 'dimension');
        const firstMeasure = dataSource.fields.find((f) => f.role === 'measure');
        if (firstDimension) {
          store.setEncoding(activeChart.id, 'xAxis', {
            field: firstDimension.name,
            aggregation: 'NONE',
          });
        }
        if (firstMeasure) {
          store.setEncoding(activeChart.id, 'yAxis', {
            field: firstMeasure.name,
            aggregation: 'SUM',
          });
        }
      }
    }

    setLoadingId(null);
    onOpenChange(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start gap-3 p-6 pb-4 border-b">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold tracking-tight">{t('import.sampleDataTitle')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('import.sampleDataSubtitle')}
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Datasets grid */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SAMPLE_DATASETS.map((dataset) => {
              const isLoading = loadingId === dataset.id;
              const gradient = CATEGORY_COLORS[dataset.category] || CATEGORY_COLORS.sales;

              return (
                <button
                  key={dataset.id}
                  onClick={() => handleLoad(dataset.id)}
                  disabled={loadingId !== null}
                  className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br ${gradient} p-4 text-left transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ring-1`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{dataset.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold tracking-tight truncate">
                          {dataset.name}
                        </h3>
                        {isLoading && (
                          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {dataset.description}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <Database className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {dataset.fields.length} {t('common.fields')}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {t('import.sampleDataHint')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
