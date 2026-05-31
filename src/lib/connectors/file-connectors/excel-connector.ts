import * as XLSX from 'xlsx';
import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { FileParseOptions } from '../types';
import { MAX_RESULT_ROWS } from '../constants';
import { generateId } from '../../data-engine';

// ============================================================
// EXCEL CONNECTOR — Client-side .xlsx/.xls parsing
// ============================================================

export interface ExcelParseOptions extends FileParseOptions {
  sheetName?: string;
  headerRow?: number;
}

// ============================================================
// TYPE DETECTION
// ============================================================

function detectFieldType(values: unknown[]): FieldType {
  let numberCount = 0;
  let dateCount = 0;
  let booleanCount = 0;
  let nonNullCount = 0;

  for (const val of values) {
    if (val === null || val === undefined || val === '') continue;
    nonNullCount++;

    if (typeof val === 'boolean') {
      booleanCount++;
    } else if (typeof val === 'number' || (typeof val === 'string' && isNumeric(val))) {
      numberCount++;
    } else if (val instanceof Date || isDateValue(val)) {
      dateCount++;
    }
  }

  if (nonNullCount === 0) return 'string';

  const threshold = nonNullCount * 0.8;

  if (booleanCount >= threshold) return 'boolean';
  if (dateCount >= threshold) return 'date';
  if (numberCount >= threshold) return 'number';

  return 'string';
}

function isNumeric(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
}

function isDateValue(value: unknown): boolean {
  if (typeof value === 'number') {
    // Excel serial date numbers (between 1 and 2958465 which is year 9999)
    return value > 0 && value < 2958465 && !Number.isInteger(value * 1000000);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return !isNaN(parsed) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value);
  }
  return value instanceof Date;
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
    if (val === null || val === undefined || val === '') {
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
// FILE READING UTILITY
// ============================================================

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  // Fallback for older browsers
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// INTERNAL PARSING (buffer-based, testable without browser APIs)
// ============================================================

export function getExcelSheetsFromBuffer(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames;
}

export function parseExcelBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  options: ExcelParseOptions = {},
): DataSource {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  return parseWorkbook(workbook, fileName, options);
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Returns the list of sheet names in an Excel file.
 */
export async function getExcelSheets(file: File): Promise<string[]> {
  const buffer = await readFileAsArrayBuffer(file);
  return getExcelSheetsFromBuffer(buffer);
}

/**
 * Parses an Excel file and converts a selected sheet into DataSource format.
 */
export async function parseExcelFile(
  file: File,
  options: ExcelParseOptions = {},
): Promise<DataSource> {
  const buffer = await readFileAsArrayBuffer(file);
  return parseExcelBuffer(buffer, file.name, options);
}

// ============================================================
// WORKBOOK PARSING
// ============================================================

function parseWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  options: ExcelParseOptions = {},
): DataSource {

  // Select sheet
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }

  // Determine header row (0-indexed in options, default 0 = first row)
  const headerRowIndex = options.headerRow ?? 0;

  // Convert sheet to JSON with header detection
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (rawData.length === 0) {
    return createEmptyDataSource(fileName, sheetName);
  }

  // Extract headers from the specified header row
  const headerRow = rawData[headerRowIndex] || [];
  const headers: string[] = headerRow.map((val, idx) =>
    val != null && String(val).trim() !== ''
      ? String(val).trim()
      : `Column ${idx + 1}`
  );

  // Extract data rows (everything after the header row)
  const dataStartIndex = headerRowIndex + 1;
  const rawRows = rawData.slice(dataStartIndex);

  // Convert to record format
  let rows: Record<string, unknown>[] = rawRows
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = idx < row.length ? row[idx] : null;
      });
      return record;
    });

  // Enforce row limit
  if (rows.length > MAX_RESULT_ROWS) {
    rows = rows.slice(0, MAX_RESULT_ROWS);
  }

  // Detect field types from data
  const fields: DataField[] = headers.map((header) => {
    const columnValues = rows.map((row) => row[header]);
    const type = detectFieldType(columnValues);
    const role = assignFieldRole(type);

    return {
      id: generateId(),
      name: header,
      originalName: header,
      type,
      role,
      sampleValues: computeSampleValues(rows, header),
      nullCount: computeNullCount(rows, header),
      uniqueCount: computeUniqueCount(rows, header),
    };
  });

  return {
    id: generateId(),
    name: `${fileName} — ${sheetName}`,
    fileName,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
    sourceInfo: {
      connectorId: 'excel',
      tableName: sheetName,
    },
  };
}

// ============================================================
// HELPERS
// ============================================================

function createEmptyDataSource(fileName: string, sheetName: string): DataSource {
  return {
    id: generateId(),
    name: `${fileName} — ${sheetName}`,
    fileName,
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: new Date().toISOString(),
    sourceInfo: {
      connectorId: 'excel',
      tableName: sheetName,
    },
  };
}
