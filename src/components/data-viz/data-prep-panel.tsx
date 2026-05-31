'use client';

import { useState } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import { TransformStep, FilterOperator } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wrench, Plus, X, Eye, EyeOff, Calculator, ArrowUpDown, Pencil } from 'lucide-react';

export function DataPrepPanel() {
  const { workbook, addTransform, removeTransform, toggleTransform } = useWorkbookStore();
  const activeDs = workbook.dataSources.find((d) => d.id === workbook.activeDataSourceId);
  const [showForm, setShowForm] = useState(false);
  const [stepType, setStepType] = useState<TransformStep['type']>('calculated');

  // Form state
  const [calcName, setCalcName] = useState('');
  const [calcFormula, setCalcFormula] = useState('');
  const [renameField, setRenameField] = useState('');
  const [renameNew, setRenameNew] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  if (!activeDs) return null;

  const handleAdd = () => {
    let config: Record<string, unknown> = {};

    switch (stepType) {
      case 'calculated':
        if (!calcName || !calcFormula) return;
        config = { name: calcName, formula: calcFormula };
        break;
      case 'rename':
        if (!renameField || !renameNew) return;
        config = { field: renameField, newName: renameNew };
        break;
      case 'sort':
        if (!sortField) return;
        config = { field: sortField, order: sortOrder };
        break;
      default:
        return;
    }

    addTransform({
      id: generateId(),
      type: stepType,
      config,
      enabled: true,
    });

    // Reset
    setShowForm(false);
    setCalcName('');
    setCalcFormula('');
    setRenameField('');
    setRenameNew('');
  };

  return (
    <div className="border-t bg-muted/20">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Data Prep
          </span>
          {workbook.transforms.length > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">
              {workbook.transforms.length}
            </Badge>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {showForm && (
        <div className="border-t px-3 py-2 space-y-2">
          <div className="flex gap-1">
            {(['calculated', 'rename', 'sort'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setStepType(t)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                  stepType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {t === 'calculated' ? 'Calculate' : t === 'rename' ? 'Rename' : 'Sort'}
              </button>
            ))}
          </div>

          {stepType === 'calculated' && (
            <div className="space-y-1.5">
              <Input value={calcName} onChange={(e) => setCalcName(e.target.value)} placeholder="Field name" className="h-7 text-xs" />
              <Input value={calcFormula} onChange={(e) => setCalcFormula(e.target.value)} placeholder="Formula: sales - cost" className="h-7 text-xs font-mono" />
              <p className="text-[9px] text-muted-foreground">Use field names with +, -, *, /</p>
            </div>
          )}

          {stepType === 'rename' && (
            <div className="space-y-1.5">
              <select value={renameField} onChange={(e) => setRenameField(e.target.value)} className="w-full rounded border px-2 py-1 text-xs bg-background">
                <option value="">Select field...</option>
                {activeDs.fields.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
              <Input value={renameNew} onChange={(e) => setRenameNew(e.target.value)} placeholder="New name" className="h-7 text-xs" />
            </div>
          )}

          {stepType === 'sort' && (
            <div className="flex gap-1.5">
              <select value={sortField} onChange={(e) => setSortField(e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs bg-background">
                <option value="">Select field...</option>
                {activeDs.fields.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} className="rounded border px-2 py-1 text-xs bg-background">
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </div>
          )}

          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[10px] cursor-pointer" onClick={handleAdd}>Add Step</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px] cursor-pointer" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Transform steps list */}
      {workbook.transforms.length > 0 && (
        <div className="border-t px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {workbook.transforms.map((step) => (
              <Badge
                key={step.id}
                variant={step.enabled ? 'secondary' : 'outline'}
                className="text-[9px] gap-1 cursor-pointer"
              >
                {step.type === 'calculated' && <Calculator className="h-2.5 w-2.5" />}
                {step.type === 'rename' && <Pencil className="h-2.5 w-2.5" />}
                {step.type === 'sort' && <ArrowUpDown className="h-2.5 w-2.5" />}
                {step.type}: {String((step.config as Record<string, unknown>).name || (step.config as Record<string, unknown>).field || '')}
                <button onClick={() => toggleTransform(step.id)} className="cursor-pointer">
                  {step.enabled ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                </button>
                <button onClick={() => removeTransform(step.id)} className="cursor-pointer hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
