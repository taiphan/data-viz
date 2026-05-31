import { describe, it, expect } from 'vitest';
import { applyGroup, applyBin } from './groups-bins';
import type { GroupDefinition, BinDefinition } from '@/lib/types';

describe('applyGroup', () => {
  const regionGroupDef: GroupDefinition = {
    id: 'group-1',
    name: 'Region',
    sourceField: 'country',
    groups: [
      { name: 'North America', values: ['USA', 'Canada', 'Mexico'] },
      { name: 'Europe', values: ['UK', 'France', 'Germany'] },
      { name: 'Asia', values: ['Japan', 'China', 'India'] },
    ],
    otherGroupName: 'Other',
  };

  it('maps values to their group name', () => {
    const rows = [
      { country: 'USA', sales: 100 },
      { country: 'France', sales: 200 },
      { country: 'Japan', sales: 150 },
    ];

    const result = applyGroup(rows, regionGroupDef);

    expect(result[0].Region).toBe('North America');
    expect(result[1].Region).toBe('Europe');
    expect(result[2].Region).toBe('Asia');
  });

  it('assigns otherGroupName to unmatched values', () => {
    const rows = [
      { country: 'Brazil', sales: 80 },
      { country: 'Australia', sales: 90 },
    ];

    const result = applyGroup(rows, regionGroupDef);

    expect(result[0].Region).toBe('Other');
    expect(result[1].Region).toBe('Other');
  });

  it('preserves all original row fields', () => {
    const rows = [
      { country: 'USA', sales: 100, profit: 30, year: 2024 },
    ];

    const result = applyGroup(rows, regionGroupDef);

    expect(result[0]).toEqual({
      country: 'USA',
      sales: 100,
      profit: 30,
      year: 2024,
      Region: 'North America',
    });
  });

  it('handles empty rows array', () => {
    const result = applyGroup([], regionGroupDef);
    expect(result).toEqual([]);
  });

  it('handles group definition with no groups (all go to other)', () => {
    const emptyGroupDef: GroupDefinition = {
      id: 'group-empty',
      name: 'Category',
      sourceField: 'type',
      groups: [],
      otherGroupName: 'Uncategorized',
    };

    const rows = [
      { type: 'A', value: 1 },
      { type: 'B', value: 2 },
    ];

    const result = applyGroup(rows, emptyGroupDef);

    expect(result[0].Category).toBe('Uncategorized');
    expect(result[1].Category).toBe('Uncategorized');
  });

  it('handles null/undefined source field values', () => {
    const rows = [
      { country: null, sales: 50 },
      { country: undefined, sales: 60 },
      { sales: 70 }, // missing field entirely
    ];

    const result = applyGroup(rows, regionGroupDef);

    expect(result[0].Region).toBe('Other');
    expect(result[1].Region).toBe('Other');
    expect(result[2].Region).toBe('Other');
  });

  it('uses the groupDef.name as the virtual field name', () => {
    const customNameDef: GroupDefinition = {
      id: 'group-custom',
      name: 'Product Category',
      sourceField: 'product',
      groups: [
        { name: 'Electronics', values: ['Phone', 'Laptop'] },
      ],
      otherGroupName: 'Misc',
    };

    const rows = [{ product: 'Phone', price: 999 }];
    const result = applyGroup(rows, customNameDef);

    expect(result[0]['Product Category']).toBe('Electronics');
  });

  it('handles case-sensitive matching', () => {
    const rows = [
      { country: 'usa', sales: 100 },
      { country: 'USA', sales: 200 },
    ];

    const result = applyGroup(rows, regionGroupDef);

    // 'usa' does not match 'USA' — case-sensitive
    expect(result[0].Region).toBe('Other');
    expect(result[1].Region).toBe('North America');
  });

  it('handles numeric source field values by converting to string', () => {
    const numericGroupDef: GroupDefinition = {
      id: 'group-num',
      name: 'Tier',
      sourceField: 'score',
      groups: [
        { name: 'High', values: ['90', '95', '100'] },
        { name: 'Medium', values: ['70', '75', '80'] },
      ],
      otherGroupName: 'Low',
    };

    const rows = [
      { score: 90, name: 'Alice' },
      { score: 70, name: 'Bob' },
      { score: 50, name: 'Charlie' },
    ];

    const result = applyGroup(rows, numericGroupDef);

    expect(result[0].Tier).toBe('High');
    expect(result[1].Tier).toBe('Medium');
    expect(result[2].Tier).toBe('Low');
  });

  it('does not mutate the original rows', () => {
    const rows = [
      { country: 'USA', sales: 100 },
    ];
    const originalRow = { ...rows[0] };

    applyGroup(rows, regionGroupDef);

    expect(rows[0]).toEqual(originalRow);
  });

  it('handles multiple values in the same group correctly', () => {
    const rows = [
      { country: 'USA', sales: 100 },
      { country: 'Canada', sales: 80 },
      { country: 'Mexico', sales: 60 },
    ];

    const result = applyGroup(rows, regionGroupDef);

    expect(result[0].Region).toBe('North America');
    expect(result[1].Region).toBe('North America');
    expect(result[2].Region).toBe('North America');
  });

  it('handles a custom otherGroupName', () => {
    const customOtherDef: GroupDefinition = {
      id: 'group-other',
      name: 'Status',
      sourceField: 'state',
      groups: [
        { name: 'Active', values: ['running', 'pending'] },
      ],
      otherGroupName: 'Inactive',
    };

    const rows = [
      { state: 'running' },
      { state: 'stopped' },
    ];

    const result = applyGroup(rows, customOtherDef);

    expect(result[0].Status).toBe('Active');
    expect(result[1].Status).toBe('Inactive');
  });

  it('handles large datasets efficiently', () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({
      country: i % 3 === 0 ? 'USA' : i % 3 === 1 ? 'France' : 'Brazil',
      value: i,
    }));

    const result = applyGroup(rows, regionGroupDef);

    expect(result).toHaveLength(10000);
    expect(result[0].Region).toBe('North America');
    expect(result[1].Region).toBe('Europe');
    expect(result[2].Region).toBe('Other');
  });
});

describe('applyBin', () => {
  const ageBinDef: BinDefinition = {
    id: 'bin-1',
    name: 'Age Group',
    sourceField: 'age',
    binSize: 10,
    startAt: 0,
  };

  it('assigns values to correct bin labels', () => {
    const rows = [
      { age: 5, name: 'Alice' },
      { age: 15, name: 'Bob' },
      { age: 25, name: 'Charlie' },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('0-10');
    expect(result[1]['Age Group']).toBe('10-20');
    expect(result[2]['Age Group']).toBe('20-30');
  });

  it('handles values at bin boundaries (inclusive lower bound)', () => {
    const rows = [
      { age: 0, name: 'Zero' },
      { age: 10, name: 'Ten' },
      { age: 20, name: 'Twenty' },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('0-10');
    expect(result[1]['Age Group']).toBe('10-20');
    expect(result[2]['Age Group']).toBe('20-30');
  });

  it('handles null values by assigning N/A', () => {
    const rows = [
      { age: null, name: 'Null' },
      { age: undefined, name: 'Undefined' },
      { name: 'Missing' }, // field not present
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('N/A');
    expect(result[1]['Age Group']).toBe('N/A');
    expect(result[2]['Age Group']).toBe('N/A');
  });

  it('handles non-numeric values by assigning N/A', () => {
    const rows = [
      { age: 'abc', name: 'String' },
      { age: '', name: 'Empty' },
      { age: NaN, name: 'NaN' },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('N/A');
    expect(result[1]['Age Group']).toBe('N/A');
    expect(result[2]['Age Group']).toBe('N/A');
  });

  it('handles numeric strings by parsing them', () => {
    const rows = [
      { age: '25', name: 'StringNum' },
      { age: '7.5', name: 'Decimal' },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('20-30');
    expect(result[1]['Age Group']).toBe('0-10');
  });

  it('uses startAt to offset bin ranges', () => {
    const binDef: BinDefinition = {
      id: 'bin-offset',
      name: 'Score Range',
      sourceField: 'score',
      binSize: 10,
      startAt: 50,
    };

    const rows = [
      { score: 55 },
      { score: 65 },
      { score: 75 },
      { score: 50 },
    ];

    const result = applyBin(rows, binDef);

    expect(result[0]['Score Range']).toBe('50-60');
    expect(result[1]['Score Range']).toBe('60-70');
    expect(result[2]['Score Range']).toBe('70-80');
    expect(result[3]['Score Range']).toBe('50-60');
  });

  it('defaults startAt to 0 when not specified', () => {
    const binDef: BinDefinition = {
      id: 'bin-no-start',
      name: 'Bucket',
      sourceField: 'value',
      binSize: 5,
    };

    const rows = [
      { value: 3 },
      { value: 7 },
      { value: 12 },
    ];

    const result = applyBin(rows, binDef);

    expect(result[0].Bucket).toBe('0-5');
    expect(result[1].Bucket).toBe('5-10');
    expect(result[2].Bucket).toBe('10-15');
  });

  it('handles negative values correctly', () => {
    const rows = [
      { age: -5, name: 'Negative' },
      { age: -15, name: 'MoreNeg' },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]['Age Group']).toBe('-10-0');
    expect(result[1]['Age Group']).toBe('-20--10');
  });

  it('preserves all original row fields', () => {
    const rows = [
      { age: 25, name: 'Alice', city: 'NYC', active: true },
    ];

    const result = applyBin(rows, ageBinDef);

    expect(result[0]).toEqual({
      age: 25,
      name: 'Alice',
      city: 'NYC',
      active: true,
      'Age Group': '20-30',
    });
  });

  it('handles empty rows array', () => {
    const result = applyBin([], ageBinDef);
    expect(result).toEqual([]);
  });

  it('does not mutate the original rows', () => {
    const rows = [{ age: 25, name: 'Alice' }];
    const originalRow = { ...rows[0] };

    applyBin(rows, ageBinDef);

    expect(rows[0]).toEqual(originalRow);
  });

  it('handles different bin sizes', () => {
    const binDef: BinDefinition = {
      id: 'bin-large',
      name: 'Revenue Band',
      sourceField: 'revenue',
      binSize: 1000,
      startAt: 0,
    };

    const rows = [
      { revenue: 500 },
      { revenue: 1500 },
      { revenue: 2999 },
      { revenue: 3000 },
    ];

    const result = applyBin(rows, binDef);

    expect(result[0]['Revenue Band']).toBe('0-1000');
    expect(result[1]['Revenue Band']).toBe('1000-2000');
    expect(result[2]['Revenue Band']).toBe('2000-3000');
    expect(result[3]['Revenue Band']).toBe('3000-4000');
  });

  it('handles decimal bin sizes', () => {
    const binDef: BinDefinition = {
      id: 'bin-decimal',
      name: 'Range',
      sourceField: 'val',
      binSize: 0.5,
      startAt: 0,
    };

    const rows = [
      { val: 0.3 },
      { val: 0.7 },
      { val: 1.2 },
    ];

    const result = applyBin(rows, binDef);

    expect(result[0].Range).toBe('0-0.5');
    expect(result[1].Range).toBe('0.5-1');
    expect(result[2].Range).toBe('1-1.5');
  });

  it('handles large datasets efficiently', () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({
      age: i % 100,
      id: i,
    }));

    const result = applyBin(rows, ageBinDef);

    expect(result).toHaveLength(10000);
    expect(result[0]['Age Group']).toBe('0-10');
    expect(result[55]['Age Group']).toBe('50-60');
    expect(result[99]['Age Group']).toBe('90-100');
  });

  it('uses binDef.name as the virtual field name', () => {
    const binDef: BinDefinition = {
      id: 'bin-custom',
      name: 'Custom Bin Field',
      sourceField: 'x',
      binSize: 10,
    };

    const rows = [{ x: 5 }];
    const result = applyBin(rows, binDef);

    expect(result[0]['Custom Bin Field']).toBe('0-10');
  });

  it('handles values below startAt', () => {
    const binDef: BinDefinition = {
      id: 'bin-below',
      name: 'Temp Range',
      sourceField: 'temp',
      binSize: 10,
      startAt: 20,
    };

    const rows = [
      { temp: 15 },
      { temp: 5 },
    ];

    const result = applyBin(rows, binDef);

    expect(result[0]['Temp Range']).toBe('10-20');
    expect(result[1]['Temp Range']).toBe('0-10');
  });
});
