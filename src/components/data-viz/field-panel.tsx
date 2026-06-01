'use client';

import { useState, useCallback } from 'react';
import { DataField } from '@/lib/types';
import { useWorkbookStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Hash, Type, Calendar, ToggleLeft, GripVertical, Layers, BarChart3, X } from 'lucide-react';
import { CreateGroupDialog } from './create-group-dialog';
import { CreateBinDialog } from './create-bin-dialog';
import { Coachmark } from '@/components/coachmark';

const FIELD_TYPE_ICONS: Record<string, React.ElementType> = {
  number: Hash,
  string: Type,
  date: Calendar,
  boolean: ToggleLeft,
};

export function FieldPanel() {
  const { workbook, setEncoding, getActiveChart, removeGroup, removeBin } = useWorkbookStore();
  const t = useT();
  const activeDs = workbook.dataSources.find((d) => d.id === workbook.activeDataSourceId);
  const activeChart = getActiveChart();

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<DataField | null>(null);

  if (!activeDs) return null;

  const dimensions = activeDs.fields.filter((f) => f.role === 'dimension');
  const measures = activeDs.fields.filter((f) => f.role === 'measure');

  // Virtual fields from groups and bins that reference this data source's fields
  const dsFieldNames = new Set(activeDs.fields.map((f) => f.name));
  const activeGroups = workbook.groups.filter((g) => dsFieldNames.has(g.sourceField));
  const activeBins = workbook.bins.filter((b) => dsFieldNames.has(b.sourceField));

  const handleQuickAssign = (fieldName: string, target: 'xAxis' | 'yAxis' | 'color') => {
    if (!activeChart) return;
    const field = activeDs.fields.find((f) => f.name === fieldName);
    const defaultAgg = field?.role === 'measure' ? 'SUM' as const : 'NONE' as const;
    setEncoding(activeChart.id, target, { field: fieldName, aggregation: target === 'yAxis' ? defaultAgg : 'NONE' });
  };

  const handleCreateGroup = (field: DataField) => {
    setSelectedField(field);
    setGroupDialogOpen(true);
  };

  const handleCreateBin = (field: DataField) => {
    setSelectedField(field);
    setBinDialogOpen(true);
  };

  const getSampleValues = (): string[] => {
    if (!selectedField || !activeDs) return [];
    const values = new Set<string>();
    for (const row of activeDs.rows) {
      const val = row[selectedField.name];
      if (val !== null && val !== undefined) {
        values.add(String(val));
      }
      if (values.size >= 20) break;
    }
    return Array.from(values);
  };

  return (
    <div className="relative flex h-full flex-col border-r bg-card/30 w-56">
      {/* First-time hint */}
      <Coachmark
        id="field-panel-drag"
        title={t('coachmark.fieldsTitle')}
        description={t('coachmark.fieldsDesc')}
        position="right"
        delay={1200}
      />
      <div className="border-b px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-xs font-semibold text-foreground">
            {t('fields.title')}
          </h2>
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {activeDs.fields.length}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {activeDs.rowCount.toLocaleString()} {t('fields.rows')}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-3">
          {/* Dimensions */}
          <div>
            <h3 className="mb-1.5 px-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              {t('fields.dimensions')}
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">{dimensions.length}</span>
            </h3>
            <div className="space-y-0.5">
              {dimensions.map((field) => (
                <FieldItem
                  key={field.id}
                  field={field}
                  onAssign={handleQuickAssign}
                  onCreateGroup={handleCreateGroup}
                  onCreateBin={handleCreateBin}
                />
              ))}
            </div>
          </div>

          {/* Measures */}
          <div>
            <h3 className="mb-1.5 px-2 text-[11px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('fields.measures')}
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">{measures.length}</span>
            </h3>
            <div className="space-y-0.5">
              {measures.map((field) => (
                <FieldItem
                  key={field.id}
                  field={field}
                  onAssign={handleQuickAssign}
                  onCreateGroup={handleCreateGroup}
                  onCreateBin={handleCreateBin}
                />
              ))}
            </div>
          </div>

          {/* Virtual Fields (Groups & Bins) */}
          {(activeGroups.length > 0 || activeBins.length > 0) && (
            <div>
              <h3 className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                {t('fields.virtualFields')} ({activeGroups.length + activeBins.length})
              </h3>
              <div className="space-y-px">
                {activeGroups.map((group) => (
                  <VirtualFieldItem
                    key={group.id}
                    name={group.name}
                    sourceField={group.sourceField}
                    type="group"
                    onAssign={handleQuickAssign}
                    onRemove={() => removeGroup(group.id)}
                  />
                ))}
                {activeBins.map((bin) => (
                  <VirtualFieldItem
                    key={bin.id}
                    name={bin.name}
                    sourceField={bin.sourceField}
                    type="bin"
                    onAssign={handleQuickAssign}
                    onRemove={() => removeBin(bin.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <CreateGroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        field={selectedField}
        sampleValues={getSampleValues()}
      />

      <CreateBinDialog
        open={binDialogOpen}
        onOpenChange={setBinDialogOpen}
        field={selectedField}
      />
    </div>
  );
}

function FieldItem({
  field,
  onAssign,
  onCreateGroup,
  onCreateBin,
}: {
  field: DataField;
  onAssign: (field: string, target: 'xAxis' | 'yAxis' | 'color') => void;
  onCreateGroup: (field: DataField) => void;
  onCreateBin: (field: DataField) => void;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const t = useT();
  const Icon = FIELD_TYPE_ICONS[field.type] || Type;
  const isDimension = field.role === 'dimension';

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextOpen(true);
  }, []);

  return (
    <DropdownMenu open={contextOpen} onOpenChange={setContextOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={`
              group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-left
              cursor-grab transition-colors duration-150 hover:bg-accent
            `}
            draggable
            onDragStart={(e: React.DragEvent) => {
              e.dataTransfer.setData('field', field.name);
              e.dataTransfer.setData('role', field.role);
              e.dataTransfer.setData('type', field.type);
            }}
            onContextMenu={handleContextMenu}
          />
        }
      >
        <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" aria-hidden="true" />
        <Icon
          className={`h-3 w-3 shrink-0 ${isDimension ? 'text-blue-500' : 'text-green-500'}`}
          aria-hidden="true"
        />
        <span className="truncate font-medium">{field.name}</span>
        <div className="ml-auto hidden gap-px group-hover:flex shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onAssign(field.name, 'xAxis'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onAssign(field.name, 'xAxis'); } }}
            className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
            title="Add to X axis"
          >
            X
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onAssign(field.name, 'yAxis'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onAssign(field.name, 'yAxis'); } }}
            className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-green-100 dark:hover:bg-green-900 cursor-pointer"
            title="Add to Y axis"
          >
            Y
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onAssign(field.name, 'color'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onAssign(field.name, 'color'); } }}
            className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer"
            title="Add to Color"
          >
            C
          </span>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="start">
        {isDimension && (
          <DropdownMenuItem
            onClick={() => onCreateGroup(field)}
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            {t('fields.createGroup')}
          </DropdownMenuItem>
        )}
        {!isDimension && (
          <DropdownMenuItem
            onClick={() => onCreateBin(field)}
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            {t('fields.createBin')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAssign(field.name, 'xAxis')}>
          {t('fields.addToXAxis')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAssign(field.name, 'yAxis')}>
          {t('fields.addToYAxis')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAssign(field.name, 'color')}>
          {t('fields.addToColor')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VirtualFieldItem({
  name,
  sourceField,
  type,
  onAssign,
  onRemove,
}: {
  name: string;
  sourceField: string;
  type: 'group' | 'bin';
  onAssign: (field: string, target: 'xAxis' | 'yAxis' | 'color') => void;
  onRemove: () => void;
}) {
  const Icon = type === 'group' ? Layers : BarChart3;
  const t = useT();

  return (
    <div
      className={`
        group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs
        cursor-grab transition-colors duration-150 hover:bg-accent
      `}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('field', name);
        e.dataTransfer.setData('role', 'dimension');
        e.dataTransfer.setData('type', 'string');
      }}
    >
      <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" aria-hidden="true" />
      <Icon
        className="h-3 w-3 shrink-0 text-purple-500"
        aria-hidden="true"
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-[9px] text-muted-foreground">
          {type === 'group' ? t('fields.group') : t('fields.bin')} • {sourceField}
        </span>
      </div>
      <div className="ml-auto hidden gap-px group-hover:flex shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onAssign(name, 'xAxis'); }}
          className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
          title="Add to X axis"
        >
          X
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAssign(name, 'yAxis'); }}
          className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-green-100 dark:hover:bg-green-900 cursor-pointer"
          title="Add to Y axis"
        >
          Y
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAssign(name, 'color'); }}
          className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer"
          title="Add to Color"
        >
          C
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer"
          title="Remove"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}
