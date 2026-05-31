import { DataSource, DataField, FieldType, FieldRole } from '../types';
import { QueryResult, DataSourceMeta } from './types';
import { MAX_RESULT_ROWS, LARGE_IMPORT_THRESHOLD } from './constants';
import { generateId } from '../data-engine';

// ============================================================
// SQL TYPE → FIELD TYPE MAPPING
// ============================================================

const NUMERIC_TYPES = new Set([
  'int', 'integer', 'int2', 'int4', 'int8',
  'smallint', 'bigint', 'tinyint', 'mediumint',
  'float', 'float4', 'float8', 'double', 'double precision',
  'decimal', 'numeric', 'real', 'money', 'smallmoney',
  'number', 'serial', 'bigserial', 'smallserial',
]);

const DATE_TYPES = new Set([
  'date', 'datetime', 'datetime2', 'datetimeoffset',
  'timestamp', 'timestamptz', 'timestamp without time zone',
  'timestamp with time zone', 'time', 'timetz',
  'time without time zone', 'time with time zone',
  'interval', 'year',
]);

const BOOLEAN_TYPES = new Set([
  'bool', 'boolean', 'bit',
]);

function mapSqlTypeToFieldType(sqlType: string): FieldType {
  const normalized = sqlType.toLowerCase().trim();

  if (BOOLEAN_TYPES.has(normalized)) return 'boolean';
  if (DATE_TYPES.has(normalized)) return 'date';
  if (NUMERIC_TYPES.has(normalized)) return 'number';

  // Handle parameterized types like varchar(255), decimal(10,2)
  const baseType = normalized.replace(/\(.*\)/, '').trim();
  if (NUMERIC_TYPES.has(baseType)) return 'number';
  if (DATE_TYPES.has(baseType)) return 'date';
  if (BOOLEAN_TYPES.has(baseType)) return 'boolean';

  return 'string';
}

// ============================================================
// ROLE ASSIGNMENT
// ============================================================

function assignFieldRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

// ============================================================
// FIELD STATISTICS
// ============================================================

function computeSampleValues(
  rows: Record<string, unknown>[],
  fieldName: string,
): string[] {
  const unique = new Set<string>();
  for (const row of rows) {
    if (unique.size >= 20) break;
    const val = row[fieldName];
    if (val != null) {
      unique.add(String(val));
    }
  }
  return [...unique];
}

function computeNullCount(
  rows: Record<string, unknown>[],
  fieldName: string,
): number {
  let count = 0;
  for (const row of rows) {
    const val = row[fieldName];
    if (val === null || val === undefined) {
      count++;
    }
  }
  return count;
}

function computeUniqueCount(
  rows: Record<string, unknown>[],
  fieldName: string,
): number {
  const unique = new Set<unknown>();
  for (const row of rows) {
    unique.add(row[fieldName]);
  }
  return unique.size;
}

// ============================================================
// QUERY RESULT → DATA SOURCE TRANSFORMATION
// ============================================================

export interface TransformOptions {
  name?: string;
  sourceInfo?: DataSourceMeta;
}

export function queryResultToDataSource(
  queryResult: QueryResult,
  options: TransformOptions = {},
): DataSource {
  // Warn at large import threshold
  if (queryResult.totalRows > LARGE_IMPORT_THRESHOLD) {
    console.warn(
      `[data-viz] Large dataset: ${queryResult.totalRows.toLocaleString()} rows. ` +
      'This may affect performance.',
    );
  }

  // Enforce row limit
  const rows = queryResult.rows.length > MAX_RESULT_ROWS
    ? queryResult.rows.slice(0, MAX_RESULT_ROWS)
    : queryResult.rows;

  // Build fields from query result metadata
  const fields: DataField[] = queryResult.fields.map((field) => {
    const type = mapSqlTypeToFieldType(field.dataType);
    const role = assignFieldRole(type);

    return {
      id: generateId(),
      name: field.name,
      originalName: field.name,
      type,
      role,
      sampleValues: computeSampleValues(rows, field.name),
      nullCount: computeNullCount(rows, field.name),
      uniqueCount: computeUniqueCount(rows, field.name),
    };
  });

  const dataSourceName = options.name || 'Query Result';

  return {
    id: generateId(),
    name: dataSourceName,
    fileName: dataSourceName,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
    sourceInfo: options.sourceInfo,
  };
}
