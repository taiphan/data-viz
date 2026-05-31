'use client';

import { useWorkbookStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Plus, X, LayoutGrid } from 'lucide-react';

export function SheetTabs() {
  const { workbook, setActiveSheet, addSheet, removeSheet } = useWorkbookStore();

  return (
    <div className="flex items-center gap-1.5 border-t bg-card/50 backdrop-blur-sm px-3 py-1.5">
      <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <div className="flex items-center gap-1 overflow-x-auto">
        {workbook.sheets.map((sheet) => {
          const isActive = sheet.id === workbook.activeSheetId;
          return (
            <div
              key={sheet.id}
              className={`
                group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium
                cursor-pointer transition-all duration-200
                ${isActive
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
              onClick={() => setActiveSheet(sheet.id)}
            >
              <span>{sheet.title}</span>
              <span className={`text-[10px] ${isActive ? 'text-primary/60' : 'text-muted-foreground/60'}`}>
                {sheet.charts.length} {sheet.charts.length === 1 ? 'chart' : 'charts'}
              </span>
              {workbook.sheets.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeSheet(sheet.id); }}
                  className="hidden cursor-pointer rounded p-0.5 hover:text-destructive hover:bg-destructive/10 group-hover:block transition-colors"
                  aria-label={`Remove ${sheet.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="cursor-pointer text-muted-foreground hover:text-primary shrink-0"
        onClick={addSheet}
        aria-label="Add sheet"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
        <span className="hidden sm:inline opacity-60">{workbook.name}</span>
      </div>
    </div>
  );
}
