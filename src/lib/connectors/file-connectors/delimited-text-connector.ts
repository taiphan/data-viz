import Papa from 'papaparse';
import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { generateId } from '../../data-engine';

// ============================================================
// DELIMITED TEXT CONNECTOR — CSV/TSV/TXT Parser (PapaParse)
// ============================================================

export interface DelimitedTextOptions {
  delimiter?: string; // Auto-detect if not specified
  quoteChar?: string; // Default: '"'
  encoding?: string; // Default: 'UTF-8'
  header?: boolean; // Default: true (first row is header)
}

interface ParsedColumn {
  name: string;
  type: FieldType;
  role: FieldRole;
}

// ============================================================
// TYPE DETECTION
// ============================================================

const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DATE_SLASH_REGEX = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const DATE_DOT_REGEX = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

function isDateValue(value: string): boolean {
  return (
    ISO_DATE_REGEX.test(value) ||
    DATE_SLASH_REGEX.test(value) ||
    DATE_DOT_REGEX.test(value)
  );
}

function isBooleanValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'true' || lower === 'false';
}

function isNumericValue(value: string): boolean {
  if (value === '') return false;
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

function detectColumnType(values: unknown[]): FieldType {
  let numericCount = 0;
  let dateCount = 0;
  let booleanCount = 0;
  let nonNullCount = 0;

  for (const val of values) {
    if (val === null || val === undefined || val === '') continue;
    nonNullCount++;
    const str = String(val);

    if (isBooleanValue(str)) {
      booleanCount++;
    } else if (isNumericValue(str)) {
      numericCount++;
    } else if (isDateValue(str)) {
      dateCount++;
    }
  }

  if (nonNullCount === 0) return 'string';

  const threshold = nonNullCount * 0.8;

  if (booleanCount >= threshold) return 'boolean';
  if (dateCount >= threshold) return 'date';
  if (numericCount >= threshold) return 'number';

  return 'string';
}

function assignRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

// ============================================================
// FIELD STATISTICS
// ============================================================

function computeSampleValues(rows: Record<string, unknown>[], field: string): string[] {
  const unique = new Set<string>();
  for (const row of rows) {
    if (unique.size >= 20) break;
    const val = row[field];
    if (val != null && val !== '') {
      unique.add(String(val));
    }
  }
  return [...unique];
}

function computeNullCount(rows: Record<string, unknown>[], field: string): number {
  let count = 0;
  for (const row of rows) {
    const val = row[field];
    if (val === null || val === undefined || val === '') {
      count++;
    }
  }
  return count;
}

function computeUniqueCount(rows: Record<string, unknown>[], field: string): number {
  const unique = new Set<unknown>();
  for (const row of rows) {
    unique.add(row[field]);
  }
  return unique.size;
}

// ============================================================
// COLUMN ANALYSIS
// ============================================================

function analyzeColumns(
  rows: Record<string, unknown>[],
  headers: string[],
): ParsedColumn[] {
  const sampleSize = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, sampleSize);

  return headers.map((name) => {
    const values = sampleRows.map((row) => row[name]);
    const type = detectColumnType(values);
    const role = assignRole(type);
    return { name, type, role };
  });
}

// ============================================================
// BUILD DATA SOURCE
// ============================================================

function buildDataSource(
  rows: Record<string, unknown>[],
  columns: ParsedColumn[],
  fileName: string,
): DataSource {
  const fields: DataField[] = columns.map((col) => ({
    id: generateId(),
    name: col.name,
    originalName: col.name,
    type: col.type,
    role: col.role,
    sampleValues: computeSampleValues(rows, col.name),
    nullCount: computeNullCount(rows, col.name),
    uniqueCount: computeUniqueCount(rows, col.name),
  }));

  return {
    id: generateId(),
    name: fileName.replace(/\.[^/.]+$/, ''),
    fileName,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}

// ============================================================
// FILE READING
// ============================================================

function readFileAsText(file: File, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
    reader.readAsText(file, encoding);
  });
}

// ============================================================
// PARSE FROM STRING (testable, also used internally)
// ============================================================

export function parseDelimitedString(
  content: string,
  fileName: string,
  options: DelimitedTextOptions = {},
): DataSource {
  const {
    delimiter,
    quoteChar = '"',
    header = true,
  } = options;

  if (!content.trim()) {
    return buildDataSource([], [], fileName);
  }

  const result = Papa.parse(content, {
    delimiter: delimiter || undefined, // undefined = auto-detect
    quoteChar,
    header,
    skipEmptyLines: true,
    dynamicTyping: false, // We handle type detection ourselves
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(
      `Failed to parse "${fileName}": ${result.errors[0].message}`,
    );
  }

  let rows: Record<string, unknown>[];
  let headers: string[];

  if (header) {
    rows = result.data as Record<string, unknown>[];
    headers = result.meta.fields || [];
  } else {
    const rawRows = result.data as unknown[][];
    if (rawRows.length === 0) {
      return buildDataSource([], [], fileName);
    }
    headers = rawRows[0].map((_, i) => `Column ${i + 1}`);
    rows = rawRows.map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        record[h] = row[i] ?? null;
      });
      return record;
    });
  }

  if (rows.length === 0) {
    return buildDataSource([], [], fileName);
  }

  const columns = analyzeColumns(rows, headers);
  return buildDataSource(rows, columns, fileName);
}

// ============================================================
// MAIN PARSE FUNCTION
// ============================================================

export async function parseDelimitedFile(
  file: File,
  options: DelimitedTextOptions = {},
): Promise<DataSource> {
  const { encoding = 'UTF-8' } = options;

  const content = await readFileAsText(file, encoding);
  return parseDelimitedString(content, file.name, options);
}
