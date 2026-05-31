import { describe, it, expect, vi } from 'vitest';

import { parseFile } from './index';

// ============================================================
// UNIFIED FILE CONNECTOR FACADE TESTS
// ============================================================

// Mock individual parsers to isolate facade routing logic
vi.mock('./delimited-text-connector', () => ({
  parseDelimitedFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    name: 'test',
    fileName: 'test.csv',
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
  parseDelimitedString: vi.fn(),
}));

vi.mock('./excel-connector', () => ({
  parseExcelFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    name: 'test',
    fileName: 'test.xlsx',
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
  getExcelSheets: vi.fn(),
  parseExcelBuffer: vi.fn(),
  getExcelSheetsFromBuffer: vi.fn(),
}));

vi.mock('./pdf-connector', () => ({
  parsePdfFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    name: 'test',
    fileName: 'test.pdf',
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
}));

vi.mock('./parquet-connector', () => ({
  parseParquetFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    name: 'test',
    fileName: 'test.parquet',
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
}));

vi.mock('./statistical-connector', () => ({
  parseStatisticalFile: vi.fn().mockResolvedValue({
    id: 'mock-id',
    name: 'test',
    fileName: 'test.sav',
    fields: [],
    rows: [],
    rowCount: 0,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
}));

function createMockFile(name: string, content: string = ''): File {
  return new File([content], name, { type: 'application/octet-stream' });
}

describe('parseFile — unified file connector facade', () => {
  describe('routing by extension', () => {
    it('routes .csv to delimited text parser', async () => {
      const { parseDelimitedFile } = await import('./delimited-text-connector');
      const file = createMockFile('data.csv');
      await parseFile(file);
      expect(parseDelimitedFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .tsv to delimited text parser', async () => {
      const { parseDelimitedFile } = await import('./delimited-text-connector');
      const file = createMockFile('data.tsv');
      await parseFile(file);
      expect(parseDelimitedFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .txt to delimited text parser', async () => {
      const { parseDelimitedFile } = await import('./delimited-text-connector');
      const file = createMockFile('data.txt');
      await parseFile(file);
      expect(parseDelimitedFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .xlsx to Excel parser', async () => {
      const { parseExcelFile } = await import('./excel-connector');
      const file = createMockFile('report.xlsx');
      await parseFile(file);
      expect(parseExcelFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .xls to Excel parser', async () => {
      const { parseExcelFile } = await import('./excel-connector');
      const file = createMockFile('report.xls');
      await parseFile(file);
      expect(parseExcelFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .pdf to PDF parser', async () => {
      const { parsePdfFile } = await import('./pdf-connector');
      const file = createMockFile('document.pdf');
      await parseFile(file);
      expect(parsePdfFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .parquet to Parquet parser', async () => {
      const { parseParquetFile } = await import('./parquet-connector');
      const file = createMockFile('data.parquet');
      await parseFile(file);
      expect(parseParquetFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .sav to statistical parser', async () => {
      const { parseStatisticalFile } = await import('./statistical-connector');
      const file = createMockFile('survey.sav');
      await parseFile(file);
      expect(parseStatisticalFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .dta to statistical parser', async () => {
      const { parseStatisticalFile } = await import('./statistical-connector');
      const file = createMockFile('panel.dta');
      await parseFile(file);
      expect(parseStatisticalFile).toHaveBeenCalledWith(file, expect.any(Object));
    });

    it('routes .sas7bdat to statistical parser', async () => {
      const { parseStatisticalFile } = await import('./statistical-connector');
      const file = createMockFile('clinical.sas7bdat');
      await parseFile(file);
      expect(parseStatisticalFile).toHaveBeenCalledWith(file, expect.any(Object));
    });
  });

  describe('JSON parsing', () => {
    it('parses a JSON array file into DataSource', async () => {
      const jsonData = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
      const file = createMockFile('users.json', jsonData);
      const result = await parseFile(file);

      expect(result.name).toBe('users');
      expect(result.fileName).toBe('users.json');
      expect(result.rowCount).toBe(2);
      expect(result.fields).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 });
    });

    it('parses a JSON object with nested array', async () => {
      const jsonData = JSON.stringify({
        meta: { total: 2 },
        results: [
          { id: 1, value: 'x' },
          { id: 2, value: 'y' },
        ],
      });
      const file = createMockFile('api-response.json', jsonData);
      const result = await parseFile(file);

      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({ id: 1, value: 'x' });
    });

    it('wraps a single JSON object as one row', async () => {
      const jsonData = JSON.stringify({ key: 'val', count: 42 });
      const file = createMockFile('single.json', jsonData);
      const result = await parseFile(file);

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]).toEqual({ key: 'val', count: 42 });
    });

    it('returns empty DataSource for empty JSON array', async () => {
      const file = createMockFile('empty.json', '[]');
      const result = await parseFile(file);

      expect(result.rowCount).toBe(0);
      expect(result.fields).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    });

    it('detects field types correctly from JSON values', async () => {
      const jsonData = JSON.stringify([
        { name: 'A', amount: 100, active: true, created: '2024-01-15T10:00:00Z' },
        { name: 'B', amount: 200, active: false, created: '2024-02-20T12:00:00Z' },
      ]);
      const file = createMockFile('typed.json', jsonData);
      const result = await parseFile(file);

      const nameField = result.fields.find((f) => f.name === 'name');
      const amountField = result.fields.find((f) => f.name === 'amount');
      const activeField = result.fields.find((f) => f.name === 'active');
      const createdField = result.fields.find((f) => f.name === 'created');

      expect(nameField?.type).toBe('string');
      expect(amountField?.type).toBe('number');
      expect(activeField?.type).toBe('boolean');
      expect(createdField?.type).toBe('date');
    });
  });

  describe('unsupported file types', () => {
    it('throws for unsupported extension', async () => {
      const file = createMockFile('image.png');
      await expect(parseFile(file)).rejects.toThrow('Unsupported file type');
    });

    it('throws for file with no extension', async () => {
      const file = createMockFile('noextension');
      await expect(parseFile(file)).rejects.toThrow('Unsupported file type');
    });

    it('includes supported formats in error message', async () => {
      const file = createMockFile('data.xml');
      await expect(parseFile(file)).rejects.toThrow('.csv');
    });
  });

  describe('options forwarding', () => {
    it('forwards delimiter option to delimited parser', async () => {
      const { parseDelimitedFile } = await import('./delimited-text-connector');
      const file = createMockFile('data.csv');
      await parseFile(file, { delimiter: '|' });
      expect(parseDelimitedFile).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ delimiter: '|' }),
      );
    });

    it('forwards sheetName option to Excel parser', async () => {
      const { parseExcelFile } = await import('./excel-connector');
      const file = createMockFile('report.xlsx');
      await parseFile(file, { sheetName: 'Sheet2' });
      expect(parseExcelFile).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ sheetName: 'Sheet2' }),
      );
    });

    it('forwards maxRows option to Parquet parser', async () => {
      const { parseParquetFile } = await import('./parquet-connector');
      const file = createMockFile('data.parquet');
      await parseFile(file, { maxRows: 500 });
      expect(parseParquetFile).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ maxRows: 500 }),
      );
    });
  });
});
