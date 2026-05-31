import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseParquetFile } from './parquet-connector';

// Mock hyparquet module
vi.mock('hyparquet', () => ({
  parquetMetadataAsync: vi.fn(),
  parquetSchema: vi.fn(),
  parquetReadObjects: vi.fn(),
}));

import { parquetMetadataAsync, parquetSchema, parquetReadObjects } from 'hyparquet';

const mockMetadataAsync = vi.mocked(parquetMetadataAsync);
const mockSchema = vi.mocked(parquetSchema);
const mockReadObjects = vi.mocked(parquetReadObjects);

describe('parseParquetFile', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  const setupMocks = (opts: {
    numRows?: bigint;
    columns?: Array<{
      name: string;
      type?: string;
      logicalType?: { type: string };
      convertedType?: string;
    }>;
    rows?: Record<string, unknown>[];
  } = {}) => {
    const numRows = opts.numRows ?? BigInt(3);
    const columns = opts.columns ?? [
      { name: 'id', type: 'INT32' },
      { name: 'name', type: 'BYTE_ARRAY', logicalType: { type: 'STRING' } },
      { name: 'amount', type: 'DOUBLE' },
      { name: 'created_at', type: 'INT96' },
      { name: 'active', type: 'BOOLEAN' },
    ];
    const rows = opts.rows ?? [
      { id: 1, name: 'Alice', amount: 100.5, created_at: '2024-01-01', active: true },
      { id: 2, name: 'Bob', amount: 200.75, created_at: '2024-02-01', active: false },
      { id: 3, name: null, amount: null, created_at: null, active: null },
    ];

    const metadata = {
      version: 2,
      num_rows: numRows,
      schema: [],
      row_groups: [],
      metadata_length: 100,
    };

    const schemaTree = {
      children: columns.map((col) => ({
        element: {
          name: col.name,
          type: col.type,
          logical_type: col.logicalType,
          converted_type: col.convertedType,
        },
        children: [],
        count: 0,
        path: [col.name],
      })),
      element: { name: 'root' },
      count: columns.length,
      path: [],
    };

    mockMetadataAsync.mockResolvedValue(metadata as any);
    mockSchema.mockReturnValue(schemaTree as any);
    mockReadObjects.mockResolvedValue(rows as any);

    return { metadata, schemaTree, rows };
  };

  it('parses a Parquet file from ArrayBuffer and returns DataSource', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Parquet Import');
    expect(result.fileName).toBe('parquet-data.parquet');
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.fields).toHaveLength(5);
  });

  it('parses a Parquet file from File object', async () => {
    setupMocks();
    const file = new File([new ArrayBuffer(100)], 'data.parquet', {
      type: 'application/octet-stream',
    });

    const result = await parseParquetFile(file);

    expect(result.name).toBe('data.parquet');
    expect(result.fileName).toBe('data.parquet');
  });

  it('maps Parquet physical types to correct FieldTypes', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);
    const fieldMap = Object.fromEntries(result.fields.map((f) => [f.name, f]));

    expect(fieldMap['id'].type).toBe('number');
    expect(fieldMap['name'].type).toBe('string');
    expect(fieldMap['amount'].type).toBe('number');
    expect(fieldMap['created_at'].type).toBe('date');
    expect(fieldMap['active'].type).toBe('boolean');
  });

  it('assigns roles correctly: numeric → measure, others → dimension', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);
    const fieldMap = Object.fromEntries(result.fields.map((f) => [f.name, f]));

    expect(fieldMap['id'].role).toBe('measure');
    expect(fieldMap['name'].role).toBe('dimension');
    expect(fieldMap['amount'].role).toBe('measure');
    expect(fieldMap['created_at'].role).toBe('dimension');
    expect(fieldMap['active'].role).toBe('dimension');
  });

  it('preserves original column names', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    for (const field of result.fields) {
      expect(field.originalName).toBe(field.name);
    }
  });

  it('enforces row limit', async () => {
    const largeRows = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      name: `row-${i}`,
    }));

    setupMocks({
      numRows: BigInt(50),
      columns: [
        { name: 'id', type: 'INT32' },
        { name: 'name', type: 'BYTE_ARRAY', logicalType: { type: 'STRING' } },
      ],
      rows: largeRows,
    });

    const buffer = new ArrayBuffer(100);
    const result = await parseParquetFile(buffer, { maxRows: 10 });

    // Verify parquetReadObjects was called with rowEnd = 10
    expect(mockReadObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        rowStart: 0,
        rowEnd: 10,
      }),
    );
  });

  it('warns when file exceeds large import threshold', async () => {
    setupMocks({ numRows: BigInt(6_000_000) });
    const buffer = new ArrayBuffer(100);

    await parseParquetFile(buffer);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Large Parquet file'),
    );
  });

  it('does not warn for small files', async () => {
    setupMocks({ numRows: BigInt(1000) });
    const buffer = new ArrayBuffer(100);

    await parseParquetFile(buffer);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('uses custom name from options', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer, { name: 'Sales Data' });

    expect(result.name).toBe('Sales Data');
  });

  it('filters columns when specified in options', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    await parseParquetFile(buffer, { columns: ['id', 'name'] });

    expect(mockReadObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: ['id', 'name'],
      }),
    );
  });

  it('ignores non-existent columns in options', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    await parseParquetFile(buffer, { columns: ['id', 'nonexistent'] });

    expect(mockReadObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: ['id'],
      }),
    );
  });

  it('handles empty Parquet file gracefully', async () => {
    setupMocks({
      numRows: BigInt(0),
      rows: [],
    });
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
    expect(result.fields).toHaveLength(5);
  });

  it('maps logical type DECIMAL to number', async () => {
    setupMocks({
      columns: [
        { name: 'price', type: 'FIXED_LEN_BYTE_ARRAY', logicalType: { type: 'DECIMAL' } },
      ],
      rows: [{ price: 99.99 }],
      numRows: BigInt(1),
    });
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    expect(result.fields[0].type).toBe('number');
  });

  it('maps logical type TIMESTAMP to date', async () => {
    setupMocks({
      columns: [
        { name: 'ts', type: 'INT64', logicalType: { type: 'TIMESTAMP' } },
      ],
      rows: [{ ts: 1704067200000 }],
      numRows: BigInt(1),
    });
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    expect(result.fields[0].type).toBe('date');
  });

  it('maps converted_type DATE to date', async () => {
    setupMocks({
      columns: [
        { name: 'day', type: 'INT32', convertedType: 'DATE' },
      ],
      rows: [{ day: 19723 }],
      numRows: BigInt(1),
    });
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);

    expect(result.fields[0].type).toBe('date');
  });

  it('computes field statistics correctly', async () => {
    setupMocks({
      columns: [
        { name: 'name', type: 'BYTE_ARRAY', logicalType: { type: 'STRING' } },
      ],
      rows: [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: null },
      ],
      numRows: BigInt(3),
    });
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);
    const nameField = result.fields[0];

    expect(nameField.sampleValues).toContain('Alice');
    expect(nameField.sampleValues).toContain('Bob');
    expect(nameField.nullCount).toBe(1);
    expect(nameField.uniqueCount).toBe(3); // Alice, Bob, null
  });

  it('generates unique field IDs', async () => {
    setupMocks();
    const buffer = new ArrayBuffer(100);

    const result = await parseParquetFile(buffer);
    const ids = result.fields.map((f) => f.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
