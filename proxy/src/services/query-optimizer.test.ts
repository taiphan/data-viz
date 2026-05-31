import { describe, it, expect, beforeEach } from 'vitest';
import { QueryOptimizer } from './query-optimizer.js';
import { ExplainPlan, ExplainNode } from './explain-service.js';

// ============================================================
// HELPERS
// ============================================================

function createPlan(overrides: Partial<ExplainPlan> = {}): ExplainPlan {
  return {
    driver: 'postgresql',
    query: 'SELECT * FROM users',
    nodes: [],
    totalCost: 0,
    totalRows: 0,
    rawPlan: '',
    ...overrides,
  };
}

function createNode(overrides: Partial<ExplainNode> = {}): ExplainNode {
  return {
    id: 0,
    operation: 'Seq Scan',
    rows: 0,
    children: [],
    ...overrides,
  };
}

describe('QueryOptimizer', () => {
  let optimizer: QueryOptimizer;

  beforeEach(() => {
    optimizer = new QueryOptimizer();
  });

  // ============================================================
  // FULL TABLE SCAN DETECTION
  // ============================================================

  describe('Full Table Scan Detection', () => {
    it('detects PostgreSQL Seq Scan with high row count', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'users',
          rows: 50000,
          totalCost: 500,
        })],
      });

      const results = optimizer.analyze(plan);
      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan'
      );

      expect(scanSuggestion).toBeDefined();
      expect(scanSuggestion!.severity).toBe('warning');
      expect(scanSuggestion!.affectedObject).toBe('users');
      expect(scanSuggestion!.description).toContain('Full table scan');
      expect(scanSuggestion!.description).toContain('50000');
    });

    it('detects MySQL ALL access type with high row count', () => {
      const plan = createPlan({
        driver: 'mysql',
        query: 'SELECT name FROM products',
        nodes: [createNode({
          operation: 'ALL',
          object: 'products',
          rows: 100000,
        })],
      });

      const results = optimizer.analyze(plan);
      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan'
      );

      expect(scanSuggestion).toBeDefined();
      expect(scanSuggestion!.affectedObject).toBe('products');
    });

    it('marks very large scans as critical', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'events',
          rows: 200000,
        })],
      });

      const results = optimizer.analyze(plan);
      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan'
      );

      expect(scanSuggestion).toBeDefined();
      expect(scanSuggestion!.severity).toBe('critical');
    });

    it('does not flag small table scans', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'config',
          rows: 50,
        })],
      });

      const results = optimizer.analyze(plan);
      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan'
      );

      expect(scanSuggestion).toBeUndefined();
    });

    it('detects MSSQL Clustered Index Scan with high rows', () => {
      const plan = createPlan({
        driver: 'mssql',
        query: 'SELECT * FROM orders',
        nodes: [createNode({
          operation: 'Clustered Index Scan',
          object: 'orders',
          rows: 15000,
        })],
      });

      const results = optimizer.analyze(plan);
      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan'
      );

      expect(scanSuggestion).toBeDefined();
      expect(scanSuggestion!.affectedObject).toBe('orders');
    });
  });

  // ============================================================
  // INEFFICIENT JOIN DETECTION
  // ============================================================

  describe('Inefficient Join Detection', () => {
    it('detects nested loop with full scan child', () => {
      const plan = createPlan({
        query: 'SELECT * FROM orders JOIN items ON orders.id = items.order_id',
        nodes: [createNode({
          operation: 'Nested Loops',
          rows: 50000,
          children: [
            createNode({ operation: 'Index Scan', object: 'orders', rows: 100 }),
            createNode({ operation: 'Seq Scan', object: 'items', rows: 50000 }),
          ],
        })],
      });

      const results = optimizer.analyze(plan);
      const joinSuggestion = results.find(
        (r) => r.category === 'inefficient-join'
      );

      expect(joinSuggestion).toBeDefined();
      expect(joinSuggestion!.severity).toBe('warning');
      expect(joinSuggestion!.description).toContain('Nested loop join');
      expect(joinSuggestion!.suggestedFix).toContain('index');
    });

    it('does not flag nested loop with index scan children', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Nested Loops',
          rows: 50000,
          children: [
            createNode({ operation: 'Index Scan', object: 'orders', rows: 100 }),
            createNode({ operation: 'Index Scan', object: 'items', rows: 500 }),
          ],
        })],
      });

      const results = optimizer.analyze(plan);
      const joinSuggestion = results.find(
        (r) => r.category === 'inefficient-join'
      );

      expect(joinSuggestion).toBeUndefined();
    });

    it('does not flag small nested loops', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Nested Loops',
          rows: 100,
          children: [
            createNode({ operation: 'Seq Scan', object: 'small_table', rows: 10 }),
          ],
        })],
      });

      const results = optimizer.analyze(plan);
      const joinSuggestion = results.find(
        (r) => r.category === 'inefficient-join'
      );

      expect(joinSuggestion).toBeUndefined();
    });
  });

  // ============================================================
  // MISSING INDEX DETECTION
  // ============================================================

  describe('Missing Index Detection', () => {
    it('detects high-cost sequential access on a named table', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'transactions',
          rows: 50000,
          totalCost: 250.5,
        })],
      });

      const results = optimizer.analyze(plan);
      const indexSuggestion = results.find(
        (r) => r.category === 'missing-index'
      );

      expect(indexSuggestion).toBeDefined();
      expect(indexSuggestion!.severity).toBe('critical');
      expect(indexSuggestion!.affectedObject).toBe('transactions');
      expect(indexSuggestion!.suggestedFix).toContain('CREATE INDEX');
      expect(indexSuggestion!.suggestedFix).toContain('transactions');
    });

    it('does not flag low-cost sequential access', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'settings',
          rows: 5,
          totalCost: 1.5,
        })],
      });

      const results = optimizer.analyze(plan);
      const indexSuggestion = results.find(
        (r) => r.category === 'missing-index'
      );

      expect(indexSuggestion).toBeUndefined();
    });

    it('does not flag sequential access without a named object', () => {
      const plan = createPlan({
        nodes: [createNode({
          operation: 'Seq Scan',
          rows: 50000,
          totalCost: 500,
        })],
      });

      const results = optimizer.analyze(plan);
      const indexSuggestion = results.find(
        (r) => r.category === 'missing-index'
      );

      expect(indexSuggestion).toBeUndefined();
    });
  });

  // ============================================================
  // SELECT * DETECTION
  // ============================================================

  describe('SELECT * Detection', () => {
    it('detects SELECT * in query', () => {
      const plan = createPlan({ query: 'SELECT * FROM users WHERE id = 1' });

      const results = optimizer.analyze(plan);
      const selectStarSuggestion = results.find(
        (r) => r.category === 'select-star'
      );

      expect(selectStarSuggestion).toBeDefined();
      expect(selectStarSuggestion!.severity).toBe('info');
      expect(selectStarSuggestion!.suggestedFix).toContain('explicit column names');
    });

    it('does not flag queries with explicit columns', () => {
      const plan = createPlan({
        query: 'SELECT id, name, email FROM users WHERE id = 1',
      });

      const results = optimizer.analyze(plan);
      const selectStarSuggestion = results.find(
        (r) => r.category === 'select-star'
      );

      expect(selectStarSuggestion).toBeUndefined();
    });

    it('detects SELECT * with extra whitespace', () => {
      const plan = createPlan({
        query: 'SELECT   *   FROM users',
      });

      const results = optimizer.analyze(plan);
      const selectStarSuggestion = results.find(
        (r) => r.category === 'select-star'
      );

      expect(selectStarSuggestion).toBeDefined();
    });

    it('uses provided sql parameter over plan.query', () => {
      const plan = createPlan({ query: 'SELECT id FROM users' });

      const results = optimizer.analyze(plan, 'SELECT * FROM orders');
      const selectStarSuggestion = results.find(
        (r) => r.category === 'select-star'
      );

      expect(selectStarSuggestion).toBeDefined();
    });
  });

  // ============================================================
  // UNNECESSARY SUBQUERY DETECTION
  // ============================================================

  describe('Unnecessary Subquery Detection', () => {
    it('detects IN (SELECT ...) pattern', () => {
      const plan = createPlan({
        query:
          'SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE active = true)',
      });

      const results = optimizer.analyze(plan);
      const subquerySuggestion = results.find(
        (r) => r.category === 'unnecessary-subquery'
      );

      expect(subquerySuggestion).toBeDefined();
      expect(subquerySuggestion!.severity).toBe('warning');
      expect(subquerySuggestion!.suggestedFix).toContain('JOIN');
    });

    it('detects correlated subquery in WHERE', () => {
      const plan = createPlan({
        query:
          'SELECT * FROM orders WHERE total > (SELECT AVG(total) FROM orders)',
      });

      const results = optimizer.analyze(plan);
      const subquerySuggestion = results.find(
        (r) => r.category === 'unnecessary-subquery'
      );

      expect(subquerySuggestion).toBeDefined();
      expect(subquerySuggestion!.suggestedFix).toContain('CTE');
    });

    it('does not flag queries without subqueries', () => {
      const plan = createPlan({
        query: 'SELECT id, name FROM users WHERE active = true',
      });

      const results = optimizer.analyze(plan);
      const subquerySuggestion = results.find(
        (r) => r.category === 'unnecessary-subquery'
      );

      expect(subquerySuggestion).toBeUndefined();
    });
  });

  // ============================================================
  // MISSING WHERE CLAUSE DETECTION
  // ============================================================

  describe('Missing WHERE Clause Detection', () => {
    it('detects SELECT without WHERE or LIMIT', () => {
      const plan = createPlan({
        query: 'SELECT id, name FROM users',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeDefined();
      expect(whereSuggestion!.severity).toBe('info');
      expect(whereSuggestion!.suggestedFix).toContain('WHERE');
    });

    it('flags UPDATE without WHERE as critical', () => {
      const plan = createPlan({
        query: 'UPDATE users SET active = false',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeDefined();
      expect(whereSuggestion!.severity).toBe('critical');
    });

    it('flags DELETE without WHERE as critical', () => {
      const plan = createPlan({
        query: 'DELETE FROM temp_logs',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeDefined();
      expect(whereSuggestion!.severity).toBe('critical');
    });

    it('does not flag SELECT with WHERE clause', () => {
      const plan = createPlan({
        query: 'SELECT id, name FROM users WHERE active = true',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeUndefined();
    });

    it('does not flag SELECT with LIMIT clause', () => {
      const plan = createPlan({
        query: 'SELECT id, name FROM users LIMIT 10',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeUndefined();
    });

    it('does not flag simple queries without FROM', () => {
      const plan = createPlan({
        query: 'SELECT 1',
      });

      const results = optimizer.analyze(plan);
      const whereSuggestion = results.find(
        (r) => r.category === 'missing-where-clause'
      );

      expect(whereSuggestion).toBeUndefined();
    });
  });

  // ============================================================
  // COMBINED ANALYSIS
  // ============================================================

  describe('Combined Analysis', () => {
    it('returns multiple suggestions for a problematic query', () => {
      const plan = createPlan({
        query: 'SELECT * FROM orders',
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'orders',
          rows: 500000,
          totalCost: 1500,
        })],
      });

      const results = optimizer.analyze(plan);

      // Should detect: full-table-scan, missing-index, select-star, missing-where-clause
      expect(results.length).toBeGreaterThanOrEqual(3);

      const categories = results.map((r) => r.category);
      expect(categories).toContain('full-table-scan');
      expect(categories).toContain('missing-index');
      expect(categories).toContain('select-star');
    });

    it('returns empty array for well-optimized queries', () => {
      const plan = createPlan({
        query: 'SELECT id, name FROM users WHERE id = 1',
        nodes: [createNode({
          operation: 'Index Scan',
          object: 'users',
          rows: 1,
          totalCost: 0.5,
        })],
      });

      const results = optimizer.analyze(plan);

      expect(results).toHaveLength(0);
    });

    it('analyzes nested children nodes', () => {
      const plan = createPlan({
        query: 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id = 1',
        nodes: [createNode({
          operation: 'Hash Join',
          rows: 100,
          children: [
            createNode({
              operation: 'Index Scan',
              object: 'users',
              rows: 1,
              totalCost: 0.5,
            }),
            createNode({
              operation: 'Seq Scan',
              object: 'orders',
              rows: 50000,
              totalCost: 200,
            }),
          ],
        })],
      });

      const results = optimizer.analyze(plan);

      const scanSuggestion = results.find(
        (r) => r.category === 'full-table-scan' && r.affectedObject === 'orders'
      );
      expect(scanSuggestion).toBeDefined();
    });

    it('handles empty plan nodes gracefully', () => {
      const plan = createPlan({
        query: 'SELECT id FROM users WHERE id = 1',
        nodes: [],
      });

      const results = optimizer.analyze(plan);

      expect(results).toHaveLength(0);
    });
  });

  // ============================================================
  // TYPED RETURN VALUES
  // ============================================================

  describe('Return Type Validation', () => {
    it('returns properly typed QueryOptimization objects', () => {
      const plan = createPlan({
        query: 'SELECT * FROM large_table',
        nodes: [createNode({
          operation: 'Seq Scan',
          object: 'large_table',
          rows: 100000,
          totalCost: 500,
        })],
      });

      const results = optimizer.analyze(plan);

      for (const result of results) {
        expect(result).toHaveProperty('severity');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('suggestedFix');
        expect(['info', 'warning', 'critical']).toContain(result.severity);
        expect([
          'missing-index',
          'full-table-scan',
          'inefficient-join',
          'select-star',
          'unnecessary-subquery',
          'missing-where-clause',
        ]).toContain(result.category);
        expect(result.description.length).toBeGreaterThan(0);
        expect(result.suggestedFix.length).toBeGreaterThan(0);
      }
    });
  });
});
