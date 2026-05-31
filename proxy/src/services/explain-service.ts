import { Pool as PgPool } from 'pg';
import { Pool as MysqlPool } from 'mysql2/promise';
import * as mssql from 'mssql';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('explain-service');

// ============================================================
// TYPES
// ============================================================

export type DatabaseDriver = 'postgresql' | 'mysql' | 'mssql';

export interface ExplainNode {
  id: number;
  operation: string;
  object?: string;
  startupCost?: number;
  totalCost?: number;
  rows: number;
  width?: number;
  actualTime?: number;
  actualRows?: number;
  loops?: number;
  children: ExplainNode[];
}

export interface ExplainPlan {
  driver: DatabaseDriver;
  query: string;
  nodes: ExplainNode[];
  totalCost: number;
  totalRows: number;
  executionTimeMs?: number;
  planningTimeMs?: number;
  rawPlan: string;
}

export interface ExplainOptions {
  sql: string;
  analyze?: boolean;
}

export interface ConnectionPool {
  driver: DatabaseDriver;
  pool: PgPool | MysqlPool | mssql.ConnectionPool;
}

// ============================================================
// EXPLAIN SERVICE
// ============================================================

export class ExplainService {
  /**
   * Executes EXPLAIN on the given SQL and returns a structured plan.
   * Uses EXPLAIN (ANALYZE, FORMAT JSON) for PostgreSQL,
   * EXPLAIN for MySQL, and SET SHOWPLAN_TEXT ON for MSSQL.
   */
  async explain(
    connectionPool: ConnectionPool,
    options: ExplainOptions
  ): Promise<ExplainPlan> {
    const { sql, analyze = false } = options;

    switch (connectionPool.driver) {
      case 'postgresql':
        return this.explainPostgresql(
          connectionPool.pool as PgPool,
          sql,
          analyze
        );
      case 'mysql':
        return this.explainMysql(
          connectionPool.pool as MysqlPool,
          sql
        );
      case 'mssql':
        return this.explainMssql(
          connectionPool.pool as mssql.ConnectionPool,
          sql
        );
      default:
        throw new Error(`Unsupported driver: ${connectionPool.driver}`);
    }
  }

  // ============================================================
  // POSTGRESQL — EXPLAIN (ANALYZE, FORMAT JSON)
  // ============================================================

  private async explainPostgresql(
    pool: PgPool,
    sql: string,
    analyze: boolean
  ): Promise<ExplainPlan> {
    const client = await pool.connect();

    try {
      const explainPrefix = analyze
        ? 'EXPLAIN (ANALYZE, FORMAT JSON)'
        : 'EXPLAIN (FORMAT JSON)';

      const result = await client.query(`${explainPrefix} ${sql}`);

      const planJson = result.rows[0]['QUERY PLAN'];
      const planData = Array.isArray(planJson) ? planJson : [planJson];
      const rootPlan = planData[0];

      const rawPlan = JSON.stringify(planData, null, 2);
      let nodeIdCounter = 0;

      const parseNode = (node: Record<string, unknown>): ExplainNode => {
        const plan = node['Plan'] as Record<string, unknown> | undefined ?? node;
        const children = (plan['Plans'] as Record<string, unknown>[] | undefined) ?? [];

        const explainNode: ExplainNode = {
          id: nodeIdCounter++,
          operation: (plan['Node Type'] as string) ?? 'Unknown',
          object: (plan['Relation Name'] as string) ?? (plan['Index Name'] as string) ?? undefined,
          startupCost: plan['Startup Cost'] as number | undefined,
          totalCost: plan['Total Cost'] as number | undefined,
          rows: (plan['Plan Rows'] as number) ?? 0,
          width: plan['Plan Width'] as number | undefined,
          actualTime: plan['Actual Total Time'] as number | undefined,
          actualRows: plan['Actual Rows'] as number | undefined,
          loops: plan['Actual Loops'] as number | undefined,
          children: children.map(parseNode),
        };

        return explainNode;
      };

      const rootNode = parseNode(rootPlan);
      const nodes = [rootNode];

      const plan: ExplainPlan = {
        driver: 'postgresql',
        query: sql,
        nodes,
        totalCost: rootNode.totalCost ?? 0,
        totalRows: rootNode.rows,
        executionTimeMs: rootPlan['Execution Time'] as number | undefined,
        planningTimeMs: rootPlan['Planning Time'] as number | undefined,
        rawPlan,
      };

      logger.info({
        driver: 'postgresql',
        analyze,
        totalCost: plan.totalCost,
        totalRows: plan.totalRows,
      }, 'EXPLAIN plan generated');

      return plan;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // MYSQL — EXPLAIN FORMAT=JSON
  // ============================================================

  private async explainMysql(
    pool: MysqlPool,
    sql: string
  ): Promise<ExplainPlan> {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.query(`EXPLAIN FORMAT=JSON ${sql}`);
      const resultRows = rows as Record<string, unknown>[];

      const rawPlan = resultRows[0]?.['EXPLAIN'] as string ?? '{}';
      const planData = JSON.parse(rawPlan);
      const queryBlock = planData['query_block'] as Record<string, unknown> | undefined;

      let nodeIdCounter = 0;

      const parseMysqlNode = (node: Record<string, unknown>): ExplainNode => {
        const table = node['table'] as Record<string, unknown> | undefined;
        const nestedLoop = node['nested_loop'] as Record<string, unknown>[] | undefined;
        const orderingOp = node['ordering_operation'] as Record<string, unknown> | undefined;

        if (table) {
          return {
            id: nodeIdCounter++,
            operation: (table['access_type'] as string) ?? 'ALL',
            object: table['table_name'] as string | undefined,
            rows: (table['rows_examined_per_scan'] as number) ?? (table['rows_produced_per_join'] as number) ?? 0,
            totalCost: table['read_cost'] as number | undefined ?? table['eval_cost'] as number | undefined,
            children: [],
          };
        }

        if (nestedLoop) {
          const children = nestedLoop.map(parseMysqlNode);
          const totalRows = children.reduce((sum, c) => sum + c.rows, 0);
          return {
            id: nodeIdCounter++,
            operation: 'Nested Loop',
            rows: totalRows,
            children,
          };
        }

        if (orderingOp) {
          const innerChildren: ExplainNode[] = [];
          if (orderingOp['nested_loop']) {
            const nl = orderingOp['nested_loop'] as Record<string, unknown>[];
            innerChildren.push(...nl.map(parseMysqlNode));
          }
          if (orderingOp['table']) {
            innerChildren.push(parseMysqlNode({ table: orderingOp['table'] }));
          }
          return {
            id: nodeIdCounter++,
            operation: 'Sort',
            rows: (orderingOp['rows_examined_per_scan'] as number) ?? 0,
            children: innerChildren,
          };
        }

        return {
          id: nodeIdCounter++,
          operation: 'Unknown',
          rows: 0,
          children: [],
        };
      };

      const nodes: ExplainNode[] = [];

      if (queryBlock) {
        const costInfo = queryBlock['cost_info'] as Record<string, unknown> | undefined;
        const totalCost = costInfo
          ? parseFloat(costInfo['query_cost'] as string ?? '0')
          : 0;

        if (queryBlock['nested_loop']) {
          nodes.push(parseMysqlNode({ nested_loop: queryBlock['nested_loop'] }));
        } else if (queryBlock['table']) {
          nodes.push(parseMysqlNode({ table: queryBlock['table'] }));
        } else if (queryBlock['ordering_operation']) {
          nodes.push(parseMysqlNode({ ordering_operation: queryBlock['ordering_operation'] }));
        }

        const totalRows = nodes.reduce((sum, n) => sum + n.rows, 0);

        const plan: ExplainPlan = {
          driver: 'mysql',
          query: sql,
          nodes,
          totalCost,
          totalRows,
          rawPlan,
        };

        logger.info({
          driver: 'mysql',
          totalCost: plan.totalCost,
          totalRows: plan.totalRows,
        }, 'EXPLAIN plan generated');

        return plan;
      }

      return {
        driver: 'mysql',
        query: sql,
        nodes: [],
        totalCost: 0,
        totalRows: 0,
        rawPlan,
      };
    } finally {
      connection.release();
    }
  }

  // ============================================================
  // MSSQL — SET SHOWPLAN_TEXT ON / SET SHOWPLAN_ALL ON
  // ============================================================

  private async explainMssql(
    pool: mssql.ConnectionPool,
    sql: string
  ): Promise<ExplainPlan> {
    const request = pool.request();

    try {
      // Enable showplan — returns plan without executing the query
      await request.batch('SET SHOWPLAN_ALL ON');
      const result = await request.query(sql);
      await request.batch('SET SHOWPLAN_ALL OFF');

      const recordsets = result.recordsets as mssql.IRecordSet<Record<string, unknown>>[] | undefined;
      const recordset = recordsets?.[0] ?? [];
      const rawLines: string[] = [];
      const nodes: ExplainNode[] = [];
      let nodeIdCounter = 0;
      let totalCost = 0;
      let totalRows = 0;

      for (const row of recordset) {
        const record = row as Record<string, unknown>;
        const stmtText = (record['StmtText'] as string) ?? '';
        rawLines.push(stmtText);

        const operation = (record['PhysicalOp'] as string) ?? (record['LogicalOp'] as string) ?? stmtText;
        const estimatedRows = (record['EstimateRows'] as number) ?? 0;
        const estimatedCost = (record['TotalSubtreeCost'] as number) ?? 0;
        const argument = record['Argument'] as string | undefined;

        if (operation && operation !== stmtText) {
          const node: ExplainNode = {
            id: nodeIdCounter++,
            operation,
            object: argument,
            totalCost: estimatedCost,
            rows: Math.round(estimatedRows),
            children: [],
          };

          nodes.push(node);
          totalCost = Math.max(totalCost, estimatedCost);
          totalRows += Math.round(estimatedRows);
        }
      }

      const rawPlan = rawLines.join('\n');

      const plan: ExplainPlan = {
        driver: 'mssql',
        query: sql,
        nodes,
        totalCost,
        totalRows,
        rawPlan,
      };

      logger.info({
        driver: 'mssql',
        totalCost: plan.totalCost,
        totalRows: plan.totalRows,
      }, 'EXPLAIN plan generated');

      return plan;
    } catch (error) {
      // Ensure SHOWPLAN is turned off even on error
      try {
        await request.batch('SET SHOWPLAN_ALL OFF');
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}
