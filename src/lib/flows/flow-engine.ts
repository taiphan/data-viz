// ============================================================
// FLOW EXECUTION ENGINE — Tableau Prep-like ETL
// ============================================================

import type { DataSource, AggregationType, FilterOperator } from '../types';
import type {
  FlowDefinition,
  FlowStep,
  FlowExecutionResult,
  StepExecutionResult,
  InputStepConfig,
  CleanStepConfig,
  CleanOperation,
  JoinStepConfig,
  AggregateStepConfig,
  PivotStepConfig,
  UnionStepConfig,
  OutputStepConfig,
} from './types';
import { generateId } from '../data-engine';

// ============================================================
// TYPES
// ============================================================

export interface FlowDataSources {
  [id: string]: DataSource;
}

export interface FlowExecutionContext {
  dataSources: FlowDataSources;
  stepOutputs: Map<string, Record<string, unknown>[]>;
  connections: { sourceStepId: string; targetStepId: string }[];
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function executeFlow(
  definition: FlowDefinition,
  dataSources: FlowDataSources
): Promise<FlowExecutionResult> {
  const startedAt = new Date().toISOString();
  const stepResults: StepExecutionResult[] = [];
  const context: FlowExecutionContext = {
    dataSources,
    stepOutputs: new Map(),
    connections: definition.connections,
  };

  const executionOrder = resolveExecutionOrder(definition);

  for (const step of executionOrder) {
    if (!step.enabled) {
      stepResults.push({
        stepId: step.id,
        status: 'skipped',
      });
      continue;
    }

    const stepStart = performance.now();

    try {
      const output = await executeStep(step, context);
      const executionTimeMs = Math.round(performance.now() - stepStart);

      context.stepOutputs.set(step.id, output);

      stepResults.push({
        stepId: step.id,
        status: 'completed',
        rowCount: output.length,
        executionTimeMs,
      });
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - stepStart);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      stepResults.push({
        stepId: step.id,
        status: 'error',
        executionTimeMs,
        error: errorMessage,
      });

      return {
        flowId: definition.id,
        status: 'error',
        stepResults,
        startedAt,
        completedAt: new Date().toISOString(),
        error: `Step "${step.name}" failed: ${errorMessage}`,
      };
    }
  }

  return {
    flowId: definition.id,
    status: 'completed',
    stepResults,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ============================================================
// EXECUTION ORDER RESOLUTION
// ============================================================

export function resolveExecutionOrder(definition: FlowDefinition): FlowStep[] {
  const { steps, connections } = definition;
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  steps.forEach((s) => {
    inDegree.set(s.id, 0);
    adjacency.set(s.id, []);
  });

  connections.forEach((conn) => {
    adjacency.get(conn.sourceStepId)?.push(conn.targetStepId);
    inDegree.set(conn.targetStepId, (inDegree.get(conn.targetStepId) || 0) + 1);
  });

  // Topological sort (Kahn's algorithm)
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const ordered: FlowStep[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = stepMap.get(current);
    if (step) ordered.push(step);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (ordered.length !== steps.length) {
    throw new Error('Flow contains a cycle or disconnected steps');
  }

  return ordered;
}

// ============================================================
// STEP DISPATCHER
// ============================================================

async function executeStep(
  step: FlowStep,
  context: FlowExecutionContext
): Promise<Record<string, unknown>[]> {
  switch (step.type) {
    case 'input':
      return executeInputStep(step.config as InputStepConfig, context);
    case 'clean':
      return executeCleanStep(step.config as CleanStepConfig, step, context);
    case 'join':
      return executeJoinStep(step.config as JoinStepConfig, step, context);
    case 'aggregate':
      return executeAggregateStep(step.config as AggregateStepConfig, step, context);
    case 'pivot':
      return executePivotStep(step.config as PivotStepConfig, step, context);
    case 'union':
      return executeUnionStep(step.config as UnionStepConfig, context);
    case 'output':
      return executeOutputStep(step.config as OutputStepConfig, step, context);
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

// ============================================================
// INPUT STEP
// ============================================================

function executeInputStep(
  config: InputStepConfig,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  if (config.sourceType === 'datasource' && config.dataSourceId) {
    const ds = context.dataSources[config.dataSourceId];
    if (!ds) {
      throw new Error(`DataSource not found: ${config.dataSourceId}`);
    }
    return [...ds.rows];
  }

  if (config.sourceType === 'connector' || config.sourceType === 'file') {
    // For connector/file sources, data should be pre-loaded into dataSources
    const id = config.dataSourceId || config.connectorId || '';
    const ds = context.dataSources[id];
    if (!ds) {
      throw new Error(
        `Data for ${config.sourceType} source not found. Ensure data is loaded before flow execution.`
      );
    }
    return [...ds.rows];
  }

  throw new Error(`Invalid input step configuration: sourceType="${config.sourceType}"`);
}

// ============================================================
// CLEAN STEP
// ============================================================

function executeCleanStep(
  config: CleanStepConfig,
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  let rows = getInputRows(step, context);

  for (const operation of config.operations) {
    rows = applyCleanOperation(rows, operation);
  }

  return rows;
}

function applyCleanOperation(
  rows: Record<string, unknown>[],
  operation: CleanOperation
): Record<string, unknown>[] {
  switch (operation.type) {
    case 'filter':
      return applyFilterOperation(rows, operation);
    case 'rename':
      return applyRenameOperation(rows, operation);
    case 'cast':
      return applyCastOperation(rows, operation);
    default:
      return rows;
  }
}

function applyFilterOperation(
  rows: Record<string, unknown>[],
  operation: CleanOperation
): Record<string, unknown>[] {
  const filter = operation.filter;
  if (!filter) return rows;

  return rows.filter((row) => {
    const rawValue = row[filter.field];
    const value = String(rawValue ?? '');
    const numValue = Number(rawValue);

    switch (filter.operator) {
      case 'equals':
        return value === filter.values[0];
      case 'not_equals':
        return value !== filter.values[0];
      case 'contains':
        return value.toLowerCase().includes((filter.values[0] || '').toLowerCase());
      case 'not_contains':
        return !value.toLowerCase().includes((filter.values[0] || '').toLowerCase());
      case 'gt':
        return numValue > Number(filter.values[0]);
      case 'gte':
        return numValue >= Number(filter.values[0]);
      case 'lt':
        return numValue < Number(filter.values[0]);
      case 'lte':
        return numValue <= Number(filter.values[0]);
      case 'between':
        return numValue >= Number(filter.values[0]) && numValue <= Number(filter.values[1]);
      case 'in':
        return filter.values.includes(value);
      case 'not_in':
        return !filter.values.includes(value);
      case 'is_null':
        return rawValue == null || value === '';
      case 'is_not_null':
        return rawValue != null && value !== '';
      default:
        return true;
    }
  });
}

function applyRenameOperation(
  rows: Record<string, unknown>[],
  operation: CleanOperation
): Record<string, unknown>[] {
  const rename = operation.rename;
  if (!rename) return rows;

  return rows.map((row) => {
    const newRow = { ...row };
    if (rename.field in newRow) {
      newRow[rename.newName] = newRow[rename.field];
      delete newRow[rename.field];
    }
    return newRow;
  });
}

function applyCastOperation(
  rows: Record<string, unknown>[],
  operation: CleanOperation
): Record<string, unknown>[] {
  const cast = operation.cast;
  if (!cast) return rows;

  return rows.map((row) => {
    const newRow = { ...row };
    const value = newRow[cast.field];

    switch (cast.targetType) {
      case 'number':
        newRow[cast.field] = value != null ? Number(value) || 0 : null;
        break;
      case 'string':
        newRow[cast.field] = value != null ? String(value) : null;
        break;
      case 'boolean':
        newRow[cast.field] = value != null
          ? ['true', '1', 'yes'].includes(String(value).toLowerCase())
          : null;
        break;
      case 'date':
        newRow[cast.field] = value != null ? String(value) : null;
        break;
    }

    return newRow;
  });
}

// ============================================================
// JOIN STEP
// ============================================================

function executeJoinStep(
  config: JoinStepConfig,
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  const leftRows = getInputRows(step, context);
  const rightRows = context.stepOutputs.get(config.rightInputStepId);

  if (!rightRows) {
    throw new Error(
      `Join step "${step.name}": right input step "${config.rightInputStepId}" has no output`
    );
  }

  return performJoin(leftRows, rightRows, config);
}

function performJoin(
  leftRows: Record<string, unknown>[],
  rightRows: Record<string, unknown>[],
  config: JoinStepConfig
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];

  // Build index on right side for efficient lookup
  const rightIndex = new Map<string, Record<string, unknown>[]>();
  rightRows.forEach((row) => {
    const key = String(row[config.rightField] ?? '');
    if (!rightIndex.has(key)) rightIndex.set(key, []);
    rightIndex.get(key)!.push(row);
  });

  // Track matched right keys for full/right joins
  const matchedRightKeys = new Set<string>();

  // Process left rows
  leftRows.forEach((leftRow) => {
    const key = String(leftRow[config.leftField] ?? '');
    const matches = rightIndex.get(key);

    if (matches && matches.length > 0) {
      matchedRightKeys.add(key);
      matches.forEach((rightRow) => {
        result.push(mergeRows(leftRow, rightRow, config.leftField, config.rightField));
      });
    } else if (config.joinType === 'left' || config.joinType === 'full') {
      result.push({ ...leftRow });
    }
  });

  // For right/full joins, add unmatched right rows
  if (config.joinType === 'right' || config.joinType === 'full') {
    rightRows.forEach((rightRow) => {
      const key = String(rightRow[config.rightField] ?? '');
      if (!matchedRightKeys.has(key)) {
        result.push({ ...rightRow });
      }
    });
  }

  return result;
}

function mergeRows(
  leftRow: Record<string, unknown>,
  rightRow: Record<string, unknown>,
  leftField: string,
  rightField: string
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...leftRow };

  Object.entries(rightRow).forEach(([key, value]) => {
    // Avoid overwriting left fields; prefix with right_ if collision
    if (key === rightField) return; // Skip the join key from right side
    if (key in merged) {
      merged[`right_${key}`] = value;
    } else {
      merged[key] = value;
    }
  });

  return merged;
}

// ============================================================
// AGGREGATE STEP
// ============================================================

function executeAggregateStep(
  config: AggregateStepConfig,
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  const rows = getInputRows(step, context);

  if (rows.length === 0) return [];

  // Group rows by groupByFields
  const groups = new Map<string, Record<string, unknown>[]>();

  rows.forEach((row) => {
    const key = config.groupByFields
      .map((field) => String(row[field] ?? ''))
      .join('|||');

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  // Aggregate each group
  const result: Record<string, unknown>[] = [];

  groups.forEach((groupRows) => {
    const entry: Record<string, unknown> = {};

    // Add group-by field values
    config.groupByFields.forEach((field) => {
      entry[field] = groupRows[0][field];
    });

    // Apply aggregations
    config.aggregations.forEach((agg) => {
      const values = groupRows
        .map((r) => r[agg.field])
        .filter((v) => v != null)
        .map(Number)
        .filter((n) => !isNaN(n));

      const fieldName = agg.alias || `${agg.field}_${agg.aggregation}`;
      entry[fieldName] = computeAggregation(values, agg.aggregation);
    });

    result.push(entry);
  });

  return result;
}

function computeAggregation(values: number[], aggregation: AggregationType): number {
  if (values.length === 0) return 0;

  switch (aggregation) {
    case 'SUM':
      return values.reduce((sum, v) => sum + v, 0);
    case 'AVG':
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    case 'COUNT':
      return values.length;
    case 'MIN':
      return Math.min(...values);
    case 'MAX':
      return Math.max(...values);
    case 'COUNT_DISTINCT':
      return new Set(values).size;
    default:
      return values.reduce((sum, v) => sum + v, 0);
  }
}

// ============================================================
// PIVOT STEP
// ============================================================

function executePivotStep(
  config: PivotStepConfig,
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  const rows = getInputRows(step, context);

  if (config.mode === 'rows-to-columns') {
    return pivotRowsToColumns(rows, config);
  } else {
    return pivotColumnsToRows(rows, config);
  }
}

function pivotRowsToColumns(
  rows: Record<string, unknown>[],
  config: PivotStepConfig
): Record<string, unknown>[] {
  const { pivotField, valueField, groupByFields } = config;

  // Get unique pivot values
  const pivotValues = [...new Set(rows.map((r) => String(r[pivotField] ?? '')))];

  // Group by groupByFields
  const groups = new Map<string, Record<string, unknown>[]>();

  rows.forEach((row) => {
    const key = groupByFields.map((f) => String(row[f] ?? '')).join('|||');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  // Build pivoted rows
  const result: Record<string, unknown>[] = [];

  groups.forEach((groupRows) => {
    const entry: Record<string, unknown> = {};

    // Add group-by values
    groupByFields.forEach((field) => {
      entry[field] = groupRows[0][field];
    });

    // Add pivoted columns
    pivotValues.forEach((pivotVal) => {
      const matchingRows = groupRows.filter(
        (r) => String(r[pivotField] ?? '') === pivotVal
      );
      const values = matchingRows
        .map((r) => Number(r[valueField]) || 0);
      entry[pivotVal] = values.length > 0
        ? values.reduce((sum, v) => sum + v, 0)
        : null;
    });

    result.push(entry);
  });

  return result;
}

function pivotColumnsToRows(
  rows: Record<string, unknown>[],
  config: PivotStepConfig
): Record<string, unknown>[] {
  const { pivotField, valueField, groupByFields } = config;
  const result: Record<string, unknown>[] = [];

  rows.forEach((row) => {
    const allKeys = Object.keys(row);
    const nonPivotKeys = [...groupByFields];
    const pivotColumns = allKeys.filter(
      (k) => !groupByFields.includes(k) && k !== pivotField
    );

    pivotColumns.forEach((col) => {
      const entry: Record<string, unknown> = {};

      // Preserve group-by fields
      groupByFields.forEach((field) => {
        entry[field] = row[field];
      });

      // Add the pivot field name and value
      entry[pivotField] = col;
      entry[valueField] = row[col];

      result.push(entry);
    });
  });

  return result;
}

// ============================================================
// UNION STEP
// ============================================================

function executeUnionStep(
  config: UnionStepConfig,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  const allRows: Record<string, unknown>[] = [];

  for (const stepId of config.inputStepIds) {
    const rows = context.stepOutputs.get(stepId);
    if (!rows) {
      throw new Error(`Union step: input step "${stepId}" has no output`);
    }

    if (config.matchBy === 'name') {
      // Stack rows directly — columns matched by name
      allRows.push(...rows);
    } else {
      // Match by position — remap column names to first dataset's columns
      if (allRows.length === 0) {
        allRows.push(...rows);
      } else {
        const referenceKeys = Object.keys(allRows[0] || {});
        rows.forEach((row) => {
          const rowKeys = Object.keys(row);
          const remapped: Record<string, unknown> = {};
          referenceKeys.forEach((refKey, idx) => {
            remapped[refKey] = idx < rowKeys.length ? row[rowKeys[idx]] : null;
          });
          allRows.push(remapped);
        });
      }
    }
  }

  return allRows;
}

// ============================================================
// OUTPUT STEP
// ============================================================

function executeOutputStep(
  config: OutputStepConfig,
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  const rows = getInputRows(step, context);

  // The output step returns the final rows.
  // The caller (UI layer) is responsible for writing to the workbook store.
  // We attach metadata via the step result.
  return rows;
}

/**
 * Build a DataSource from the output step result.
 * Called by the UI layer after flow execution completes.
 */
export function buildOutputDataSource(
  rows: Record<string, unknown>[],
  outputName: string
): DataSource {
  if (rows.length === 0) {
    return {
      id: generateId(),
      name: outputName,
      fileName: `${outputName}.flow`,
      fields: [],
      rows: [],
      rowCount: 0,
      importedAt: new Date().toISOString(),
    };
  }

  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  const fields = headers.map((header) => {
    const sampleValues = rows
      .slice(0, 100)
      .map((r) => r[header])
      .filter((v) => v != null)
      .map(String);

    const type = detectFieldTypeFromValues(
      rows.slice(0, 200).map((r) => r[header])
    );

    return {
      id: generateId(),
      name: header,
      originalName: header,
      type,
      role: type === 'number' ? 'measure' as const : 'dimension' as const,
      sampleValues: [...new Set(sampleValues)].slice(0, 20),
      nullCount: rows.filter((r) => r[header] == null).length,
      uniqueCount: new Set(rows.map((r) => String(r[header] ?? ''))).size,
    };
  });

  return {
    id: generateId(),
    name: outputName,
    fileName: `${outputName}.flow`,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}

// ============================================================
// HELPERS
// ============================================================

function getInputRows(
  step: FlowStep,
  context: FlowExecutionContext
): Record<string, unknown>[] {
  // Find connections that feed into this step
  const incomingConnections = context.connections.filter(
    (conn) => conn.targetStepId === step.id
  );

  if (incomingConnections.length > 0) {
    // For join steps, the left input is the first non-rightInputStepId connection
    // For other steps, use the first incoming connection
    for (const conn of incomingConnections) {
      const output = context.stepOutputs.get(conn.sourceStepId);
      if (output) {
        // For join steps, skip the right input (handled separately)
        if (step.type === 'join') {
          const joinConfig = step.config as JoinStepConfig;
          if (conn.sourceStepId === joinConfig.rightInputStepId) continue;
        }
        return [...output];
      }
    }
  }

  // Fallback: find the last output that was produced (sequential pipeline)
  const outputs = [...context.stepOutputs.entries()];
  if (outputs.length === 0) {
    throw new Error(`Step "${step.name}" has no input data available`);
  }

  return [...outputs[outputs.length - 1][1]];
}

function detectFieldTypeFromValues(
  values: unknown[]
): 'string' | 'number' | 'date' | 'boolean' {
  const nonNull = values.filter((v) => v != null);
  if (nonNull.length === 0) return 'string';

  const allNumbers = nonNull.every(
    (v) => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')
  );
  if (allNumbers) return 'number';

  const allBooleans = nonNull.every(
    (v) => typeof v === 'boolean' || ['true', 'false'].includes(String(v).toLowerCase())
  );
  if (allBooleans) return 'boolean';

  const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/];
  const allDates = nonNull.every((v) =>
    datePatterns.some((p) => p.test(String(v)))
  );
  if (allDates) return 'date';

  return 'string';
}
