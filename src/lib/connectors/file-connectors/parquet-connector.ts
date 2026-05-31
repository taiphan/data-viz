import { parquetMetadataAsync, parquetSchema, parquetReadObjects } from 'hyparquet';
import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { MAX_RESULT_ROWS, LARGE_IMPORT_THRESHOLD } from '../constants';
import { generateId } from '../../data-engine';

// ============================================================
// PARQUET TYPE → FIELD TYPE MAPPING
// ============================================================

const PARQUET_INT_TYPES = new Set([
  'INT8', 'INT16', 'INT32', 'INT64',
  'UINT8', 'UINT16', 'UINT32', 'UINT64',
  'INT_8', 'INT_16', 'INT_32', 'INT_64',
  'UINT_8', 'UINT_16', 'UINT_32', 'UINT_64',
]);

const PARQUET_FLOAT_TYPES = new Set([
  'FLOAT', 'DOUBLE',
]);

const PARQUET_DATE_TYPES = new Set([
  'DATE', 'TIME_MILLIS', 'TIME_MICROS',
  'TIMESTAMP_MILLIS', 'TIMESTAMP_MICROS',
  'TIMESTAMP', 'TIME',
]);

const PARQUET_BOOLEAN_TYPES = new Set([
  'BOOLEAN',
]);

function mapParquetTypeToFieldType(
  physicalType: string,
  logicalType?: string,
): FieldType {
  const physical = (physicalType || '').toUpperCase();
  const logical = (logicalType || '').toUpperCase();

  // Check logical type first (more specific)
  if (logical) {
    if (PARQUET_BOOLEAN_TYPES.has(logical)) return 'boolean';
    if (PARQUET_DATE_TYPES.has(logical)) return 'date';
    if (PARQUET_INT_TYPES.has(logical)) return 'number';
    if (PARQUET_FLOAT_TYPES.has(logical)) return 'number';
    if (logical === 'DECIMAL') return 'number';
    if (logical === 'STRING' || logical === 'UTF8' || logical === 'ENUM') {
      return 'string';
    }
  }

  // Fall back to physical type
  if (PARQUET_BOOLEAN_TYPES.has(physical)) return 'boolean';
  if (physical === 'INT32' || physical === 'INT64') return 'number';
  if (physical === 'INT96') return 'date'; // INT96 is typically a timestamp
  if (PARQUET_FLOAT_TYPES.has(physical)) return 'number';
  if (physical === 'BYTE_ARRAY' || physical === 'FIXED_LEN_BYTE_ARRAY') {
    return 'string';
  }

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
// PARSE OPTIONS
// ============================================================

export interface ParquetParseOptions {
  /** Maximum number of rows to read. Defaults to MAX_RESULT_ROWS (1,000,000). */
  maxRows?: number;
  /** Specific columns to read. If omitted, reads all columns. */
  columns?: string[];
  /** Custom name for the resulting DataSource. */
  name?: string;
}

// ============================================================
// FILE → ASYNC BUFFER CONVERSION
// ============================================================

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

// ============================================================
// PARQUET FILE PARSER
// ============================================================

export async function parseParquetFile(
  input: File | ArrayBuffer,
  options: ParquetParseOptions = {},
): Promise<DataSource> {
  const maxRows = options.maxRows ?? MAX_RESULT_ROWS;

  // Convert File to ArrayBuffer if needed
  const buffer = input instanceof File
    ? await fileToArrayBuffer(input)
    : input;

  // ArrayBuffer satisfies the AsyncBuffer interface (byteLength + slice)
  const file = buffer;

  // Read metadata to get schema info and row count
  const metadata = await parquetMetadataAsync(file);
  const totalRows = Number(metadata.num_rows);
  const schema = parquetSchema(metadata);
  const columnNames = schema.children.map((child) => child.element.name);

  // Warn about large files
  if (totalRows > LARGE_IMPORT_THRESHOLD) {
    console.warn(
      `[data-viz] Large Parquet file: ${totalRows.toLocaleString()} rows. ` +
      'This may affect performance.',
    );
  }

  // Determine which columns to read
  const selectedColumns = options.columns
    ? options.columns.filter((col) => columnNames.includes(col))
    : columnNames;

  // Read row data with row limit enforcement
  const rowEnd = Math.min(totalRows, maxRows);
  const rows = await parquetReadObjects({
    file,
    columns: selectedColumns,
    rowStart: 0,
    rowEnd,
  }) as Record<string, unknown>[];

  // Build field definitions from schema
  const fields: DataField[] = selectedColumns.map((colName) => {
    const schemaChild = schema.children.find(
      (child) => child.element.name === colName,
    );

    // Extract type info from schema element
    const element = schemaChild?.element;
    const physicalType = element?.type || '';
    const logicalType = element?.logical_type?.type
      || element?.converted_type
      || '';

    const type = mapParquetTypeToFieldType(
      String(physicalType),
      String(logicalType),
    );
    const role = assignFieldRole(type);

    return {
      id: generateId(),
      name: colName,
      originalName: colName,
      type,
      role,
      sampleValues: computeSampleValues(rows, colName),
      nullCount: computeNullCount(rows, colName),
      uniqueCount: computeUniqueCount(rows, colName),
    };
  });

  // Determine DataSource name
  const sourceName = options.name
    || (input instanceof File ? input.name : 'Parquet Import');

  return {
    id: generateId(),
    name: sourceName,
    fileName: input instanceof File ? input.name : 'parquet-data.parquet',
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}
