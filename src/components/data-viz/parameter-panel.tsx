'use client';

import { useState, useCallback } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import { Parameter } from '@/lib/types';
import { ParameterWidget } from '@/components/data-viz/parameter-widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SlidersHorizontal, Plus, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';

// ============================================================
// ADD PARAMETER FORM
// ============================================================

interface AddParameterFormProps {
  onAdd: (param: Parameter) => void;
  onCancel: () => void;
}

function AddParameterForm({ onAdd, onCancel }: AddParameterFormProps) {
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<Parameter['dataType']>('string');
  const [defaultValue, setDefaultValue] = useState('');

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;

    const resolvedDefault = dataType === 'number'
      ? Number(defaultValue) || 0
      : defaultValue;

    const param: Parameter = {
      id: generateId(),
      name: name.trim(),
      dataType,
      currentValue: resolvedDefault,
      defaultValue: resolvedDefault,
    };

    onAdd(param);
  }, [name, dataType, defaultValue, onAdd]);

  return (
    <div
      className="rounded-md border bg-background p-2 space-y-1.5"
      role="form"
      aria-label="Add new parameter"
    >
      <div className="space-y-1">
        <Label
          htmlFor="new-param-name"
          className="text-[10px] font-medium text-muted-foreground"
        >
          Name
        </Label>
        <Input
          id="new-param-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Parameter name"
          className="h-7 text-xs"
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="new-param-type"
          className="text-[10px] font-medium text-muted-foreground"
        >
          Data Type
        </Label>
        <select
          id="new-param-type"
          value={dataType}
          onChange={(e) => setDataType(e.target.value as Parameter['dataType'])}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          aria-label="Parameter data type"
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="new-param-default"
          className="text-[10px] font-medium text-muted-foreground"
        >
          Default Value
        </Label>
        <Input
          id="new-param-default"
          type={dataType === 'number' ? 'number' : 'text'}
          value={defaultValue}
          onChange={(e) => setDefaultValue(e.target.value)}
          placeholder={dataType === 'date' ? 'YYYY-MM-DD' : 'Default value'}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-[10px] flex-1 cursor-pointer"
          onClick={handleSubmit}
          disabled={!name.trim()}
        >
          Add
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] cursor-pointer"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// PARAMETER ITEM
// ============================================================

interface ParameterItemProps {
  parameter: Parameter;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}

function ParameterItem({ parameter, onDelete, onReset }: ParameterItemProps) {
  const isDefault = parameter.currentValue === parameter.defaultValue;

  return (
    <div
      className="rounded border bg-background p-2 space-y-1"
      role="group"
      aria-label={`Parameter: ${parameter.name}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground truncate">
          {parameter.dataType}
        </span>
        <div className="flex items-center gap-0.5">
          {!isDefault && (
            <button
              onClick={() => onReset(parameter.id)}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={`Reset to default (${parameter.defaultValue})`}
              aria-label={`Reset ${parameter.name} to default value`}
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(parameter.id)}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive"
            title="Delete parameter"
            aria-label={`Delete parameter ${parameter.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      <ParameterWidget parameter={parameter} />
    </div>
  );
}

// ============================================================
// PARAMETER PANEL
// ============================================================

export function ParameterPanel() {
  const { workbook, addParameter, removeParameter, updateParameterValue } = useWorkbookStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const parameters = workbook.parameters;

  const handleAdd = useCallback(
    (param: Parameter) => {
      addParameter(param);
      setIsAdding(false);
    },
    [addParameter],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeParameter(id);
    },
    [removeParameter],
  );

  const handleReset = useCallback(
    (id: string) => {
      const param = parameters.find((p) => p.id === id);
      if (param) {
        updateParameterValue(id, param.defaultValue);
      }
    },
    [parameters, updateParameterValue],
  );

  const handleResetAll = useCallback(() => {
    parameters.forEach((param) => {
      updateParameterValue(param.id, param.defaultValue);
    });
  }, [parameters, updateParameterValue]);

  return (
    <div
      className="flex flex-col border-l bg-muted/20 w-56"
      role="region"
      aria-label="Parameters panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 cursor-pointer"
          aria-expanded={!isCollapsed}
          aria-controls="parameter-panel-content"
        >
          {isCollapsed
            ? <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          }
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Parameters
          </h2>
        </button>
        <div className="flex items-center gap-1">
          {parameters.length > 0 && (
            <button
              onClick={handleResetAll}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Reset all to defaults"
              aria-label="Reset all parameters to default values"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Add parameter"
            aria-label="Add new parameter"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <ScrollArea className="flex-1" id="parameter-panel-content">
          <div className="p-2 space-y-2">
            {/* Add parameter form */}
            {isAdding && (
              <AddParameterForm
                onAdd={handleAdd}
                onCancel={() => setIsAdding(false)}
              />
            )}

            {/* Empty state */}
            {parameters.length === 0 && !isAdding && (
              <p className="text-[10px] text-muted-foreground text-center py-4">
                No parameters defined
              </p>
            )}

            {/* Parameter list */}
            {parameters.map((param) => (
              <ParameterItem
                key={param.id}
                parameter={param}
                onDelete={handleDelete}
                onReset={handleReset}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
