// ============================================================
// ETL / DATA PREP FLOW TYPES — Tableau Prep-like
// ============================================================

import type { AggregationType, FieldType, FilterOperator, JoinType } from '../types';

// ============================================================
// STEP TYPES
// ============================================================

export type StepType =
  | 'input'
  | 'clean'
  | 'join'
  | 'aggregate'
  | 'pivot'
  | 'union'
  | 'output';

// ============================================================
// STEP CONFIGURATIONS
// ============================================================

export interface InputStepConfig {
  sourceType: 'connector' | 'file' | 'datasource';
  dataSourceId?: string;
  connectorId?: string;
  connectionProfileId?: string;
  query?: string;
  tableName?: string;
  filePath?: string;
}

export interface CleanStepConfig {
  operations: CleanOperation[];
}

export type CleanOperationType = 'filter' | 'rename' | 'cast';

export interface CleanOperation {
  type: CleanOperationType;
  filter?: {
    field: string;
    operator: FilterOperator;
    values: string[];
  };
  rename?: {
    field: string;
    newName: string;
  };
  cast?: {
    field: string;
    targetType: FieldType;
  };
}

export interface JoinStepConfig {
  joinType: JoinType;
  rightInputStepId: string;
  leftField: string;
  rightField: string;
}

export interface AggregateStepConfig {
  groupByFields: string[];
  aggregations: AggregateField[];
}

export interface AggregateField {
  field: string;
  aggregation: AggregationType;
  alias?: string;
}

export interface PivotStepConfig {
  mode: 'rows-to-columns' | 'columns-to-rows';
  pivotField: string;
  valueField: string;
  groupByFields: string[];
}

export interface UnionStepConfig {
  inputStepIds: string[];
  matchBy: 'name' | 'position';
}

export interface OutputStepConfig {
  outputName: string;
  outputType: 'datasource' | 'file';
  overwriteExisting: boolean;
}

// ============================================================
// STEP CONFIG MAP
// ============================================================

export interface StepConfigMap {
  input: InputStepConfig;
  clean: CleanStepConfig;
  join: JoinStepConfig;
  aggregate: AggregateStepConfig;
  pivot: PivotStepConfig;
  union: UnionStepConfig;
  output: OutputStepConfig;
}

// ============================================================
// FLOW STEP
// ============================================================

export interface FlowStep<T extends StepType = StepType> {
  id: string;
  name: string;
  type: T;
  config: StepConfigMap[T];
  enabled: boolean;
  position?: { x: number; y: number };
}

// ============================================================
// FLOW DEFINITION
// ============================================================

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
  connections: FlowConnection[];
  createdAt: string;
  updatedAt: string;
}

export interface FlowConnection {
  id: string;
  sourceStepId: string;
  targetStepId: string;
}

// ============================================================
// FLOW EXECUTION STATE
// ============================================================

export type FlowExecutionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error';

export interface FlowExecutionResult {
  flowId: string;
  status: FlowExecutionStatus;
  stepResults: StepExecutionResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface StepExecutionResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  rowCount?: number;
  executionTimeMs?: number;
  error?: string;
}
