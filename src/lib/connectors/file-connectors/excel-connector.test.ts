import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  getExcelSheetsFromBuffer,
  parseExcelBuffer,
} from './excel-connector';

// ============================================================
// HELPERS — Create xlsx buffers for testing
// ============================================================

function createExcelBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, ws, name);
  }
  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return output as ArrayBuffer;
}

// ============================================================
// TESTS
// ============================================================

describe('excel-connector', () => {
  describe('getExcelSheetsFromBuffer', () => {
    it('returns all sheet names from a workbook', () => {
      const buffer = createExcelBuffer({
        'Sales': [['Name', 'Amount'], ['Alice', 100]],
        'Inventory': [['Item', 'Qty'], ['Widget', 50]],
        'Summary': [['Total'], [150]],
      });

      const sheets = getExcelSheetsFromBuffer(buffer);
      expect(sheets).toEqual(['Sales', 'Inventory', 'Summary']);
    });

    it('returns a single sheet name for single-sheet workbook', () => {
      const buffer = createExcelBuffer({
        'Sheet1': [['A'], [1]],
      });

      const sheets = getExcelSheetsFromBuffer(buffer);
      expect(sheets).toEqual(['Sheet1']);
    });
  });

  describe('parseExcelBuffer', () => {
    it('parses a basic sheet with headers and data', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['Name', 'Age', 'Active'],
          ['Alice', 30, true],
          ['Bob', 25, false],
          ['Charlie', 35, true],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');

      expect(result.fileName).toBe('test.xlsx');
      expect(result.name).toBe('test.xlsx — Data');
      expect(result.rowCount).toBe(3);
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0].name).toBe('Name');
      expect(result.fields[0].type).toBe('string');
      expect(result.fields[0].role).toBe('dimension');
      expect(result.fields[1].name).toBe('Age');
      expect(result.fields[1].type).toBe('number');
      expect(result.fields[1].role).toBe('measure');
      expect(result.fields[2].name).toBe('Active');
      expect(result.fields[2].type).toBe('boolean');
      expect(result.fields[2].role).toBe('dimension');
    });

    it('uses the first sheet by default', () => {
      const buffer = createExcelBuffer({
        'First': [['Col1'], ['val1']],
        'Second': [['Col2'], ['val2']],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.name).toContain('First');
      expect(result.rows[0]['Col1']).toBe('val1');
    });

    it('parses a specific sheet when sheetName is provided', () => {
      const buffer = createExcelBuffer({
        'First': [['Col1'], ['val1']],
        'Second': [['Col2'], ['val2']],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx', { sheetName: 'Second' });
      expect(result.name).toContain('Second');
      expect(result.rows[0]['Col2']).toBe('val2');
    });

    it('throws error for non-existent sheet', () => {
      const buffer = createExcelBuffer({
        'Sheet1': [['A'], [1]],
      });

      expect(() =>
        parseExcelBuffer(buffer, 'test.xlsx', { sheetName: 'NonExistent' }),
      ).toThrow('Sheet "NonExistent" not found in workbook');
    });

    it('handles empty sheet gracefully', () => {
      const buffer = createExcelBuffer({
        'Empty': [],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.rowCount).toBe(0);
      expect(result.fields).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    });

    it('generates column names for missing headers', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['Name', null, 'Value'],
          ['Alice', 'extra', 100],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.fields[0].name).toBe('Name');
      expect(result.fields[1].name).toBe('Column 2');
      expect(result.fields[2].name).toBe('Value');
    });

    it('respects custom headerRow option', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['Metadata row - ignore'],
          ['Name', 'Score'],
          ['Alice', 95],
          ['Bob', 87],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx', { headerRow: 1 });
      expect(result.fields[0].name).toBe('Name');
      expect(result.fields[1].name).toBe('Score');
      expect(result.rowCount).toBe(2);
    });

    it('detects number type from numeric data', () => {
      const buffer = createExcelBuffer({
        'Numbers': [
          ['Value'],
          [10],
          [20.5],
          [30],
          [40],
          [50],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.fields[0].type).toBe('number');
      expect(result.fields[0].role).toBe('measure');
    });

    it('skips empty rows in data', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['Name', 'Value'],
          ['Alice', 10],
          [null, null],
          ['Bob', 20],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.rowCount).toBe(2);
    });

    it('computes field statistics correctly', () => {
      const buffer = createExcelBuffer({
        'Stats': [
          ['Category', 'Amount'],
          ['A', 100],
          ['B', 200],
          ['A', 300],
          ['C', null],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      const categoryField = result.fields.find((f) => f.name === 'Category');
      const amountField = result.fields.find((f) => f.name === 'Amount');

      expect(categoryField!.uniqueCount).toBe(3); // A, B, C
      expect(categoryField!.nullCount).toBe(0);
      expect(amountField!.nullCount).toBe(1);
    });

    it('sets sourceInfo with excel connector id', () => {
      const buffer = createExcelBuffer({
        'Sheet1': [['A'], [1]],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.sourceInfo).toEqual({
        connectorId: 'excel',
        tableName: 'Sheet1',
      });
    });

    it('sets importedAt as ISO timestamp', () => {
      const buffer = createExcelBuffer({
        'Sheet1': [['A'], [1]],
      });

      const before = new Date().toISOString();
      const result = parseExcelBuffer(buffer, 'test.xlsx');
      const after = new Date().toISOString();

      expect(result.importedAt >= before).toBe(true);
      expect(result.importedAt <= after).toBe(true);
    });

    it('preserves original column names in field metadata', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['First Name', 'Last Name', 'Total Sales'],
          ['Alice', 'Smith', 1000],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      expect(result.fields[0].originalName).toBe('First Name');
      expect(result.fields[1].originalName).toBe('Last Name');
      expect(result.fields[2].originalName).toBe('Total Sales');
    });

    it('generates unique IDs for each field', () => {
      const buffer = createExcelBuffer({
        'Data': [
          ['A', 'B', 'C'],
          [1, 2, 3],
        ],
      });

      const result = parseExcelBuffer(buffer, 'test.xlsx');
      const ids = result.fields.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
