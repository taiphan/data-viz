// ============================================================
// CORE TYPES — Data Viz Engine
// ============================================================

import type { DataSourceMeta } from './connectors/types';

export type { DataSourceMeta } from './connectors/types';

export type FieldType = 'string' | 'number' | 'date' | 'boolean';
export type FieldRole = 'dimension' | 'measure';
export type AggregationType = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT' | 'PERCENT_OF_TOTAL' | 'NONE';
export type SortOrder = 'asc' | 'desc' | 'none';

export type ChartType =
  | 'bar'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'bubble'
  | 'heatmap'
  | 'treemap'
  | 'table'
  | 'kpi'
  | 'sankey';

export type JoinType = 'inner' | 'left' | 'right' | 'full';
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null';

// ============================================================
// DATA SOURCE
// ============================================================

export interface DataField {
  id: string;
  name: string;
  originalName: string;
  type: FieldType;
  role: FieldRole;
  format?: string;
  sampleValues: string[];
  nullCount: number;
  uniqueCount: number;
}

export interface DataSource {
  id: string;
  name: string;
  fileName: string;
  fields: DataField[];
  rows: Record<string, unknown>[];
  rowCount: number;
  importedAt: string;
  sourceInfo?: DataSourceMeta;
}

// ============================================================
// PARAMETERS
// ============================================================

export interface Parameter {
  id: string;
  name: string;
  dataType: 'string' | 'number' | 'date';
  currentValue: string | number;
  defaultValue: string | number;
  allowedValues?: string[] | { min: number; max: number };
}

export interface ParameterAction {
  id: string;
  parameterId: string;
  sourceChartId: string;
  targetField: string;
  actionType: 'click' | 'hover';
}

// ============================================================
// GROUPS AND BINS
// ============================================================

export interface GroupDefinition {
  id: string;
  name: string;
  sourceField: string;
  groups: { name: string; values: string[] }[];
  otherGroupName: string;
}

export interface BinDefinition {
  id: string;
  name: string;
  sourceField: string;
  binSize: number;
  startAt?: number;
}

// ============================================================
// DATA PREPARATION
// ============================================================

export interface TransformStep {
  id: string;
  type: 'rename' | 'cast' | 'filter' | 'sort' | 'calculated' | 'pivot' | 'unpivot' | 'group';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface RenameConfig {
  field: string;
  newName: string;
}

export interface CastConfig {
  field: string;
  targetType: FieldType;
}

export interface CalculatedFieldConfig {
  name: string;
  formula: string; // Simple expression like "sales - cost" or "quantity * price"
  resultType: FieldType;
}

// ============================================================
// DATA BLENDING
// ============================================================

export interface DataJoin {
  id: string;
  leftSourceId: string;
  rightSourceId: string;
  joinType: JoinType;
  leftField: string;
  rightField: string;
}

// ============================================================
// CHART CONFIGURATION
// ============================================================

export interface ChartEncoding {
  field: string | null;
  aggregation: AggregationType;
  sort?: SortOrder;
  format?: string;
}

export interface ChartFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  values: string[];
  enabled: boolean;
}

export interface ChartConfig {
  id: string;
  title: string;
  chartType: ChartType;
  xAxis: ChartEncoding;
  yAxis: ChartEncoding;
  color: ChartEncoding;
  size: ChartEncoding;
  label: ChartEncoding;
  filters: ChartFilter[];
  sortBy: string | null;
  sortOrder: SortOrder;
  showTrendLine: boolean;
  showDataLabels: boolean;
  showLegend: boolean;
  colorPalette: string[];
  width: number; // grid units
  height: number; // grid units
}

// ============================================================
// DASHBOARD
// ============================================================

export interface DashboardSheet {
  id: string;
  title: string;
  charts: ChartConfig[];
  globalFilters: ChartFilter[];
  layout: 'auto' | 'free';
}

export interface Workbook {
  id: string;
  name: string;
  dataSources: DataSource[];
  activeDataSourceId: string | null;
  joins: DataJoin[];
  transforms: TransformStep[];
  sheets: DashboardSheet[];
  activeSheetId: string;
  activeChartId: string | null;
  parameters: Parameter[];
  parameterActions: ParameterAction[];
  groups: GroupDefinition[];
  bins: BinDefinition[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  'horizontal-bar': 'H-Bar',
  'stacked-bar': 'Stacked',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
  scatter: 'Scatter',
  bubble: 'Bubble',
  heatmap: 'Heatmap',
  treemap: 'Treemap',
  table: 'Table',
  kpi: 'KPI',
  sankey: 'Sankey',
};

export const AGGREGATION_LABELS: Record<AggregationType, string> = {
  SUM: 'Sum',
  AVG: 'Avg',
  COUNT: 'Count',
  MIN: 'Min',
  MAX: 'Max',
  COUNT_DISTINCT: 'Distinct',
  PERCENT_OF_TOTAL: '% of Total',
  NONE: 'None',
};

export const COLOR_PALETTES = {
  default: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'],
  cool: ['#0EA5E9', '#06B6D4', '#14B8A6', '#10B981', '#22C55E', '#84CC16', '#A3E635', '#BEF264', '#D9F99D', '#ECFCCB'],
  warm: ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#EAB308', '#F59E0B', '#FB923C', '#FDBA74', '#FED7AA', '#FFEDD5'],
  corporate: ['#1E40AF', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE', '#EFF6FF', '#F0F9FF'],
  pastel: ['#FDA4AF', '#FDBA74', '#FDE047', '#86EFAC', '#67E8F9', '#A5B4FC', '#D8B4FE', '#F9A8D4', '#FCA5A5', '#FCD34D'],
};

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Not Contains',
  gt: 'Greater Than',
  gte: 'Greater or Equal',
  lt: 'Less Than',
  lte: 'Less or Equal',
  between: 'Between',
  in: 'In',
  not_in: 'Not In',
  is_null: 'Is Null',
  is_not_null: 'Is Not Null',
};
