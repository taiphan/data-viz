import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import type { DataSource, GroupDefinition, BinDefinition } from '@/lib/types';

describe('Field Panel - Groups/Bins Integration', () => {
  beforeEach(() => {
    useWorkbookStore.getState().resetWorkbook();
  });

  function createTestDataSource(): DataSource {
    return {
      id: generateId(),
      name: 'Test Data',
      fileName: 'test.csv',
      fields: [
        {
          id: 'f1',
          name: 'Category',
          originalName: 'Category',
          type: 'string',
          role: 'dimension',
          sampleValues: ['A', 'B', 'C', 'D'],
          nullCount: 0,
          uniqueCount: 4,
        },
        {
          id: 'f2',
          name: 'Revenue',
          originalName: 'Revenue',
          type: 'number',
          role: 'measure',
          sampleValues: ['100', '200', '300'],
          nullCount: 0,
          uniqueCount: 3,
        },
      ],
      rows: [
        { Category: 'A', Revenue: 100 },
        { Category: 'B', Revenue: 200 },
        { Category: 'C', Revenue: 300 },
        { Category: 'D', Revenue: 50 },
      ],
      rowCount: 4,
      importedAt: new Date().toISOString(),
    };
  }

  it('should add a group to the store', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const group: GroupDefinition = {
      id: generateId(),
      name: 'Category Group',
      sourceField: 'Category',
      groups: [
        { name: 'High', values: ['A', 'B'] },
        { name: 'Low', values: ['C', 'D'] },
      ],
      otherGroupName: 'Other',
    };

    store.addGroup(group);

    const state = useWorkbookStore.getState();
    expect(state.workbook.groups).toHaveLength(1);
    expect(state.workbook.groups[0].name).toBe('Category Group');
    expect(state.workbook.groups[0].sourceField).toBe('Category');
    expect(state.workbook.groups[0].groups).toHaveLength(2);
  });

  it('should remove a group from the store', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const group: GroupDefinition = {
      id: 'group-1',
      name: 'Category Group',
      sourceField: 'Category',
      groups: [{ name: 'High', values: ['A', 'B'] }],
      otherGroupName: 'Other',
    };

    store.addGroup(group);
    expect(useWorkbookStore.getState().workbook.groups).toHaveLength(1);

    store.removeGroup('group-1');
    expect(useWorkbookStore.getState().workbook.groups).toHaveLength(0);
  });

  it('should add a bin to the store', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const bin: BinDefinition = {
      id: generateId(),
      name: 'Revenue Bins',
      sourceField: 'Revenue',
      binSize: 100,
      startAt: 0,
    };

    store.addBin(bin);

    const state = useWorkbookStore.getState();
    expect(state.workbook.bins).toHaveLength(1);
    expect(state.workbook.bins[0].name).toBe('Revenue Bins');
    expect(state.workbook.bins[0].sourceField).toBe('Revenue');
    expect(state.workbook.bins[0].binSize).toBe(100);
  });

  it('should remove a bin from the store', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const bin: BinDefinition = {
      id: 'bin-1',
      name: 'Revenue Bins',
      sourceField: 'Revenue',
      binSize: 50,
      startAt: 0,
    };

    store.addBin(bin);
    expect(useWorkbookStore.getState().workbook.bins).toHaveLength(1);

    store.removeBin('bin-1');
    expect(useWorkbookStore.getState().workbook.bins).toHaveLength(0);
  });

  it('virtual fields should be identifiable by source field', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const group: GroupDefinition = {
      id: 'g1',
      name: 'Cat Group',
      sourceField: 'Category',
      groups: [{ name: 'AB', values: ['A', 'B'] }],
      otherGroupName: 'Other',
    };

    const bin: BinDefinition = {
      id: 'b1',
      name: 'Rev Bins',
      sourceField: 'Revenue',
      binSize: 100,
    };

    store.addGroup(group);
    store.addBin(bin);

    const state = useWorkbookStore.getState();
    const dsFieldNames = new Set(ds.fields.map((f) => f.name));

    const activeGroups = state.workbook.groups.filter(
      (g) => dsFieldNames.has(g.sourceField)
    );
    const activeBins = state.workbook.bins.filter(
      (b) => dsFieldNames.has(b.sourceField)
    );

    expect(activeGroups).toHaveLength(1);
    expect(activeBins).toHaveLength(1);
    expect(activeGroups[0].name).toBe('Cat Group');
    expect(activeBins[0].name).toBe('Rev Bins');
  });

  it('virtual fields from unrelated data sources should not appear', () => {
    const store = useWorkbookStore.getState();
    const ds = createTestDataSource();
    store.addDataSource(ds);

    const group: GroupDefinition = {
      id: 'g-unrelated',
      name: 'Unrelated Group',
      sourceField: 'NonExistentField',
      groups: [{ name: 'X', values: ['x'] }],
      otherGroupName: 'Other',
    };

    store.addGroup(group);

    const state = useWorkbookStore.getState();
    const dsFieldNames = new Set(ds.fields.map((f) => f.name));

    const activeGroups = state.workbook.groups.filter(
      (g) => dsFieldNames.has(g.sourceField)
    );

    expect(activeGroups).toHaveLength(0);
  });
});
