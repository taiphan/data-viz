'use client';

import { useCallback } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { Parameter } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ============================================================
// TEXT PARAMETER WIDGET
// ============================================================

interface TextParameterWidgetProps {
  parameter: Parameter;
}

export function TextParameterWidget({ parameter }: TextParameterWidgetProps) {
  const updateParameterValue = useWorkbookStore((s) => s.updateParameterValue);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parameter.dataType === 'number'
        ? Number(e.target.value)
        : e.target.value;
      updateParameterValue(parameter.id, value);
    },
    [parameter.id, parameter.dataType, updateParameterValue],
  );

  return (
    <div className="space-y-1">
      <Label
        htmlFor={`param-text-${parameter.id}`}
        className="text-[10px] font-medium text-muted-foreground"
      >
        {parameter.name}
      </Label>
      <Input
        id={`param-text-${parameter.id}`}
        type={parameter.dataType === 'number' ? 'number' : 'text'}
        value={String(parameter.currentValue)}
        onChange={handleChange}
        className="h-7 text-xs"
        aria-label={`Parameter: ${parameter.name}`}
      />
    </div>
  );
}

// ============================================================
// DROPDOWN PARAMETER WIDGET
// ============================================================

interface DropdownParameterWidgetProps {
  parameter: Parameter;
  options: string[];
}

export function DropdownParameterWidget({ parameter, options }: DropdownParameterWidgetProps) {
  const updateParameterValue = useWorkbookStore((s) => s.updateParameterValue);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = parameter.dataType === 'number'
        ? Number(e.target.value)
        : e.target.value;
      updateParameterValue(parameter.id, value);
    },
    [parameter.id, parameter.dataType, updateParameterValue],
  );

  return (
    <div className="space-y-1">
      <Label
        htmlFor={`param-dropdown-${parameter.id}`}
        className="text-[10px] font-medium text-muted-foreground"
      >
        {parameter.name}
      </Label>
      <select
        id={`param-dropdown-${parameter.id}`}
        value={String(parameter.currentValue)}
        onChange={handleChange}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        aria-label={`Parameter: ${parameter.name}`}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// SLIDER PARAMETER WIDGET
// ============================================================

interface SliderParameterWidgetProps {
  parameter: Parameter;
  min: number;
  max: number;
  step?: number;
}

export function SliderParameterWidget({
  parameter,
  min,
  max,
  step = 1,
}: SliderParameterWidgetProps) {
  const updateParameterValue = useWorkbookStore((s) => s.updateParameterValue);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateParameterValue(parameter.id, Number(e.target.value));
    },
    [parameter.id, updateParameterValue],
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={`param-slider-${parameter.id}`}
          className="text-[10px] font-medium text-muted-foreground"
        >
          {parameter.name}
        </Label>
        <span
          className="text-[10px] font-mono text-muted-foreground"
          aria-live="polite"
        >
          {parameter.currentValue}
        </span>
      </div>
      <input
        id={`param-slider-${parameter.id}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(parameter.currentValue)}
        onChange={handleChange}
        className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-primary
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-primary
          [&::-moz-range-thumb]:border-0"
        aria-label={`Parameter: ${parameter.name}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(parameter.currentValue)}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ============================================================
// AUTO-SELECTING PARAMETER WIDGET
// ============================================================

interface ParameterWidgetProps {
  parameter: Parameter;
}

/**
 * Automatically selects the appropriate widget based on the parameter's
 * allowedValues configuration:
 * - string[] → DropdownParameterWidget
 * - { min, max } → SliderParameterWidget
 * - undefined/null → TextParameterWidget
 */
export function ParameterWidget({ parameter }: ParameterWidgetProps) {
  const { allowedValues } = parameter;

  if (Array.isArray(allowedValues)) {
    return (
      <DropdownParameterWidget
        parameter={parameter}
        options={allowedValues}
      />
    );
  }

  if (
    allowedValues &&
    typeof allowedValues === 'object' &&
    'min' in allowedValues &&
    'max' in allowedValues
  ) {
    return (
      <SliderParameterWidget
        parameter={parameter}
        min={allowedValues.min}
        max={allowedValues.max}
      />
    );
  }

  return <TextParameterWidget parameter={parameter} />;
}
