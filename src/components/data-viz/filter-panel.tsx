'use client';

import { useState } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { generateId, getUniqueValues } from '@/lib/data-engine';
import { ChartFilter, FILTER_OPERATOR_LABELS, FilterOperator } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, Plus, X, Eye, EyeOff } from 'lucide-react';

export function FilterPanel() {
  const { workbook, getActiveChart, addChartFilter, removeChartFilter, toggleChartFilter } = useWorkbookStore();
  const t = useT();
  const activeDs = workbook.dataSources.find((d) => d.id === workbook.activeDataSourceId);
  const activeChart = getActiveChart();
  const [isAdding, setIsAdding] = useState(false);
  const [newField, setNewField] = useState('');
  const [newOperator, setNewOperator] = useState<FilterOperator>('equals');
  const [newValue, setNewValue] = useState('');

  if (!activeDs || !activeChart) return null;

  const handleAdd = () => {
    if (!newField || !newValue) return;
    const filter: ChartFilter = {
      id: generateId(),
      field: newField,
      operator: newOperator,
      values: newValue.split(',').map((v) => v.trim()),
      enabled: true,
    };
    addChartFilter(activeChart.id, filter);
    setIsAdding(false);
    setNewField('');
    setNewValue('');
  };

  return (
    <div className="flex h-full flex-col border-l bg-card/30 w-60">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
          <h2 className="text-xs font-semibold text-foreground">
            {t('filters.title')}
          </h2>
          {activeChart.filters.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {activeChart.filters.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="cursor-pointer rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title={t('filters.addFilter')}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {/* Add filter form */}
          {isAdding && (
            <div className="rounded-md border bg-background p-2 space-y-1.5">
              <select
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs bg-background"
              >
                <option value="">{t('filters.selectField')}</option>
                {activeDs.fields.map((f) => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
              </select>
              <select
                value={newOperator}
                onChange={(e) => setNewOperator(e.target.value as FilterOperator)}
                className="w-full rounded border px-2 py-1 text-xs bg-background"
              >
                {Object.entries(FILTER_OPERATOR_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={t('filters.valuePlaceholder')}
                className="h-7 text-xs"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] flex-1 cursor-pointer" onClick={handleAdd}>
                  {t('filters.add')}
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] cursor-pointer" onClick={() => setIsAdding(false)}>
                  {t('filters.cancel')}
                </Button>
              </div>
            </div>
          )}

          {/* Active filters */}
          {activeChart.filters.length === 0 && !isAdding && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              {t('filters.noFilters')}
            </p>
          )}

          {activeChart.filters.map((filter) => (
            <div
              key={filter.id}
              className={`rounded border p-1.5 text-[10px] space-y-0.5 ${
                filter.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{filter.field}</span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => toggleChartFilter(activeChart.id, filter.id)}
                    className="cursor-pointer p-0.5 text-muted-foreground hover:text-foreground"
                    title={filter.enabled ? t('filters.disable') : t('filters.enable')}
                  >
                    {filter.enabled ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                  </button>
                  <button
                    onClick={() => removeChartFilter(activeChart.id, filter.id)}
                    className="cursor-pointer p-0.5 text-muted-foreground hover:text-destructive"
                    title={t('filters.remove')}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              <div className="text-muted-foreground">
                {FILTER_OPERATOR_LABELS[filter.operator]}: {filter.values.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
