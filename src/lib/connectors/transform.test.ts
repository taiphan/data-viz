import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryResultToDataSource } from './transform';
import { QueryResult } from './types';
import { MAX_RESULT_ROWS, LARGE_IMPORT_THRESHOLD } from './constants';

describe('queryResultToDataSource', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  const makeQueryResult = (overrides: Partial<QueryResult> = {}): QueryResult => ({
    fields: [
      { name: 'id', dataType: 'integer' },
      { name: 'name', dataType: 'varchar(255)' },
      { name: 'amount', dataType: 'decimal(10,2)' },
      { name: 'created_at', dataType: 'timestamp' },
      { name: 'active', dataType: 'boolean' },
    ],
    rows: [
      { id: 1, name: 'Alice', amount: 100.5, created_at: '2024-01-01T00:00:00Z', active: true },
      { id: 2, name: 'Bob', amount: 200.75, created_at: '2024-02-01T00:00:00Z', active: false },
      { id: 3, name: null, amount: null, created_at: null, active: null },
    ],
    rowCount: 3,
    totalRows: 3,
    executionTimeMs: 42,
    truncated: false,
    ...overrides,
  });

  it('transforms a basic QueryResult into a DataSource', () => {
    const result = queryResultToDataSource(makeQueryResult());

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Query Result');
    expect(result.fileName).toBe('Query Result');
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.fields).toHaveLength(5);
  });

  it('maps SQL types to correct FieldTypes', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const fieldMap = Object.fromEntries(result.fields.map((f) => [f.name, f]));
    expect(fieldMap['id'].type).toBe('number');
    expect(fieldMap['name'].type).toBe('string');
    expect(fieldMap['amount'].type).toBe('number');
    expect(fieldMap['created_at'].type).toBe('date');
    expect(fieldMap['active'].type).toBe('boolean');
  });

  it('assigns roles correctly: numeric → measure, others → dimension', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const fieldMap = Object.fromEntries(result.fields.map((f) => [f.name, f]));
    expect(fieldMap['id'].role).toBe('measure');
    expect(fieldMap['name'].role).toBe('dimension');
    expect(fieldMap['amount'].role).toBe('measure');
    expect(fieldMap['created_at'].role).toBe('dimension');
    expect(fieldMap['active'].role).toBe('dimension');
  });

  it('preserves original column names', () => {
    const result = queryResultToDataSource(makeQueryResult());

    for (const field of result.fields) {
      expect(field.originalName).toBe(field.name);
    }
    expect(result.fields.map((f) => f.name)).toEqual([
      'id', 'name', 'amount', 'created_at', 'active',
    ]);
  });

  it('generates unique field IDs', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const ids = result.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('computes sampleValues from row data', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const nameField = result.fields.find((f) => f.name === 'name')!;
    expect(nameField.sampleValues).toContain('Alice');
    expect(nameField.sampleValues).toContain('Bob');
  });

  it('computes nullCount correctly', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const nameField = result.fields.find((f) => f.name === 'name')!;
    expect(nameField.nullCount).toBe(1);

    const idField = result.fields.find((f) => f.name === 'id')!;
    expect(idField.nullCount).toBe(0);
  });

  it('computes uniqueCount correctly', () => {
    const result = queryResultToDataSource(makeQueryResult());

    const nameField = result.fields.find((f) => f.name === 'name')!;
    // 'Alice', 'Bob', null → 3 unique values
    expect(nameField.uniqueCount).toBe(3);
  });

  it('enforces MAX_RESULT_ROWS limit', () => {
    const largeRows = Array.from({ length: MAX_RESULT_ROWS + 100 }, (_, i) => ({
      id: i,
      name: `row-${i}`,
      amount: i * 1.5,
      created_at: '2024-01-01T00:00:00Z',
      active: true,
    }));

    const result = queryResultToDataSource(makeQueryResult({
      rows: largeRows,
      rowCount: largeRows.length,
      totalRows: largeRows.length,
    }));

    expect(result.rows).toHaveLength(MAX_RESULT_ROWS);
    expect(result.rowCount).toBe(MAX_RESULT_ROWS);
  });

  it('warns when totalRows exceeds LARGE_IMPORT_THRESHOLD', () => {
    queryResultToDataSource(makeQueryResult({
      totalRows: LARGE_IMPORT_THRESHOLD + 1,
    }));

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Large dataset'),
    );
  });

  it('does not warn when totalRows is below threshold', () => {
    queryResultToDataSource(makeQueryResult({
      totalRows: 1000,
    }));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('uses custom name from options', () => {
    const result = queryResultToDataSource(makeQueryResult(), {
      name: 'Sales Data',
    });

    expect(result.name).toBe('Sales Data');
    expect(result.fileName).toBe('Sales Data');
  });

  it('attaches sourceInfo from options', () => {
    const sourceInfo = {
      connectorId: 'postgresql',
      tableName: 'orders',
      schemaName: 'public',
    };

    const result = queryResultToDataSource(makeQueryResult(), { sourceInfo });

    expect(result.sourceInfo).toEqual(sourceInfo);
  });

  it('handles empty rows gracefully', () => {
    const result = queryResultToDataSource(makeQueryResult({
      rows: [],
      rowCount: 0,
      totalRows: 0,
    }));

    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
    expect(result.fields).toHaveLength(5);
    result.fields.forEach((field) => {
      expect(field.sampleValues).toEqual([]);
      expect(field.nullCount).toBe(0);
      expect(field.uniqueCount).toBe(0);
    });
  });

  it('maps various SQL numeric types correctly', () => {
    const numericTypes = [
      'int', 'integer', 'bigint', 'smallint', 'float',
      'double', 'decimal', 'numeric', 'real', 'serial',
    ];

    for (const sqlType of numericTypes) {
      const result = queryResultToDataSource({
        fields: [{ name: 'val', dataType: sqlType }],
        rows: [{ val: 42 }],
        rowCount: 1,
        totalRows: 1,
        executionTimeMs: 1,
        truncated: false,
      });
      expect(result.fields[0].type).toBe('number');
    }
  });

  it('maps various SQL date types correctly', () => {
    const dateTypes = [
      'date', 'datetime', 'timestamp', 'timestamptz',
      'timestamp with time zone', 'time',
    ];

    for (const sqlType of dateTypes) {
      const result = queryResultToDataSource({
        fields: [{ name: 'val', dataType: sqlType }],
        rows: [{ val: '2024-01-01' }],
        rowCount: 1,
        totalRows: 1,
        executionTimeMs: 1,
        truncated: false,
      });
      expect(result.fields[0].type).toBe('date');
    }
  });

  it('maps unknown types to string', () => {
    const result = queryResultToDataSource({
      fields: [{ name: 'val', dataType: 'jsonb' }],
      rows: [{ val: '{}' }],
      rowCount: 1,
      totalRows: 1,
      executionTimeMs: 1,
      truncated: false,
    });
    expect(result.fields[0].type).toBe('string');
  });
});
