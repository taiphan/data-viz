import { ExplainPlan, ExplainNode } from './explain-service.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('query-optimizer');

// ============================================================
// TYPES
// ============================================================

export type OptimizationSeverity = 'info' | 'warning' | 'critical';

export type OptimizationCategory =
  | 'missing-index'
  | 'full-table-scan'
  | 'inefficient-join'
  | 'select-star'
  | 'unnecessary-subquery'
  | 'missing-where-clause';

export interface QueryOptimization {
  severity: OptimizationSeverity;
  category: OptimizationCategory;
  description: string;
  suggestedFix: string;
  affectedObject?: string;
  estimatedImpact?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const FULL_SCAN_OPERATIONS = [
  'Seq Scan',
  'ALL',
  'Table Scan',
  'Clustered Index Scan',
];

const INEFFICIENT_JOIN_OPERATIONS = [
  'Nested Loops',
  'Nested Loop',
];

const HIGH_ROW_THRESHOLD = 10000;
const HIGH_COST_THRESHOLD = 100;

// ============================================================
// QUERY OPTIMIZER SERVICE
// ============================================================

export class QueryOptimizer {
  /**
   * Analyzes an EXPLAIN plan and the original SQL query to produce
   * optimization suggestions.
   */
  analyze(plan: ExplainPlan, sql?: string): QueryOptimization[] {
    const optimizations: QueryOptimization[] = [];

    // Analyze EXPLAIN plan nodes
    this.analyzeNodes(plan.nodes, optimizations);

    // Analyze SQL anti-patterns
    const query = sql ?? plan.query;
    if (query) {
      this.analyzeQueryAntiPatterns(query, optimizations);
    }

    logger.info(
      { suggestionsCount: optimizations.length, driver: plan.driver },
      'Query optimization analysis complete'
    );

    return optimizations;
  }

  // ============================================================
  // PLAN NODE ANALYSIS
  // ============================================================

  private analyzeNodes(
    nodes: ExplainNode[],
    optimizations: QueryOptimization[]
  ): void {
    for (const node of nodes) {
      this.analyzeNode(node, optimizations);
      this.analyzeNodes(node.children, optimizations);
    }
  }

  private analyzeNode(
    node: ExplainNode,
    optimizations: QueryOptimization[]
  ): void {
    this.detectFullTableScan(node, optimizations);
    this.detectInefficientJoin(node, optimizations);
    this.detectMissingIndex(node, optimizations);
  }

  /**
   * Detects full table scans (Seq Scan, ALL, Table Scan, Clustered Index Scan)
   * that process a high number of rows.
   */
  private detectFullTableScan(
    node: ExplainNode,
    optimizations: QueryOptimization[]
  ): void {
    if (!FULL_SCAN_OPERATIONS.includes(node.operation)) {
      return;
    }

    if (node.rows < HIGH_ROW_THRESHOLD) {
      return;
    }

    const tableName = node.object ?? 'unknown table';

    optimizations.push({
      severity: node.rows > HIGH_ROW_THRESHOLD * 10 ? 'critical' : 'warning',
      category: 'full-table-scan',
      description:
        `Full table scan on "${tableName}" scanning ${node.rows} rows. ` +
        'This can be slow on large tables.',
      suggestedFix:
        `Add an index on the columns used in WHERE/JOIN clauses for "${tableName}", ` +
        'or add a WHERE clause to limit the rows scanned.',
      affectedObject: tableName,
      estimatedImpact: `Scanning ${node.rows} rows without index`,
    });
  }

  /**
   * Detects nested loop joins that process a high number of rows,
   * which may indicate a missing index on the join column.
   */
  private detectInefficientJoin(
    node: ExplainNode,
    optimizations: QueryOptimization[]
  ): void {
    if (!INEFFICIENT_JOIN_OPERATIONS.includes(node.operation)) {
      return;
    }

    if (node.rows < HIGH_ROW_THRESHOLD) {
      return;
    }

    const hasFullScanChild = node.children.some(
      (child) => FULL_SCAN_OPERATIONS.includes(child.operation)
    );

    if (!hasFullScanChild) {
      return;
    }

    optimizations.push({
      severity: 'warning',
      category: 'inefficient-join',
      description:
        `Nested loop join processing ${node.rows} rows with a full scan on an inner table. ` +
        'This can cause O(n*m) performance.',
      suggestedFix:
        'Add an index on the join column of the inner table, ' +
        'or consider rewriting the query to use a hash join.',
      affectedObject: node.object ?? undefined,
      estimatedImpact: `Nested loop over ${node.rows} rows`,
    });
  }

  /**
   * Detects potential missing indexes by looking at high-cost sequential
   * operations on specific tables.
   */
  private detectMissingIndex(
    node: ExplainNode,
    optimizations: QueryOptimization[]
  ): void {
    const isSequentialAccess = FULL_SCAN_OPERATIONS.includes(node.operation);
    const hasHighCost = (node.totalCost ?? 0) > HIGH_COST_THRESHOLD;

    if (!isSequentialAccess || !hasHighCost || !node.object) {
      return;
    }

    optimizations.push({
      severity: 'critical',
      category: 'missing-index',
      description:
        `High-cost sequential access on "${node.object}" ` +
        `(cost: ${node.totalCost?.toFixed(2)}). ` +
        'An index on the filtered or joined columns would improve performance.',
      suggestedFix:
        `CREATE INDEX idx_${node.object}_<column> ON ${node.object} (<column>); ` +
        '— replace <column> with the column(s) used in WHERE or JOIN conditions.',
      affectedObject: node.object,
      estimatedImpact: `Cost: ${node.totalCost?.toFixed(2)}`,
    });
  }

  // ============================================================
  // SQL ANTI-PATTERN ANALYSIS
  // ============================================================

  private analyzeQueryAntiPatterns(
    sql: string,
    optimizations: QueryOptimization[]
  ): void {
    this.detectSelectStar(sql, optimizations);
    this.detectUnnecessarySubquery(sql, optimizations);
    this.detectMissingWhereClause(sql, optimizations);
  }

  /**
   * Detects SELECT * usage which fetches all columns unnecessarily.
   */
  private detectSelectStar(
    sql: string,
    optimizations: QueryOptimization[]
  ): void {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const selectStarPattern = /\bSELECT\s+\*/i;

    if (!selectStarPattern.test(normalized)) {
      return;
    }

    optimizations.push({
      severity: 'info',
      category: 'select-star',
      description:
        'Using SELECT * fetches all columns, including those not needed. ' +
        'This increases I/O and memory usage.',
      suggestedFix:
        'Replace SELECT * with explicit column names that are actually needed ' +
        '(e.g., SELECT id, name, email FROM users).',
    });
  }

  /**
   * Detects subqueries in WHERE/FROM that could potentially be rewritten
   * as JOINs for better performance.
   */
  private detectUnnecessarySubquery(
    sql: string,
    optimizations: QueryOptimization[]
  ): void {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // Detect IN (SELECT ...) pattern
    const inSubqueryPattern = /\bIN\s*\(\s*SELECT\b/i;
    if (inSubqueryPattern.test(normalized)) {
      optimizations.push({
        severity: 'warning',
        category: 'unnecessary-subquery',
        description:
          'Subquery in IN clause detected. This may execute the subquery ' +
          'for each row in the outer query.',
        suggestedFix:
          'Consider rewriting as a JOIN or using EXISTS instead of IN (SELECT ...). ' +
          'Example: SELECT a.* FROM table_a a JOIN table_b b ON a.id = b.a_id',
      });
      return;
    }

    // Detect correlated subqueries in WHERE
    const whereSubqueryPattern = /\bWHERE\b[^;]*\(\s*SELECT\b/i;
    if (whereSubqueryPattern.test(normalized)) {
      optimizations.push({
        severity: 'info',
        category: 'unnecessary-subquery',
        description:
          'Subquery in WHERE clause detected. Depending on the database optimizer, ' +
          'this may not be efficiently cached.',
        suggestedFix:
          'Consider rewriting as a JOIN or CTE (WITH clause) for better readability ' +
          'and potentially better performance.',
      });
    }
  }

  /**
   * Detects queries that modify or read large datasets without a WHERE clause.
   * Only flags SELECT/UPDATE/DELETE without WHERE on non-trivial queries.
   */
  private detectMissingWhereClause(
    sql: string,
    optimizations: QueryOptimization[]
  ): void {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    const hasWhereClause = /\bWHERE\b/i.test(normalized);
    if (hasWhereClause) {
      return;
    }

    // Check for UPDATE/DELETE — these operate on tables without needing FROM (UPDATE) or use FROM (DELETE)
    const isModification = /^\s*(UPDATE|DELETE)\b/i.test(normalized);

    if (isModification) {
      optimizations.push({
        severity: 'critical',
        category: 'missing-where-clause',
        description:
          'UPDATE/DELETE statement without a WHERE clause will affect all rows in the table.',
        suggestedFix:
          'Add a WHERE clause to limit the affected rows, ' +
          'or confirm this is intentional (e.g., DELETE FROM temp_table).',
      });
      return;
    }

    // For SELECT queries, skip simple queries like "SELECT 1" or "SELECT NOW()"
    const hasFromClause = /\bFROM\b/i.test(normalized);
    if (!hasFromClause) {
      return;
    }

    // Check for LIMIT clause — if present, it's somewhat acceptable
    const hasLimitClause = /\b(LIMIT|TOP)\b/i.test(normalized);

    if (!hasLimitClause) {
      optimizations.push({
        severity: 'info',
        category: 'missing-where-clause',
        description:
          'SELECT query without WHERE or LIMIT clause will return all rows from the table. ' +
          'This may be slow on large tables.',
        suggestedFix:
          'Add a WHERE clause to filter results, or add LIMIT to restrict the number of rows returned.',
      });
    }
  }
}
