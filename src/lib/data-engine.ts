import Papa from 'papaparse';
import {
  DataSource,
  DataField,
  FieldType,
  FieldRole,
  ChartType,
  ChartConfig,
  ChartFilter,
  AggregationType,
  FilterOperator,
  DataJoin,
  JoinType,
  TransformStep,
} from './types';
import { computePercentOfTotal } from './transforms/percent-of-total';

// ============================================================
// ID GENERATION
// ============================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================
// DATA IMPORT — CSV
// ============================================================

function detectFieldType(values: string[]): FieldType {
  const nonEmpty = values.filter((v) => v !== '' && v != null);
  if (nonEmpty.length === 0) return 'string';

  const allNumbers = nonEmpty.every((v) => !isNaN(Number(v.replace(/[,$%]/g, ''))) && v.trim() !== '');
  if (allNumbers) return 'number';

  const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/];
  const allDates = nonEmpty.every((v) => datePatterns.some((p) => p.test(v.trim())));
  if (allDates) return 'date';

  const boolValues = new Set(['true', 'false', '0', '1', 'yes', 'no']);
  const allBooleans = nonEmpty.every((v) => boolValues.has(v.toLowerCase().trim()));
  if (allBooleans) return 'boolean';

  return 'string';
}

function detectFieldRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

export function parseCSVToDataSource(file: File): Promise<DataSource> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const headers = results.meta.fields || [];

        if (headers.length === 0 || rows.length === 0) {
          reject(new Error('File is empty or has no headers'));
          return;
        }

        const fields: DataField[] = headers.map((header) => {
          const columnValues = rows.map((row) => row[header] || '');
          const sampleValues = [...new Set(columnValues)].slice(0, 20);
          const type = detectFieldType(columnValues.slice(0, 200));
          const nullCount = columnValues.filter((v) => v === '' || v == null).length;
          const uniqueCount = new Set(columnValues).size;

          return {
            id: generateId(),
            name: header,
            originalName: header,
            type,
            role: detectFieldRole(type),
            sampleValues,
            nullCount,
            uniqueCount,
          };
        });

        const typedRows = rows.map((row) => {
          const typedRow: Record<string, unknown> = {};
          fields.forEach((field) => {
            const value = row[field.name];
            if (field.type === 'number') {
              typedRow[field.name] = value ? Number(value.replace(/[,$%]/g, '')) : null;
            } else if (field.type === 'boolean') {
              typedRow[field.name] = ['true', '1', 'yes'].includes((value || '').toLowerCase());
            } else {
              typedRow[field.name] = value || null;
            }
          });
          return typedRow;
        });

        resolve({
          id: generateId(),
          name: file.name.replace(/\.(csv|xlsx|json)$/i, ''),
          fileName: file.name,
          fields,
          rows: typedRows,
          rowCount: typedRows.length,
          importedAt: new Date().toISOString(),
        });
      },
      error: (error) => reject(new Error(`Parse error: ${error.message}`)),
    });
  });
}

export function parseJSONToDataSource(file: File): Promise<DataSource> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [data];

        if (rows.length === 0) {
          reject(new Error('JSON file contains no data'));
          return;
        }

        const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const fields: DataField[] = headers.map((header) => {
          const values = rows.map((r) => String(r[header] ?? ''));
          const type = detectFieldType(values.slice(0, 200));
          return {
            id: generateId(),
            name: header,
            originalName: header,
            type,
            role: detectFieldRole(type),
            sampleValues: [...new Set(values)].slice(0, 20),
            nullCount: values.filter((v) => v === '' || v === 'null' || v === 'undefined').length,
            uniqueCount: new Set(values).size,
          };
        });

        resolve({
          id: generateId(),
          name: file.name.replace(/\.json$/i, ''),
          fileName: file.name,
          fields,
          rows,
          rowCount: rows.length,
          importedAt: new Date().toISOString(),
        });
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.readAsText(file);
  });
}

// ============================================================
// DATA AGGREGATION
// ============================================================

export function aggregateData(
  rows: Record<string, unknown>[],
  config: ChartConfig
): Record<string, unknown>[] {
  const { xAxis, yAxis, color } = config;

  if (!xAxis.field && !yAxis.field) return [];

  // KPI: just aggregate all rows
  if (config.chartType === 'kpi') {
    if (!yAxis.field) return [];
    const values = rows.map((r) => Number(r[yAxis.field!]) || 0);
    return [{ value: applyAggregation(values, yAxis.aggregation) }];
  }

  // Table: return raw rows (limited), with percent-of-total support
  if (config.chartType === 'table') {
    if (yAxis.aggregation === 'PERCENT_OF_TOTAL' && yAxis.field) {
      const limited = rows.slice(0, 500);
      const values = limited.map((r) => Number(r[yAxis.field!]) || 0);
      const percentages = computePercentOfTotal(values);
      return limited.map((row, i) => ({
        ...row,
        [`${yAxis.field!}_pct`]: percentages[i],
        [`${yAxis.field!}_abs`]: values[i],
      }));
    }
    return rows.slice(0, 500);
  }

  if (!xAxis.field || !yAxis.field) return [];

  // Group by x-axis (and optionally color)
  const groups = new Map<string, Record<string, unknown>[]>();

  rows.forEach((row) => {
    const xValue = String(row[xAxis.field!] ?? '(empty)');
    const colorValue = color.field ? String(row[color.field] ?? '(empty)') : '';
    const key = color.field ? `${xValue}|||${colorValue}` : xValue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  const result: Record<string, unknown>[] = [];

  groups.forEach((groupRows, key) => {
    const parts = key.split('|||');
    const xValue = parts[0];
    const colorValue = parts[1] || '';

    const yValues = groupRows.map((r) => Number(r[yAxis.field!]) || 0);
    const aggregatedY = applyAggregation(yValues, yAxis.aggregation);

    const entry: Record<string, unknown> = {
      [xAxis.field!]: xValue,
      [yAxis.field!]: aggregatedY,
    };

    if (color.field) {
      entry[color.field] = colorValue;
    }

    // Size encoding
    if (config.size.field) {
      const sizeValues = groupRows.map((r) => Number(r[config.size.field!]) || 0);
      entry[config.size.field] = applyAggregation(sizeValues, config.size.aggregation || 'SUM');
    }

    result.push(entry);
  });

  // Apply percent-of-total transform after aggregation
  if (yAxis.aggregation === 'PERCENT_OF_TOTAL') {
    const absValues = result.map((r) => Number(r[yAxis.field!]) || 0);
    const percentages = computePercentOfTotal(absValues);
    result.forEach((entry, i) => {
      entry[`${yAxis.field!}_abs`] = entry[yAxis.field!];
      entry[yAxis.field!] = percentages[i];
    });
  }

  // Sort
  const sortField = config.sortBy || yAxis.field;
  if (sortField && config.sortOrder !== 'none') {
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return config.sortOrder === 'desc' ? -cmp : cmp;
    });
  }

  return result;
}

function applyAggregation(values: number[], aggregation: AggregationType): number {
  if (values.length === 0) return 0;
  switch (aggregation) {
    case 'SUM': return values.reduce((s, v) => s + v, 0);
    case 'AVG': return values.reduce((s, v) => s + v, 0) / values.length;
    case 'COUNT': return values.length;
    case 'COUNT_DISTINCT': return new Set(values).size;
    case 'MIN': return Math.min(...values);
    case 'MAX': return Math.max(...values);
    case 'PERCENT_OF_TOTAL': return values.reduce((s, v) => s + v, 0);
    case 'NONE': default: return values[0] || 0;
  }
}

// ============================================================
// FILTERING
// ============================================================

export function applyFilters(
  rows: Record<string, unknown>[],
  filters: ChartFilter[]
): Record<string, unknown>[] {
  const activeFilters = filters.filter((f) => f.enabled);
  if (activeFilters.length === 0) return rows;

  return rows.filter((row) =>
    activeFilters.every((filter) => evaluateFilter(row, filter))
  );
}

function evaluateFilter(row: Record<string, unknown>, filter: ChartFilter): boolean {
  const rawValue = row[filter.field];
  const value = String(rawValue ?? '');
  const numValue = Number(rawValue);

  switch (filter.operator) {
    case 'equals': return value === filter.values[0];
    case 'not_equals': return value !== filter.values[0];
    case 'contains': return value.toLowerCase().includes((filter.values[0] || '').toLowerCase());
    case 'not_contains': return !value.toLowerCase().includes((filter.values[0] || '').toLowerCase());
    case 'gt': return numValue > Number(filter.values[0]);
    case 'gte': return numValue >= Number(filter.values[0]);
    case 'lt': return numValue < Number(filter.values[0]);
    case 'lte': return numValue <= Number(filter.values[0]);
    case 'between': return numValue >= Number(filter.values[0]) && numValue <= Number(filter.values[1]);
    case 'in': return filter.values.includes(value);
    case 'not_in': return !filter.values.includes(value);
    case 'is_null': return rawValue == null || value === '';
    case 'is_not_null': return rawValue != null && value !== '';
    default: return true;
  }
}

// ============================================================
// DATA JOINS
// ============================================================

export function joinDataSources(
  left: DataSource,
  right: DataSource,
  join: DataJoin
): Record<string, unknown>[] {
  const leftRows = left.rows;
  const rightRows = right.rows;
  const result: Record<string, unknown>[] = [];

  // Build index on right side
  const rightIndex = new Map<string, Record<string, unknown>[]>();
  rightRows.forEach((row) => {
    const key = String(row[join.rightField] ?? '');
    if (!rightIndex.has(key)) rightIndex.set(key, []);
    rightIndex.get(key)!.push(row);
  });

  // Prefix right fields to avoid collisions
  const rightPrefix = `${right.name}_`;

  if (join.joinType === 'inner' || join.joinType === 'left') {
    leftRows.forEach((leftRow) => {
      const key = String(leftRow[join.leftField] ?? '');
      const matches = rightIndex.get(key);

      if (matches && matches.length > 0) {
        matches.forEach((rightRow) => {
          const merged: Record<string, unknown> = { ...leftRow };
          Object.entries(rightRow).forEach(([k, v]) => {
            merged[`${rightPrefix}${k}`] = v;
          });
          result.push(merged);
        });
      } else if (join.joinType === 'left') {
        result.push({ ...leftRow });
      }
    });
  }

  if (join.joinType === 'right' || join.joinType === 'full') {
    const leftIndex = new Map<string, boolean>();
    leftRows.forEach((row) => {
      leftIndex.set(String(row[join.leftField] ?? ''), true);
    });

    rightRows.forEach((rightRow) => {
      const key = String(rightRow[join.rightField] ?? '');
      if (!leftIndex.has(key)) {
        const merged: Record<string, unknown> = {};
        Object.entries(rightRow).forEach(([k, v]) => {
          merged[`${rightPrefix}${k}`] = v;
        });
        result.push(merged);
      }
    });
  }

  return result;
}

// ============================================================
// DATA TRANSFORMS
// ============================================================

export function applyTransforms(
  rows: Record<string, unknown>[],
  fields: DataField[],
  transforms: TransformStep[]
): { rows: Record<string, unknown>[]; fields: DataField[] } {
  let currentRows = [...rows];
  let currentFields = [...fields];

  for (const step of transforms) {
    if (!step.enabled) continue;

    switch (step.type) {
      case 'rename': {
        const { field, newName } = step.config as { field: string; newName: string };
        currentFields = currentFields.map((f) =>
          f.name === field ? { ...f, name: newName } : f
        );
        currentRows = currentRows.map((row) => {
          const newRow = { ...row };
          if (field in newRow) {
            newRow[newName] = newRow[field];
            delete newRow[field];
          }
          return newRow;
        });
        break;
      }
      case 'calculated': {
        const { name, formula } = step.config as { name: string; formula: string };
        currentRows = currentRows.map((row) => ({
          ...row,
          [name]: evaluateFormula(formula, row),
        }));
        currentFields = [
          ...currentFields,
          {
            id: generateId(),
            name,
            originalName: name,
            type: 'number',
            role: 'measure',
            sampleValues: [],
            nullCount: 0,
            uniqueCount: 0,
          },
        ];
        break;
      }
      case 'filter': {
        const { field, operator, values } = step.config as { field: string; operator: FilterOperator; values: string[] };
        currentRows = applyFilters(currentRows, [{
          id: step.id,
          field,
          operator,
          values,
          enabled: true,
        }]);
        break;
      }
      case 'sort': {
        const { field, order } = step.config as { field: string; order: 'asc' | 'desc' };
        currentRows = [...currentRows].sort((a, b) => {
          const aVal = a[field];
          const bVal = b[field];
          const cmp = typeof aVal === 'number' && typeof bVal === 'number'
            ? aVal - bVal
            : String(aVal ?? '').localeCompare(String(bVal ?? ''));
          return order === 'desc' ? -cmp : cmp;
        });
        break;
      }
    }
  }

  return { rows: currentRows, fields: currentFields };
}

function evaluateFormula(formula: string, row: Record<string, unknown>): number {
  // Simple formula evaluator: supports field references and basic math
  let expr = formula;

  // Replace field names with values
  Object.entries(row).forEach(([key, value]) => {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    expr = expr.replace(regex, String(Number(value) || 0));
  });

  // Evaluate simple math (only +, -, *, /)
  try {
    // Only allow numbers, operators, parentheses, and spaces
    if (/^[\d\s+\-*/().]+$/.test(expr)) {
      return new Function(`return (${expr})`)() as number;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ============================================================
// SMART SUGGESTIONS
// ============================================================

export function suggestChartType(
  xField: DataField | null,
  yField: DataField | null,
  rowCount: number
): ChartType[] {
  const suggestions: ChartType[] = [];

  if (!xField && yField) {
    suggestions.push('kpi');
    return suggestions;
  }

  if (!xField || !yField) return ['bar'];

  // Date x-axis → line/area
  if (xField.type === 'date') {
    suggestions.push('line', 'area', 'bar');
  }
  // Low cardinality dimension → bar/pie
  else if (xField.uniqueCount <= 8) {
    suggestions.push('bar', 'pie', 'donut', 'horizontal-bar');
  }
  // High cardinality → bar/scatter
  else if (xField.uniqueCount <= 30) {
    suggestions.push('bar', 'horizontal-bar', 'scatter');
  }
  // Very high cardinality → scatter/heatmap
  else {
    suggestions.push('scatter', 'heatmap', 'table');
  }

  // Both numeric → scatter
  if (xField.type === 'number' && yField.type === 'number') {
    if (!suggestions.includes('scatter')) suggestions.unshift('scatter');
  }

  return suggestions.slice(0, 4);
}

export function getFieldSummary(rows: Record<string, unknown>[], field: DataField): Record<string, unknown> {
  const values = rows.map((r) => r[field.name]).filter((v) => v != null);

  if (field.type === 'number') {
    const nums = values.map(Number).filter((n) => !isNaN(n));
    return {
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: nums.reduce((s, n) => s + n, 0) / nums.length,
      sum: nums.reduce((s, n) => s + n, 0),
      count: nums.length,
      nulls: rows.length - nums.length,
    };
  }

  const strValues = values.map(String);
  const uniqueValues = [...new Set(strValues)];
  return {
    unique: uniqueValues.length,
    top5: uniqueValues.slice(0, 5),
    count: strValues.length,
    nulls: rows.length - strValues.length,
  };
}

// ============================================================
// UNIQUE VALUES
// ============================================================

export function getUniqueValues(rows: Record<string, unknown>[], field: string): string[] {
  const values = new Set<string>();
  rows.forEach((row) => {
    const val = row[field];
    if (val != null) values.add(String(val));
  });
  return [...values].sort();
}
