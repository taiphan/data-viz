import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExplainService, ConnectionPool } from './explain-service.js';

// ============================================================
// MOCKS
// ============================================================

const mockPgClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPgPool = {
  connect: vi.fn().mockResolvedValue(mockPgClient),
};

const mockMysqlConnection = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockMysqlPool = {
  getConnection: vi.fn().mockResolvedValue(mockMysqlConnection),
};

const mockMssqlRequest = {
  batch: vi.fn(),
  query: vi.fn(),
};

const mockMssqlPool = {
  request: vi.fn().mockReturnValue(mockMssqlRequest),
};

describe('ExplainService', () => {
  let service: ExplainService;

  beforeEach(() => {
    service = new ExplainService();
    vi.clearAllMocks();
  });

  // ============================================================
  // POSTGRESQL
  // ============================================================

  describe('PostgreSQL EXPLAIN', () => {
    const pgConnectionPool: ConnectionPool = {
      driver: 'postgresql',
      pool: mockPgPool as unknown as ConnectionPool['pool'],
    };

    it('generates a structured plan from EXPLAIN FORMAT JSON', async () => {
      const pgPlanResponse = {
        rows: [{
          'QUERY PLAN': [{
            'Plan': {
              'Node Type': 'Seq Scan',
              'Relation Name': 'users',
              'Startup Cost': 0.00,
              'Total Cost': 35.50,
              'Plan Rows': 2550,
              'Plan Width': 64,
            },
            'Planning Time': 0.15,
          }],
        }],
      };

      mockPgClient.query.mockResolvedValue(pgPlanResponse);

      const plan = await service.explain(pgConnectionPool, {
        sql: 'SELECT * FROM users',
      });

      expect(plan.driver).toBe('postgresql');
      expect(plan.query).toBe('SELECT * FROM users');
      expect(plan.nodes).toHaveLength(1);
      expect(plan.nodes[0].operation).toBe('Seq Scan');
      expect(plan.nodes[0].object).toBe('users');
      expect(plan.nodes[0].startupCost).toBe(0.00);
      expect(plan.nodes[0].totalCost).toBe(35.50);
      expect(plan.nodes[0].rows).toBe(2550);
      expect(plan.nodes[0].width).toBe(64);
      expect(plan.totalCost).toBe(35.50);
      expect(plan.totalRows).toBe(2550);
      expect(plan.planningTimeMs).toBe(0.15);
      expect(plan.rawPlan).toBeDefined();
      expect(mockPgClient.release).toHaveBeenCalled();
    });

    it('uses EXPLAIN (ANALYZE, FORMAT JSON) when analyze is true', async () => {
      const pgPlanResponse = {
        rows: [{
          'QUERY PLAN': [{
            'Plan': {
              'Node Type': 'Index Scan',
              'Relation Name': 'orders',
              'Index Name': 'orders_pkey',
              'Startup Cost': 0.29,
              'Total Cost': 8.30,
              'Plan Rows': 1,
              'Plan Width': 40,
              'Actual Total Time': 0.05,
              'Actual Rows': 1,
              'Actual Loops': 1,
            },
            'Planning Time': 0.10,
            'Execution Time': 0.08,
          }],
        }],
      };

      mockPgClient.query.mockResolvedValue(pgPlanResponse);

      const plan = await service.explain(pgConnectionPool, {
        sql: 'SELECT * FROM orders WHERE id = 1',
        analyze: true,
      });

      expect(mockPgClient.query).toHaveBeenCalledWith(
        'EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM orders WHERE id = 1'
      );
      expect(plan.nodes[0].actualTime).toBe(0.05);
      expect(plan.nodes[0].actualRows).toBe(1);
      expect(plan.nodes[0].loops).toBe(1);
      expect(plan.executionTimeMs).toBe(0.08);
      expect(plan.planningTimeMs).toBe(0.10);
    });

    it('parses nested plan nodes with children', async () => {
      const pgPlanResponse = {
        rows: [{
          'QUERY PLAN': [{
            'Plan': {
              'Node Type': 'Hash Join',
              'Startup Cost': 10.00,
              'Total Cost': 50.00,
              'Plan Rows': 100,
              'Plan Width': 128,
              'Plans': [
                {
                  'Node Type': 'Seq Scan',
                  'Relation Name': 'orders',
                  'Startup Cost': 0.00,
                  'Total Cost': 20.00,
                  'Plan Rows': 500,
                  'Plan Width': 64,
                },
                {
                  'Node Type': 'Hash',
                  'Startup Cost': 5.00,
                  'Total Cost': 5.00,
                  'Plan Rows': 50,
                  'Plan Width': 32,
                  'Plans': [
                    {
                      'Node Type': 'Seq Scan',
                      'Relation Name': 'customers',
                      'Startup Cost': 0.00,
                      'Total Cost': 5.00,
                      'Plan Rows': 50,
                      'Plan Width': 32,
                    },
                  ],
                },
              ],
            },
          }],
        }],
      };

      mockPgClient.query.mockResolvedValue(pgPlanResponse);

      const plan = await service.explain(pgConnectionPool, {
        sql: 'SELECT * FROM orders JOIN customers ON orders.customer_id = customers.id',
      });

      expect(plan.nodes[0].operation).toBe('Hash Join');
      expect(plan.nodes[0].children).toHaveLength(2);
      expect(plan.nodes[0].children[0].operation).toBe('Seq Scan');
      expect(plan.nodes[0].children[0].object).toBe('orders');
      expect(plan.nodes[0].children[1].operation).toBe('Hash');
      expect(plan.nodes[0].children[1].children).toHaveLength(1);
      expect(plan.nodes[0].children[1].children[0].object).toBe('customers');
    });

    it('releases the client even on error', async () => {
      mockPgClient.query.mockRejectedValue(new Error('syntax error'));

      await expect(
        service.explain(pgConnectionPool, { sql: 'INVALID SQL' })
      ).rejects.toThrow('syntax error');

      expect(mockPgClient.release).toHaveBeenCalled();
    });
  });

  // ============================================================
  // MYSQL
  // ============================================================

  describe('MySQL EXPLAIN', () => {
    const mysqlConnectionPool: ConnectionPool = {
      driver: 'mysql',
      pool: mockMysqlPool as unknown as ConnectionPool['pool'],
    };

    it('generates a structured plan from EXPLAIN FORMAT=JSON', async () => {
      const mysqlPlanResponse = [[{
        'EXPLAIN': JSON.stringify({
          query_block: {
            cost_info: { query_cost: '12.50' },
            table: {
              table_name: 'products',
              access_type: 'ALL',
              rows_examined_per_scan: 1000,
              rows_produced_per_join: 1000,
              read_cost: '10.00',
            },
          },
        }),
      }]];

      mockMysqlConnection.query.mockResolvedValue(mysqlPlanResponse);

      const plan = await service.explain(mysqlConnectionPool, {
        sql: 'SELECT * FROM products',
      });

      expect(plan.driver).toBe('mysql');
      expect(plan.query).toBe('SELECT * FROM products');
      expect(plan.nodes).toHaveLength(1);
      expect(plan.nodes[0].operation).toBe('ALL');
      expect(plan.nodes[0].object).toBe('products');
      expect(plan.nodes[0].rows).toBe(1000);
      expect(plan.totalCost).toBe(12.50);
      expect(plan.rawPlan).toBeDefined();
      expect(mockMysqlConnection.release).toHaveBeenCalled();
    });

    it('parses nested loop plans', async () => {
      const mysqlPlanResponse = [[{
        'EXPLAIN': JSON.stringify({
          query_block: {
            cost_info: { query_cost: '25.00' },
            nested_loop: [
              {
                table: {
                  table_name: 'orders',
                  access_type: 'ref',
                  rows_examined_per_scan: 50,
                },
              },
              {
                table: {
                  table_name: 'items',
                  access_type: 'eq_ref',
                  rows_examined_per_scan: 1,
                },
              },
            ],
          },
        }),
      }]];

      mockMysqlConnection.query.mockResolvedValue(mysqlPlanResponse);

      const plan = await service.explain(mysqlConnectionPool, {
        sql: 'SELECT * FROM orders JOIN items ON orders.id = items.order_id',
      });

      expect(plan.nodes).toHaveLength(1);
      expect(plan.nodes[0].operation).toBe('Nested Loop');
      expect(plan.nodes[0].children).toHaveLength(2);
      expect(plan.nodes[0].children[0].object).toBe('orders');
      expect(plan.nodes[0].children[1].object).toBe('items');
      expect(plan.totalCost).toBe(25.00);
    });

    it('releases the connection even on error', async () => {
      mockMysqlConnection.query.mockRejectedValue(new Error('table not found'));

      await expect(
        service.explain(mysqlConnectionPool, { sql: 'SELECT * FROM nonexistent' })
      ).rejects.toThrow('table not found');

      expect(mockMysqlConnection.release).toHaveBeenCalled();
    });
  });

  // ============================================================
  // MSSQL
  // ============================================================

  describe('MSSQL EXPLAIN', () => {
    const mssqlConnectionPool: ConnectionPool = {
      driver: 'mssql',
      pool: mockMssqlPool as unknown as ConnectionPool['pool'],
    };

    it('generates a structured plan from SHOWPLAN_ALL', async () => {
      mockMssqlRequest.batch.mockResolvedValue(undefined);
      mockMssqlRequest.query.mockResolvedValue({
        recordsets: [[
          {
            StmtText: 'SELECT * FROM users',
            PhysicalOp: 'Clustered Index Scan',
            LogicalOp: 'Clustered Index Scan',
            EstimateRows: 500,
            TotalSubtreeCost: 0.15,
            Argument: 'OBJECT:([db].[dbo].[users])',
          },
        ]],
      });

      const plan = await service.explain(mssqlConnectionPool, {
        sql: 'SELECT * FROM users',
      });

      expect(plan.driver).toBe('mssql');
      expect(plan.query).toBe('SELECT * FROM users');
      expect(plan.nodes).toHaveLength(1);
      expect(plan.nodes[0].operation).toBe('Clustered Index Scan');
      expect(plan.nodes[0].rows).toBe(500);
      expect(plan.nodes[0].totalCost).toBe(0.15);
      expect(plan.totalCost).toBe(0.15);
      expect(plan.totalRows).toBe(500);
      expect(plan.rawPlan).toContain('SELECT * FROM users');
    });

    it('handles multiple plan nodes', async () => {
      mockMssqlRequest.batch.mockResolvedValue(undefined);
      mockMssqlRequest.query.mockResolvedValue({
        recordsets: [[
          {
            StmtText: '|--Nested Loops(Inner Join)',
            PhysicalOp: 'Nested Loops',
            LogicalOp: 'Inner Join',
            EstimateRows: 100,
            TotalSubtreeCost: 0.50,
            Argument: null,
          },
          {
            StmtText: '     |--Index Seek',
            PhysicalOp: 'Index Seek',
            LogicalOp: 'Index Seek',
            EstimateRows: 1,
            TotalSubtreeCost: 0.003,
            Argument: 'OBJECT:([db].[dbo].[orders].[PK_orders])',
          },
        ]],
      });

      const plan = await service.explain(mssqlConnectionPool, {
        sql: 'SELECT * FROM orders WHERE id = 1',
      });

      expect(plan.nodes).toHaveLength(2);
      expect(plan.nodes[0].operation).toBe('Nested Loops');
      expect(plan.nodes[1].operation).toBe('Index Seek');
      expect(plan.totalCost).toBe(0.50);
    });

    it('turns off SHOWPLAN_ALL even on error', async () => {
      mockMssqlRequest.batch.mockResolvedValue(undefined);
      mockMssqlRequest.query.mockRejectedValue(new Error('invalid object'));

      await expect(
        service.explain(mssqlConnectionPool, { sql: 'SELECT * FROM bad_table' })
      ).rejects.toThrow('invalid object');

      // Should attempt to turn off SHOWPLAN_ALL
      expect(mockMssqlRequest.batch).toHaveBeenCalledWith('SET SHOWPLAN_ALL OFF');
    });
  });

  // ============================================================
  // GENERAL
  // ============================================================

  describe('General', () => {
    it('throws for unsupported driver', async () => {
      const badPool: ConnectionPool = {
        driver: 'oracle' as unknown as ConnectionPool['driver'],
        pool: {} as unknown as ConnectionPool['pool'],
      };

      await expect(
        service.explain(badPool, { sql: 'SELECT 1' })
      ).rejects.toThrow('Unsupported driver: oracle');
    });
  });
});
