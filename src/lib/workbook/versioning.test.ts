import { describe, it, expect } from 'vitest';
import {
  createSnapshot,
  createVersion,
  enforceVersionLimit,
  rollbackToVersion,
  diffVersions,
  MAX_VERSIONS_PER_WORKBOOK,
  WorkbookVersion,
  WorkbookSnapshot,
} from './versioning';
import { Workbook } from '../types';

function createTestWorkbook(overrides: Partial<Workbook> = {}): Workbook {
  return {
    id: 'wb-1',
    name: 'Test Workbook',
    dataSources: [
      {
        id: 'ds-1',
        name: 'Sales Data',
        fileName: 'sales.csv',
        fields: [
          { id: 'f1', name: 'region', originalName: 'region', type: 'string', role: 'dimension', sampleValues: ['North'], nullCount: 0, uniqueCount: 4 },
          { id: 'f2', name: 'revenue', originalName: 'revenue', type: 'number', role: 'measure', sampleValues: ['100'], nullCount: 0, uniqueCount: 50 },
        ],
        rows: [{ region: 'North', revenue: 100 }, { region: 'South', revenue: 200 }],
        rowCount: 2,
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    activeDataSourceId: 'ds-1',
    joins: [],
    transforms: [],
    sheets: [
      {
        id: 'sheet-1',
        title: 'Sheet 1',
        charts: [
          {
            id: 'chart-1',
            title: 'Bar Chart',
            chartType: 'bar',
            xAxis: { field: 'region', aggregation: 'NONE' },
            yAxis: { field: 'revenue', aggregation: 'SUM' },
            color: { field: null, aggregation: 'NONE' },
            size: { field: null, aggregation: 'NONE' },
            label: { field: null, aggregation: 'NONE' },
            filters: [],
            sortBy: null,
            sortOrder: 'none',
            showTrendLine: false,
            showDataLabels: false,
            showLegend: true,
            colorPalette: [],
            width: 6,
            height: 4,
          },
        ],
        globalFilters: [],
        layout: 'auto',
      },
    ],
    activeSheetId: 'sheet-1',
    activeChartId: 'chart-1',
    parameters: [],
    parameterActions: [],
    groups: [],
    bins: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createTestVersion(
  workbookId: string,
  versionNumber: number,
  snapshotOverrides: Partial<WorkbookSnapshot> = {}
): WorkbookVersion {
  const baseSnapshot: WorkbookSnapshot = {
    id: workbookId,
    name: `Workbook v${versionNumber}`,
    activeDataSourceId: 'ds-1',
    joins: [],
    transforms: [],
    sheets: [
      {
        id: 'sheet-1',
        title: 'Sheet 1',
        charts: [],
        globalFilters: [],
        layout: 'auto',
      },
    ],
    activeSheetId: 'sheet-1',
    activeChartId: null,
    parameters: [],
    parameterActions: [],
    groups: [],
    bins: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    dataSources: [{ id: 'ds-1', name: 'Sales', fileName: 'sales.csv', fieldCount: 2, rowCount: 10, importedAt: '2024-01-01T00:00:00.000Z' }],
    ...snapshotOverrides,
  };

  return {
    id: `ver-${versionNumber}`,
    workbookId,
    versionNumber,
    timestamp: '2024-01-01T00:00:00.000Z',
    description: `Version ${versionNumber}`,
    snapshot: baseSnapshot,
  };
}

describe('createSnapshot', () => {
  it('creates a snapshot without row data', () => {
    const workbook = createTestWorkbook();
    const snapshot = createSnapshot(workbook);

    expect(snapshot.dataSources[0]).not.toHaveProperty('rows');
    expect(snapshot.dataSources[0]).not.toHaveProperty('fields');
    expect(snapshot.dataSources[0].fieldCount).toBe(2);
    expect(snapshot.dataSources[0].rowCount).toBe(2);
  });

  it('preserves structural data in the snapshot', () => {
    const workbook = createTestWorkbook();
    const snapshot = createSnapshot(workbook);

    expect(snapshot.name).toBe('Test Workbook');
    expect(snapshot.sheets).toHaveLength(1);
    expect(snapshot.sheets[0].charts).toHaveLength(1);
    expect(snapshot.activeSheetId).toBe('sheet-1');
    expect(snapshot.activeChartId).toBe('chart-1');
  });

  it('deep clones arrays to prevent mutation', () => {
    const workbook = createTestWorkbook();
    const snapshot = createSnapshot(workbook);

    workbook.sheets[0].title = 'Modified';
    expect(snapshot.sheets[0].title).toBe('Sheet 1');
  });
});

describe('createVersion', () => {
  it('creates a version with version number 1 when no existing versions', () => {
    const workbook = createTestWorkbook();
    const version = createVersion(workbook, 'Initial version', []);

    expect(version.versionNumber).toBe(1);
    expect(version.description).toBe('Initial version');
    expect(version.workbookId).toBe('wb-1');
    expect(version.id).toBeTruthy();
    expect(version.timestamp).toBeTruthy();
  });

  it('increments version number based on existing versions', () => {
    const workbook = createTestWorkbook();
    const existing = [createTestVersion('wb-1', 1), createTestVersion('wb-1', 2)];
    const version = createVersion(workbook, 'Third version', existing);

    expect(version.versionNumber).toBe(3);
  });

  it('only considers versions for the same workbook', () => {
    const workbook = createTestWorkbook();
    const existing = [
      createTestVersion('wb-1', 1),
      createTestVersion('other-wb', 5),
    ];
    const version = createVersion(workbook, 'Second version', existing);

    expect(version.versionNumber).toBe(2);
  });
});

describe('enforceVersionLimit', () => {
  it('does not trim when under the limit', () => {
    const versions = [createTestVersion('wb-1', 1), createTestVersion('wb-1', 2)];
    const result = enforceVersionLimit(versions, 'wb-1');

    expect(result).toHaveLength(2);
  });

  it('trims oldest versions when over the limit', () => {
    const versions: WorkbookVersion[] = [];
    for (let i = 1; i <= MAX_VERSIONS_PER_WORKBOOK + 5; i++) {
      versions.push(createTestVersion('wb-1', i));
    }

    const result = enforceVersionLimit(versions, 'wb-1');
    const workbookVersions = result.filter((v) => v.workbookId === 'wb-1');

    expect(workbookVersions).toHaveLength(MAX_VERSIONS_PER_WORKBOOK);
    expect(workbookVersions[0].versionNumber).toBe(6); // oldest kept
    expect(workbookVersions[workbookVersions.length - 1].versionNumber).toBe(55);
  });

  it('does not affect versions from other workbooks', () => {
    const versions: WorkbookVersion[] = [];
    for (let i = 1; i <= MAX_VERSIONS_PER_WORKBOOK + 5; i++) {
      versions.push(createTestVersion('wb-1', i));
    }
    versions.push(createTestVersion('wb-2', 1));

    const result = enforceVersionLimit(versions, 'wb-1');
    const wb2Versions = result.filter((v) => v.workbookId === 'wb-2');

    expect(wb2Versions).toHaveLength(1);
  });
});

describe('rollbackToVersion', () => {
  it('restores workbook name from version snapshot', () => {
    const currentWorkbook = createTestWorkbook({ name: 'Current Name' });
    const version = createTestVersion('wb-1', 1, { name: 'Old Name' });

    const restored = rollbackToVersion(currentWorkbook, version);

    expect(restored.name).toBe('Old Name');
  });

  it('preserves the workbook id and createdAt', () => {
    const currentWorkbook = createTestWorkbook();
    const version = createTestVersion('wb-1', 1);

    const restored = rollbackToVersion(currentWorkbook, version);

    expect(restored.id).toBe(currentWorkbook.id);
    expect(restored.createdAt).toBe(currentWorkbook.createdAt);
  });

  it('restores sheets from the version snapshot', () => {
    const currentWorkbook = createTestWorkbook();
    const version = createTestVersion('wb-1', 1, {
      sheets: [
        { id: 'old-sheet', title: 'Old Sheet', charts: [], globalFilters: [], layout: 'auto' },
      ],
    });

    const restored = rollbackToVersion(currentWorkbook, version);

    expect(restored.sheets).toHaveLength(1);
    expect(restored.sheets[0].id).toBe('old-sheet');
    expect(restored.sheets[0].title).toBe('Old Sheet');
  });

  it('updates the updatedAt timestamp', () => {
    const currentWorkbook = createTestWorkbook({ updatedAt: '2024-01-01T00:00:00.000Z' });
    const version = createTestVersion('wb-1', 1);

    const restored = rollbackToVersion(currentWorkbook, version);

    expect(restored.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('preserves current dataSources rows (not stored in snapshot)', () => {
    const currentWorkbook = createTestWorkbook();
    const version = createTestVersion('wb-1', 1);

    const restored = rollbackToVersion(currentWorkbook, version);

    // dataSources should remain from current workbook (rows intact)
    expect(restored.dataSources).toEqual(currentWorkbook.dataSources);
  });
});

describe('diffVersions', () => {
  it('returns empty array when versions are identical', () => {
    const version = createTestVersion('wb-1', 1);
    const diffs = diffVersions(version, version);

    expect(diffs).toHaveLength(0);
  });

  it('detects name change', () => {
    const versionA = createTestVersion('wb-1', 1, { name: 'Old Name' });
    const versionB = createTestVersion('wb-1', 2, { name: 'New Name' });

    const diffs = diffVersions(versionA, versionB);

    expect(diffs).toContainEqual({
      field: 'name',
      path: 'name',
      type: 'changed',
      oldValue: 'Old Name',
      newValue: 'New Name',
    });
  });

  it('detects added sheets', () => {
    const versionA = createTestVersion('wb-1', 1, {
      sheets: [{ id: 'sheet-1', title: 'Sheet 1', charts: [], globalFilters: [], layout: 'auto' }],
    });
    const versionB = createTestVersion('wb-1', 2, {
      sheets: [
        { id: 'sheet-1', title: 'Sheet 1', charts: [], globalFilters: [], layout: 'auto' },
        { id: 'sheet-2', title: 'Sheet 2', charts: [], globalFilters: [], layout: 'auto' },
      ],
    });

    const diffs = diffVersions(versionA, versionB);
    const addedSheet = diffs.find((d) => d.type === 'added' && d.field === 'sheets');

    expect(addedSheet).toBeDefined();
    expect(addedSheet!.path).toBe('sheets[sheet-2]');
  });

  it('detects removed data sources', () => {
    const versionA = createTestVersion('wb-1', 1, {
      dataSources: [
        { id: 'ds-1', name: 'Sales', fileName: 'sales.csv', fieldCount: 2, rowCount: 10, importedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'ds-2', name: 'Products', fileName: 'products.csv', fieldCount: 3, rowCount: 20, importedAt: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const versionB = createTestVersion('wb-1', 2, {
      dataSources: [
        { id: 'ds-1', name: 'Sales', fileName: 'sales.csv', fieldCount: 2, rowCount: 10, importedAt: '2024-01-01T00:00:00.000Z' },
      ],
    });

    const diffs = diffVersions(versionA, versionB);
    const removedDs = diffs.find((d) => d.type === 'removed' && d.field === 'dataSources');

    expect(removedDs).toBeDefined();
    expect(removedDs!.path).toBe('dataSources[ds-2]');
  });

  it('detects changed items', () => {
    const versionA = createTestVersion('wb-1', 1, {
      sheets: [{ id: 'sheet-1', title: 'Old Title', charts: [], globalFilters: [], layout: 'auto' }],
    });
    const versionB = createTestVersion('wb-1', 2, {
      sheets: [{ id: 'sheet-1', title: 'New Title', charts: [], globalFilters: [], layout: 'auto' }],
    });

    const diffs = diffVersions(versionA, versionB);
    const changedSheet = diffs.find((d) => d.type === 'changed' && d.field === 'sheets');

    expect(changedSheet).toBeDefined();
    expect(changedSheet!.path).toBe('sheets[sheet-1]');
  });
});
