import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { generateId } from '../../data-engine';
import { parseDelimitedFile, DelimitedTextOptions } from './delimited-text-connector';
import { parseExcelFile, ExcelParseOptions } from './excel-connector';
import { parsePdfFile, PdfParseOptions } from './pdf-connector';
import { parseParquetFile, ParquetParseOptions } from './parquet-connector';
import { parseStatisticalFile, StatisticalParseOptions } from './statistical-connector';

// ============================================================
// UNIFIED FILE CONNECTOR FACADE
// Routes to appropriate parser based on file extension/MIME type
// ============================================================

// Re-export individual parsers for direct access
export { parseDelimitedFile, parseDelimitedString } from './delimited-text-connector';
export type { DelimitedTextOptions } from './delimited-text-connector';
export { parseExcelFile, getExcelSheets, parseExcelBuffer, getExcelSheetsFromBuffer } from './excel-connector';
export type { ExcelParseOptions } from './excel-connector';
export { parsePdfFile } from './pdf-connector';
export type { PdfParseOptions } from './pdf-connector';
export { parseParquetFile } from './parquet-connector';
export type { ParquetParseOptions } from './parquet-connector';
export { parseStatisticalFile } from './statistical-connector';
export type { StatisticalParseOptions } from './statistical-connector';

// ============================================================
// FILE TYPE DETECTION
// ============================================================

type FileCategory =
  | 'delimited'
  | 'excel'
  | 'pdf'
  | 'parquet'
  | 'statistical'
  | 'json';

const EXTENSION_MAP: Record<string, FileCategory> = {
  csv: 'delimited',
  tsv: 'delimited',
  txt: 'delimited',
  xlsx: 'excel',
  xls: 'excel',
  pdf: 'pdf',
  parquet: 'parquet',
  sav: 'statistical',
  dta: 'statistical',
  sas7bdat: 'statistical',
  json: 'json',
};

const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_MAP);

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function detectFileCategory(file: File): FileCategory {
  const extension = getFileExtension(file.name);
  const category = EXTENSION_MAP[extension];

  if (category) return category;

  throw new Error(
    `Unsupported file type: ".${extension || '(none)'}". ` +
    `Supported formats: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`,
  );
}

// ============================================================
// PARSE OPTIONS (unified)
// ============================================================

export interface FileConnectorOptions {
  /** Delimiter for CSV/TSV/TXT files */
  delimiter?: string;
  /** Quote character for delimited files */
  quoteChar?: string;
  /** File encoding (default: UTF-8) */
  encoding?: string;
  /** Sheet name for Excel files */
  sheetName?: string;
  /** Header row index (0-based) */
  headerRow?: number;
  /** Maximum rows to import */
  maxRows?: number;
  /** Specific pages to parse for PDF (1-based) */
  pages?: number[];
  /** Column gap threshold for PDF table detection */
  columnGapThreshold?: number;
  /** Specific columns to read for Parquet */
  columns?: string[];
}

// ============================================================
// JSON PARSER
// ============================================================

function detectFieldTypeFromValue(value: unknown): FieldType {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  }
  return 'string';
}

function detectFieldTypeFromColumn(values: unknown[]): FieldType {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  if (nonNull.length === 0) return 'string';

  const typeCounts: Record<FieldType, number> = {
    string: 0,
    number: 0,
    date: 0,
    boolean: 0,
  };

  for (const val of nonNull) {
    const type = detectFieldTypeFromValue(val);
    typeCounts[type]++;
  }

  const threshold = nonNull.length * 0.8;
  if (typeCounts.boolean >= threshold) return 'boolean';
  if (typeCounts.date >= threshold) return 'date';
  if (typeCounts.number >= threshold) return 'number';
  return 'string';
}

function assignRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

async function parseJsonFile(file: File): Promise<DataSource> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  let rows: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    rows = parsed.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    );
  } else if (typeof parsed === 'object' && parsed !== null) {
    // Try to find an array property in the object
    const arrayProp = Object.values(parsed).find(
      (val) => Array.isArray(val) && val.length > 0,
    ) as unknown[] | undefined;

    if (arrayProp) {
      rows = arrayProp.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    } else {
      // Single object — wrap in array
      rows = [parsed as Record<string, unknown>];
    }
  } else {
    throw new Error(`Invalid JSON structure in "${file.name}": expected array or object.`);
  }

  if (rows.length === 0) {
    return {
      id: generateId(),
      name: file.name.replace(/\.json$/i, ''),
      fileName: file.name,
      fields: [],
      rows: [],
      rowCount: 0,
      importedAt: new Date().toISOString(),
    };
  }

  // Collect all unique keys across rows
  const allKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }

  const headers = Array.from(allKeys);
  const sampleSize = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, sampleSize);

  const fields: DataField[] = headers.map((header) => {
    const columnValues = sampleRows.map((row) => row[header]);
    const type = detectFieldTypeFromColumn(columnValues);
    const role = assignRole(type);

    const sampleValues = new Set<string>();
    for (const row of rows) {
      if (sampleValues.size >= 20) break;
      const val = row[header];
      if (val != null) {
        sampleValues.add(String(val));
      }
    }

    let nullCount = 0;
    const uniqueValues = new Set<unknown>();
    for (const row of rows) {
      const val = row[header];
      if (val === null || val === undefined) {
        nullCount++;
      }
      uniqueValues.add(val);
    }

    return {
      id: generateId(),
      name: header,
      originalName: header,
      type,
      role,
      sampleValues: Array.from(sampleValues),
      nullCount,
      uniqueCount: uniqueValues.size,
    };
  });

  return {
    id: generateId(),
    name: file.name.replace(/\.json$/i, ''),
    fileName: file.name,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}

// ============================================================
// MAIN FACADE — parseFile
// ============================================================

/**
 * Unified file parser that routes to the appropriate connector
 * based on file extension.
 *
 * @param file - The File object to parse
 * @param options - Optional parsing configuration
 * @returns Parsed DataSource ready for the workbook store
 */
export async function parseFile(
  file: File,
  options: FileConnectorOptions = {},
): Promise<DataSource> {
  const category = detectFileCategory(file);

  switch (category) {
    case 'delimited': {
      const delimitedOptions: DelimitedTextOptions = {
        delimiter: options.delimiter,
        quoteChar: options.quoteChar,
        encoding: options.encoding,
        header: options.headerRow !== undefined ? options.headerRow === 0 : true,
      };
      return parseDelimitedFile(file, delimitedOptions);
    }

    case 'excel': {
      const excelOptions: ExcelParseOptions = {
        sheetName: options.sheetName,
        headerRow: options.headerRow,
      };
      return parseExcelFile(file, excelOptions);
    }

    case 'pdf': {
      const pdfOptions: PdfParseOptions = {
        headerRow: options.headerRow,
        pages: options.pages,
        columnGapThreshold: options.columnGapThreshold,
      };
      return parsePdfFile(file, pdfOptions);
    }

    case 'parquet': {
      const parquetOptions: ParquetParseOptions = {
        maxRows: options.maxRows,
        columns: options.columns,
      };
      return parseParquetFile(file, parquetOptions);
    }

    case 'statistical': {
      const statOptions: StatisticalParseOptions = {
        maxRows: options.maxRows,
        encoding: options.encoding,
      };
      return parseStatisticalFile(file, statOptions);
    }

    case 'json': {
      return parseJsonFile(file);
    }
  }
}
