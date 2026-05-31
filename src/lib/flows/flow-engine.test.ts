import { describe, it, expect } from 'vitest';
import {
  executeFlow,
  resolveExecutionOrder,
  buildOutputDataSource,
  FlowDataSources,
} from './flow-engine';
import type {
  FlowDefinition,
  FlowStep,
  InputStepConfig,
  CleanStepConfig,
  JoinStepConfig,
  AggregateStepConfig,
  PivotStepConfig,
  UnionStepConfig,
  OutputStepConfig,
} from './types';
import type { DataSource } from '../types';

// ============================================================
// HELPERS
// ============================================================

function makeDataSource(
  id: string,
  rows: Record<string, unknown>[]
): DataSource {
  return {
    id,
    name: id,
    fileName: `${id}.csv`,
    fields: [],
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}

function makeFlow(
  steps: FlowStep[],
  connections: { id: string; sourceStepId: string; targetStepId: string }[] = []
): FlowDefinition {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    steps,
    connections,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// EXECUTION ORDER
// ============================================================

describe('resolveExecutionOrder', () => {
  it('returns steps in topological order', () => {
    const steps: FlowStep[] = [
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false }, enabled: true },
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' }, enabled: true },
      { id: 's2', name: 'Clean', type: 'clean', config: { operations: [] }, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);
    const order = resolveExecutionOrder(flow);

    expect(order[0].id).toBe('s1');
    expect(order[1].id).toBe('s2');
    expect(order[2].id).toBe('s3');
  });

  it('throws on cyclic dependencies', () => {
    const steps: FlowStep[] = [
      { id: 's1', name: 'A', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' }, enabled: true },
      { id: 's2', name: 'B', type: 'clean', config: { operations: [] }, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's1' },
    ];
    const flow = makeFlow(steps, connections);

    expect(() => resolveExecutionOrder(flow)).toThrow('cycle');
  });
});

// ============================================================
// INPUT STEP
// ============================================================

describe('executeFlow - input step', () => {
  it('loads data from an existing DataSource', async () => {
    const rows = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    const ds = makeDataSource('ds1', rows);
    const dataSources: FlowDataSources = { ds1: ds };

    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [{ id: 'c1', sourceStepId: 's1', targetStepId: 's2' }];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, dataSources);

    expect(result.status).toBe('completed');
    expect(result.stepResults[0].rowCount).toBe(2);
  });

  it('errors when DataSource is not found', async () => {
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'missing' } as InputStepConfig, enabled: true },
    ];
    const flow = makeFlow(steps, []);

    const result = await executeFlow(flow, {});

    expect(result.status).toBe('error');
    expect(result.error).toContain('not found');
  });
});

// ============================================================
// CLEAN STEP
// ============================================================

describe('executeFlow - clean step', () => {
  const salesData = [
    { product: 'Widget', price: 10, category: 'A' },
    { product: 'Gadget', price: 25, category: 'B' },
    { product: 'Doohickey', price: 5, category: 'A' },
    { product: 'Thingamajig', price: 50, category: 'C' },
  ];

  it('filters rows with equals operator', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Clean', type: 'clean', config: {
          operations: [{
            type: 'filter',
            filter: { field: 'category', operator: 'equals', values: ['A'] },
          }],
        } as CleanStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[2].rowCount).toBe(2);
  });

  it('renames columns', async () => {
    const ds = makeDataSource('ds1', [{ old_name: 'value1' }]);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Clean', type: 'clean', config: {
          operations: [{
            type: 'rename',
            rename: { field: 'old_name', newName: 'new_name' },
          }],
        } as CleanStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[2].rowCount).toBe(1);
  });

  it('casts types correctly', async () => {
    const ds = makeDataSource('ds1', [{ amount: '42', active: 'true' }]);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Clean', type: 'clean', config: {
          operations: [
            { type: 'cast', cast: { field: 'amount', targetType: 'number' } },
            { type: 'cast', cast: { field: 'active', targetType: 'boolean' } },
          ],
        } as CleanStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
  });

  it('applies multiple clean operations sequentially', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Clean', type: 'clean', config: {
          operations: [
            { type: 'filter', filter: { field: 'price', operator: 'gt', values: ['5'] } },
            { type: 'rename', rename: { field: 'product', newName: 'item' } },
          ],
        } as CleanStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    // 3 rows have price > 5 (10, 25, 50)
    expect(result.stepResults[2].rowCount).toBe(3);
  });
});

// ============================================================
// JOIN STEP
// ============================================================

describe('executeFlow - join step', () => {
  const orders = [
    { orderId: '1', customerId: 'c1', amount: 100 },
    { orderId: '2', customerId: 'c2', amount: 200 },
    { orderId: '3', customerId: 'c3', amount: 150 },
  ];
  const customers = [
    { customerId: 'c1', name: 'Alice' },
    { customerId: 'c2', name: 'Bob' },
    { customerId: 'c4', name: 'Diana' },
  ];

  it('performs inner join correctly', async () => {
    const ds1 = makeDataSource('orders', orders);
    const ds2 = makeDataSource('customers', customers);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Orders', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'orders' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Customers', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'customers' } as InputStepConfig, enabled: true },
      {
        id: 's3', name: 'Join', type: 'join', config: {
          joinType: 'inner',
          rightInputStepId: 's2',
          leftField: 'customerId',
          rightField: 'customerId',
        } as JoinStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's3' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { orders: ds1, customers: ds2 });

    expect(result.status).toBe('completed');
    // c1 and c2 match, c3 and c4 don't
    expect(result.stepResults[2].rowCount).toBe(2);
  });

  it('performs left join correctly', async () => {
    const ds1 = makeDataSource('orders', orders);
    const ds2 = makeDataSource('customers', customers);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Orders', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'orders' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Customers', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'customers' } as InputStepConfig, enabled: true },
      {
        id: 's3', name: 'Join', type: 'join', config: {
          joinType: 'left',
          rightInputStepId: 's2',
          leftField: 'customerId',
          rightField: 'customerId',
        } as JoinStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's3' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { orders: ds1, customers: ds2 });

    expect(result.status).toBe('completed');
    // All 3 left rows preserved
    expect(result.stepResults[2].rowCount).toBe(3);
  });

  it('performs full join correctly', async () => {
    const ds1 = makeDataSource('orders', orders);
    const ds2 = makeDataSource('customers', customers);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Orders', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'orders' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Customers', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'customers' } as InputStepConfig, enabled: true },
      {
        id: 's3', name: 'Join', type: 'join', config: {
          joinType: 'full',
          rightInputStepId: 's2',
          leftField: 'customerId',
          rightField: 'customerId',
        } as JoinStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's3' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { orders: ds1, customers: ds2 });

    expect(result.status).toBe('completed');
    // 2 matched + 1 unmatched left (c3) + 1 unmatched right (c4) = 4
    expect(result.stepResults[2].rowCount).toBe(4);
  });
});

// ============================================================
// AGGREGATE STEP
// ============================================================

describe('executeFlow - aggregate step', () => {
  const salesData = [
    { region: 'East', product: 'A', sales: 100 },
    { region: 'East', product: 'B', sales: 200 },
    { region: 'West', product: 'A', sales: 150 },
    { region: 'West', product: 'B', sales: 300 },
    { region: 'East', product: 'A', sales: 50 },
  ];

  it('groups by dimension and applies SUM', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Aggregate', type: 'aggregate', config: {
          groupByFields: ['region'],
          aggregations: [{ field: 'sales', aggregation: 'SUM', alias: 'total_sales' }],
        } as AggregateStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[1].rowCount).toBe(2); // East, West
  });

  it('applies AVG aggregation', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Aggregate', type: 'aggregate', config: {
          groupByFields: ['region'],
          aggregations: [{ field: 'sales', aggregation: 'AVG', alias: 'avg_sales' }],
        } as AggregateStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[1].rowCount).toBe(2);
  });

  it('applies COUNT aggregation', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Aggregate', type: 'aggregate', config: {
          groupByFields: ['region'],
          aggregations: [{ field: 'sales', aggregation: 'COUNT', alias: 'count' }],
        } as AggregateStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[1].rowCount).toBe(2);
  });

  it('supports multiple group-by fields', async () => {
    const ds = makeDataSource('ds1', salesData);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Aggregate', type: 'aggregate', config: {
          groupByFields: ['region', 'product'],
          aggregations: [{ field: 'sales', aggregation: 'SUM', alias: 'total' }],
        } as AggregateStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    // East-A, East-B, West-A, West-B = 4 groups
    expect(result.stepResults[1].rowCount).toBe(4);
  });
});

// ============================================================
// PIVOT STEP
// ============================================================

describe('executeFlow - pivot step', () => {
  it('pivots rows to columns', async () => {
    const data = [
      { year: '2023', quarter: 'Q1', revenue: 100 },
      { year: '2023', quarter: 'Q2', revenue: 150 },
      { year: '2024', quarter: 'Q1', revenue: 200 },
      { year: '2024', quarter: 'Q2', revenue: 250 },
    ];
    const ds = makeDataSource('ds1', data);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Pivot', type: 'pivot', config: {
          mode: 'rows-to-columns',
          pivotField: 'quarter',
          valueField: 'revenue',
          groupByFields: ['year'],
        } as PivotStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    // 2 years = 2 rows, with Q1 and Q2 as columns
    expect(result.stepResults[1].rowCount).toBe(2);
  });

  it('pivots columns to rows', async () => {
    const data = [
      { year: '2023', Q1: 100, Q2: 150, Q3: 200, Q4: 250 },
      { year: '2024', Q1: 300, Q2: 350, Q3: 400, Q4: 450 },
    ];
    const ds = makeDataSource('ds1', data);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Unpivot', type: 'pivot', config: {
          mode: 'columns-to-rows',
          pivotField: 'quarter',
          valueField: 'revenue',
          groupByFields: ['year'],
        } as PivotStepConfig, enabled: true,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    // 2 rows × 4 non-group columns = 8 rows
    expect(result.stepResults[1].rowCount).toBe(8);
  });
});

// ============================================================
// UNION STEP
// ============================================================

describe('executeFlow - union step', () => {
  it('stacks datasets vertically by name', async () => {
    const data1 = [
      { name: 'Alice', score: 90 },
      { name: 'Bob', score: 85 },
    ];
    const data2 = [
      { name: 'Charlie', score: 92 },
      { name: 'Diana', score: 88 },
    ];
    const ds1 = makeDataSource('ds1', data1);
    const ds2 = makeDataSource('ds2', data2);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input1', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Input2', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds2' } as InputStepConfig, enabled: true },
      {
        id: 's3', name: 'Union', type: 'union', config: {
          inputStepIds: ['s1', 's2'],
          matchBy: 'name',
        } as UnionStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's3' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1, ds2 });

    expect(result.status).toBe('completed');
    expect(result.stepResults[2].rowCount).toBe(4);
  });

  it('stacks datasets by position', async () => {
    const data1 = [{ col_a: 'x', col_b: 1 }];
    const data2 = [{ first: 'y', second: 2 }];
    const ds1 = makeDataSource('ds1', data1);
    const ds2 = makeDataSource('ds2', data2);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input1', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Input2', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds2' } as InputStepConfig, enabled: true },
      {
        id: 's3', name: 'Union', type: 'union', config: {
          inputStepIds: ['s1', 's2'],
          matchBy: 'position',
        } as UnionStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's3' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1, ds2 });

    expect(result.status).toBe('completed');
    expect(result.stepResults[2].rowCount).toBe(2);
  });
});

// ============================================================
// OUTPUT STEP & buildOutputDataSource
// ============================================================

describe('executeFlow - output step', () => {
  it('passes through rows from previous step', async () => {
    const data = [{ x: 1 }, { x: 2 }, { x: 3 }];
    const ds = makeDataSource('ds1', data);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Output', type: 'output', config: { outputName: 'Final', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [{ id: 'c1', sourceStepId: 's1', targetStepId: 's2' }];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[1].rowCount).toBe(3);
  });
});

describe('buildOutputDataSource', () => {
  it('creates a DataSource from rows', () => {
    const rows = [
      { name: 'Alice', age: 30, active: true },
      { name: 'Bob', age: 25, active: false },
    ];

    const ds = buildOutputDataSource(rows, 'Test Output');

    expect(ds.name).toBe('Test Output');
    expect(ds.rowCount).toBe(2);
    expect(ds.rows).toEqual(rows);
    expect(ds.fields.length).toBe(3);
    expect(ds.fileName).toBe('Test Output.flow');
  });

  it('handles empty rows', () => {
    const ds = buildOutputDataSource([], 'Empty');

    expect(ds.name).toBe('Empty');
    expect(ds.rowCount).toBe(0);
    expect(ds.fields).toEqual([]);
  });

  it('detects numeric fields correctly', () => {
    const rows = [
      { value: 10, label: 'A' },
      { value: 20, label: 'B' },
    ];

    const ds = buildOutputDataSource(rows, 'Typed');

    const valueField = ds.fields.find((f) => f.name === 'value');
    const labelField = ds.fields.find((f) => f.name === 'label');

    expect(valueField?.type).toBe('number');
    expect(valueField?.role).toBe('measure');
    expect(labelField?.type).toBe('string');
    expect(labelField?.role).toBe('dimension');
  });
});

// ============================================================
// DISABLED STEPS & ERROR HANDLING
// ============================================================

describe('executeFlow - disabled steps and errors', () => {
  it('skips disabled steps', async () => {
    const ds = makeDataSource('ds1', [{ x: 1 }, { x: 2 }]);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Clean', type: 'clean', config: {
          operations: [{ type: 'filter', filter: { field: 'x', operator: 'equals', values: ['1'] } }],
        } as CleanStepConfig, enabled: false,
      },
      { id: 's3', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    expect(result.stepResults[1].status).toBe('skipped');
    // Output should still get all rows since clean was skipped
    expect(result.stepResults[2].rowCount).toBe(2);
  });

  it('reports execution time for each step', async () => {
    const ds = makeDataSource('ds1', [{ x: 1 }]);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      { id: 's2', name: 'Output', type: 'output', config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [{ id: 'c1', sourceStepId: 's1', targetStepId: 's2' }];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.stepResults[0].executionTimeMs).toBeDefined();
    expect(result.stepResults[0].executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes startedAt and completedAt timestamps', async () => {
    const ds = makeDataSource('ds1', [{ x: 1 }]);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
    ];
    const flow = makeFlow(steps, []);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
  });
});

// ============================================================
// MULTI-STEP FLOW
// ============================================================

describe('executeFlow - multi-step pipeline', () => {
  it('executes input → clean → aggregate → output', async () => {
    const data = [
      { region: 'East', sales: 100 },
      { region: 'East', sales: 200 },
      { region: 'West', sales: 150 },
      { region: 'West', sales: 50 },
      { region: 'East', sales: 10 },
    ];
    const ds = makeDataSource('ds1', data);
    const steps: FlowStep[] = [
      { id: 's1', name: 'Input', type: 'input', config: { sourceType: 'datasource', dataSourceId: 'ds1' } as InputStepConfig, enabled: true },
      {
        id: 's2', name: 'Filter', type: 'clean', config: {
          operations: [{ type: 'filter', filter: { field: 'sales', operator: 'gte', values: ['50'] } }],
        } as CleanStepConfig, enabled: true,
      },
      {
        id: 's3', name: 'Aggregate', type: 'aggregate', config: {
          groupByFields: ['region'],
          aggregations: [{ field: 'sales', aggregation: 'SUM', alias: 'total_sales' }],
        } as AggregateStepConfig, enabled: true,
      },
      { id: 's4', name: 'Output', type: 'output', config: { outputName: 'Summary', outputType: 'datasource', overwriteExisting: false } as OutputStepConfig, enabled: true },
    ];
    const connections = [
      { id: 'c1', sourceStepId: 's1', targetStepId: 's2' },
      { id: 'c2', sourceStepId: 's2', targetStepId: 's3' },
      { id: 'c3', sourceStepId: 's3', targetStepId: 's4' },
    ];
    const flow = makeFlow(steps, connections);

    const result = await executeFlow(flow, { ds1: ds });

    expect(result.status).toBe('completed');
    // After filter (>=50): 4 rows remain (100, 200, 150, 50)
    expect(result.stepResults[1].rowCount).toBe(4);
    // After aggregate by region: 2 groups
    expect(result.stepResults[2].rowCount).toBe(2);
    // Output passes through
    expect(result.stepResults[3].rowCount).toBe(2);
  });
});
