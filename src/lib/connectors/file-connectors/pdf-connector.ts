import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { generateId } from '../../data-engine';

// ============================================================
// PDF CONNECTOR — Extract tabular data from PDF files
// ============================================================

export interface PdfParseOptions {
  headerRow?: number; // 0-based index of the header row (default: 0)
  pages?: number[]; // Specific pages to parse (1-based); empty = all pages
  columnGapThreshold?: number; // Min horizontal gap to detect column boundary
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedTable {
  headers: string[];
  rows: string[][];
}

// ============================================================
// TYPE DETECTION (mirrors data-engine logic)
// ============================================================

function detectFieldType(values: string[]): FieldType {
  const nonEmpty = values.filter((v) => v !== '' && v != null);
  if (nonEmpty.length === 0) return 'string';

  const allNumbers = nonEmpty.every(
    (v) => !isNaN(Number(v.replace(/[,$%]/g, ''))) && v.trim() !== '',
  );
  if (allNumbers) return 'number';

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{2}-\d{2}-\d{4}/,
  ];
  const allDates = nonEmpty.every((v) =>
    datePatterns.some((p) => p.test(v.trim())),
  );
  if (allDates) return 'date';

  const boolValues = new Set(['true', 'false', '0', '1', 'yes', 'no']);
  const allBooleans = nonEmpty.every((v) =>
    boolValues.has(v.toLowerCase().trim()),
  );
  if (allBooleans) return 'boolean';

  return 'string';
}

function assignFieldRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

// ============================================================
// TEXT EXTRACTION FROM PDF
// ============================================================

async function extractTextItems(
  file: File,
  pages?: number[],
): Promise<TextItem[][]> {
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source for browser environment
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = pdf.numPages;
  const pagesToProcess = pages && pages.length > 0
    ? pages.filter((p) => p >= 1 && p <= pageCount)
    : Array.from({ length: pageCount }, (_, i) => i + 1);

  const allPageItems: TextItem[][] = [];

  for (const pageNum of pagesToProcess) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const items: TextItem[] = [];
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;

      const typedItem = item as {
        str: string;
        transform: number[];
        width: number;
        height: number;
      };

      // transform[4] = x, transform[5] = y (PDF coordinate system)
      const x = typedItem.transform[4];
      // Flip y-coordinate (PDF origin is bottom-left)
      const y = viewport.height - typedItem.transform[5];

      items.push({
        str: typedItem.str.trim(),
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: typedItem.width,
        height: typedItem.height,
      });
    }

    allPageItems.push(items);
  }

  return allPageItems;
}

// ============================================================
// TABLE DETECTION — Analyze text positions to find tabular data
// ============================================================

function groupItemsByRow(
  items: TextItem[],
  rowTolerance: number = 3,
): TextItem[][] {
  if (items.length === 0) return [];

  // Sort by y position (top to bottom), then x (left to right)
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= rowTolerance) {
      currentRow.push(item);
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    }
  }
  rows.push(currentRow);

  return rows;
}

function detectColumnBoundaries(
  rows: TextItem[][],
  gapThreshold: number = 15,
): number[] {
  // Collect all x-positions across rows to find consistent column starts
  const xPositions: number[] = [];
  for (const row of rows) {
    for (const item of row) {
      xPositions.push(item.x);
    }
  }

  if (xPositions.length === 0) return [];

  xPositions.sort((a, b) => a - b);

  // Cluster x-positions to find column boundaries
  const clusters: number[] = [xPositions[0]];
  for (let i = 1; i < xPositions.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    if (xPositions[i] - lastCluster > gapThreshold) {
      clusters.push(xPositions[i]);
    } else {
      // Update cluster center (running average)
      clusters[clusters.length - 1] =
        (lastCluster + xPositions[i]) / 2;
    }
  }

  return clusters;
}

function assignItemsToColumns(
  row: TextItem[],
  columnBoundaries: number[],
  gapThreshold: number = 15,
): string[] {
  const cells: string[] = new Array(columnBoundaries.length).fill('');

  for (const item of row) {
    // Find the closest column boundary
    let bestCol = 0;
    let bestDist = Math.abs(item.x - columnBoundaries[0]);

    for (let c = 1; c < columnBoundaries.length; c++) {
      const dist = Math.abs(item.x - columnBoundaries[c]);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = c;
      }
    }

    // Only assign if within reasonable distance
    if (bestDist <= gapThreshold * 2) {
      cells[bestCol] = cells[bestCol]
        ? `${cells[bestCol]} ${item.str}`
        : item.str;
    }
  }

  return cells;
}

function detectTable(
  pageItems: TextItem[],
  options: PdfParseOptions = {},
): DetectedTable | null {
  const gapThreshold = options.columnGapThreshold ?? 15;
  const headerRowIndex = options.headerRow ?? 0;

  const rows = groupItemsByRow(pageItems);
  if (rows.length < 2) return null; // Need at least header + 1 data row

  // Detect column boundaries from all rows
  const columnBoundaries = detectColumnBoundaries(rows, gapThreshold);
  if (columnBoundaries.length < 2) return null; // Need at least 2 columns for a table

  // Convert text items to cell values using column boundaries
  const tableRows: string[][] = rows.map((row) =>
    assignItemsToColumns(row, columnBoundaries, gapThreshold),
  );

  // Filter out rows that are mostly empty (non-table content)
  const filteredRows = tableRows.filter((row) => {
    const nonEmptyCells = row.filter((cell) => cell.trim() !== '');
    return nonEmptyCells.length >= Math.ceil(columnBoundaries.length / 2);
  });

  if (filteredRows.length < 2) return null;

  // Extract headers and data rows
  const headers = filteredRows[headerRowIndex].map((h, i) =>
    h.trim() || `Column ${i + 1}`,
  );
  const dataRows = filteredRows.slice(headerRowIndex + 1);

  return { headers, rows: dataRows };
}

// ============================================================
// MAIN EXPORT — parsePdfFile
// ============================================================

export async function parsePdfFile(
  file: File,
  options: PdfParseOptions = {},
): Promise<DataSource> {
  const pageItems = await extractTextItems(file, options.pages);

  // Detect tables from all pages and merge
  const allHeaders: string[] = [];
  const allRows: string[][] = [];

  for (const items of pageItems) {
    const table = detectTable(items, options);
    if (!table) continue;

    if (allHeaders.length === 0) {
      // First table sets the headers
      allHeaders.push(...table.headers);
      allRows.push(...table.rows);
    } else if (
      table.headers.length === allHeaders.length &&
      table.headers.every((h, i) => h === allHeaders[i])
    ) {
      // Same structure — append rows (multi-page continuation)
      allRows.push(...table.rows);
    } else if (table.headers.length === allHeaders.length) {
      // Same column count but different headers — treat as data continuation
      allRows.push(...table.rows);
    }
  }

  if (allHeaders.length === 0) {
    // No table detected — return empty DataSource
    return {
      id: generateId(),
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      fields: [],
      rows: [],
      rowCount: 0,
      importedAt: new Date().toISOString(),
    };
  }

  // Build rows as Record<string, unknown>[]
  const parsedRows: Record<string, unknown>[] = allRows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let i = 0; i < allHeaders.length; i++) {
      record[allHeaders[i]] = row[i]?.trim() ?? '';
    }
    return record;
  });

  // Detect field types from sample values
  const fields: DataField[] = allHeaders.map((header) => {
    const columnValues = parsedRows
      .slice(0, 100)
      .map((row) => String(row[header] ?? ''));
    const type = detectFieldType(columnValues);
    const role = assignFieldRole(type);

    const sampleValues = new Set<string>();
    for (const row of parsedRows) {
      if (sampleValues.size >= 20) break;
      const val = row[header];
      if (val != null && String(val) !== '') {
        sampleValues.add(String(val));
      }
    }

    let nullCount = 0;
    const uniqueValues = new Set<unknown>();
    for (const row of parsedRows) {
      const val = row[header];
      if (val === null || val === undefined || val === '') {
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

  // Convert numeric string values to actual numbers
  const typedRows = parsedRows.map((row) => {
    const typedRow: Record<string, unknown> = {};
    for (const field of fields) {
      const val = row[field.name];
      if (field.type === 'number' && val !== '' && val != null) {
        const numVal = Number(String(val).replace(/[,$%]/g, ''));
        typedRow[field.name] = isNaN(numVal) ? val : numVal;
      } else {
        typedRow[field.name] = val;
      }
    }
    return typedRow;
  });

  return {
    id: generateId(),
    name: file.name.replace(/\.pdf$/i, ''),
    fileName: file.name,
    fields,
    rows: typedRows,
    rowCount: typedRows.length,
    importedAt: new Date().toISOString(),
  };
}
