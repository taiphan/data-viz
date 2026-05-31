'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  Info,
  TreePine,
  TableIcon,
  Lightbulb,
} from 'lucide-react';

// ============================================================
// TYPES (mirrored from proxy/src/services/explain-service.ts)
// ============================================================

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
  driver: 'postgresql' | 'mysql' | 'mssql';
  query: string;
  nodes: ExplainNode[];
  totalCost: number;
  totalRows: number;
  executionTimeMs?: number;
  planningTimeMs?: number;
  rawPlan: string;
}

export type OptimizationSeverity = 'info' | 'warning' | 'critical';

export interface QueryOptimization {
  severity: OptimizationSeverity;
  category: string;
  description: string;
  suggestedFix: string;
  affectedObject?: string;
  estimatedImpact?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const EXPENSIVE_OPERATIONS = new Set([
  'Seq Scan',
  'ALL',
  'Table Scan',
  'Clustered Index Scan',
  'Nested Loops',
  'Nested Loop',
]);

const HIGH_COST_THRESHOLD = 100;
const HIGH_ROW_THRESHOLD = 10000;

type ViewMode = 'tree' | 'table';

// ============================================================
// HELPERS
// ============================================================

function isExpensiveNode(node: ExplainNode): boolean {
  if (EXPENSIVE_OPERATIONS.has(node.operation)) return true;
  if ((node.totalCost ?? 0) > HIGH_COST_THRESHOLD) return true;
  if (node.rows > HIGH_ROW_THRESHOLD) return true;
  return false;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined || cost === null) return '—';
  return cost >= 1000 ? `${(cost / 1000).toFixed(1)}k` : cost.toFixed(2);
}

function formatRows(rows: number): string {
  if (rows >= 1_000_000) return `${(rows / 1_000_000).toFixed(1)}M`;
  if (rows >= 1000) return `${(rows / 1000).toFixed(1)}k`;
  return rows.toLocaleString();
}

function formatTime(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(2)}ms`;
}

function flattenNodes(nodes: ExplainNode[], depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    result.push(...flattenNodes(node.children, depth + 1));
  }
  return result;
}

interface FlatNode {
  node: ExplainNode;
  depth: number;
}

function getSeverityIcon(severity: OptimizationSeverity) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" aria-hidden="true" />;
  }
}

function getSeverityBadgeVariant(
  severity: OptimizationSeverity
): 'destructive' | 'secondary' | 'outline' {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'warning':
      return 'secondary';
    case 'info':
      return 'outline';
  }
}

// ============================================================
// TREE NODE COMPONENT
// ============================================================

interface TreeNodeProps {
  node: ExplainNode;
  depth: number;
  planTotalCost: number;
  optimizations: QueryOptimization[];
}

function TreeNode({ node, depth, planTotalCost, optimizations }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const expensive = isExpensiveNode(node);

  const costPercentage = planTotalCost > 0
    ? ((node.totalCost ?? 0) / planTotalCost) * 100
    : 0;

  const nodeOptimizations = optimizations.filter(
    (opt) => opt.affectedObject === node.object
  );

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50',
          expensive && 'bg-destructive/5 border-l-2 border-destructive'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label={expanded ? 'Collapse node' : 'Expand node'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        {/* Operation name */}
        <span
          className={cn(
            'font-mono text-xs font-medium',
            expensive && 'text-destructive'
          )}
        >
          {node.operation}
        </span>

        {/* Object name */}
        {node.object && (
          <span className="text-xs text-muted-foreground">
            on <span className="font-mono">{node.object}</span>
          </span>
        )}

        {/* Metrics */}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {node.totalCost !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    'cursor-default',
                    expensive && 'text-destructive font-medium'
                  )}
                >
                  cost: {formatCost(node.totalCost)}
                </TooltipTrigger>
                <TooltipContent>
                  {costPercentage.toFixed(1)}% of total plan cost
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <span>rows: {formatRows(node.rows)}</span>

          {node.actualTime !== undefined && (
            <span>time: {formatTime(node.actualTime)}</span>
          )}

          {expensive && (
            <Badge variant="destructive" className="text-[10px] h-4">
              expensive
            </Badge>
          )}
        </div>
      </div>

      {/* Inline optimization suggestions for this node */}
      {nodeOptimizations.length > 0 && (
        <div
          className="flex flex-col gap-1 py-1"
          style={{ paddingLeft: `${depth * 20 + 36}px` }}
        >
          {nodeOptimizations.map((opt, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 px-2 py-1 text-xs"
            >
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="text-amber-800 dark:text-amber-200">
                {opt.suggestedFix}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              planTotalCost={planTotalCost}
              optimizations={optimizations}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TABLE VIEW COMPONENT
// ============================================================

interface PlanTableViewProps {
  nodes: ExplainNode[];
  planTotalCost: number;
}

function PlanTableView({ nodes, planTotalCost }: PlanTableViewProps) {
  const flatNodes = useMemo(() => flattenNodes(nodes), [nodes]);

  return (
    <ScrollArea className="max-h-[400px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-[300px]">Operation</TableHead>
            <TableHead className="text-xs text-right">Cost</TableHead>
            <TableHead className="text-xs text-right">Rows</TableHead>
            <TableHead className="text-xs text-right">Time</TableHead>
            <TableHead className="text-xs text-right">% of Total</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flatNodes.map(({ node, depth }) => {
            const expensive = isExpensiveNode(node);
            const costPct = planTotalCost > 0
              ? ((node.totalCost ?? 0) / planTotalCost) * 100
              : 0;

            return (
              <TableRow
                key={node.id}
                className={cn(expensive && 'bg-destructive/5')}
              >
                <TableCell className="text-xs font-mono">
                  <span style={{ paddingLeft: `${depth * 16}px` }}>
                    {node.operation}
                    {node.object && (
                      <span className="text-muted-foreground ml-1">
                        ({node.object})
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    'text-xs text-right font-mono',
                    expensive && 'text-destructive font-medium'
                  )}
                >
                  {formatCost(node.totalCost)}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  {formatRows(node.rows)}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  {formatTime(node.actualTime)}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  {costPct > 0 ? `${costPct.toFixed(1)}%` : '—'}
                </TableCell>
                <TableCell>
                  {expensive && (
                    <Badge variant="destructive" className="text-[10px] h-4">
                      expensive
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

// ============================================================
// OPTIMIZATION SUGGESTIONS PANEL
// ============================================================

interface OptimizationPanelProps {
  optimizations: QueryOptimization[];
}

function OptimizationPanel({ optimizations }: OptimizationPanelProps) {
  if (optimizations.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-300">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        No optimization issues detected. Query plan looks efficient.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {optimizations.map((opt, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 rounded-lg border p-3"
        >
          {getSeverityIcon(opt.severity)}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={getSeverityBadgeVariant(opt.severity)} className="text-[10px]">
                {opt.severity}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {opt.category}
              </span>
              {opt.affectedObject && (
                <span className="text-xs text-muted-foreground">
                  — {opt.affectedObject}
                </span>
              )}
            </div>
            <p className="text-sm">{opt.description}</p>
            <div className="flex items-start gap-1.5 mt-1 rounded bg-muted/50 p-2">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{opt.suggestedFix}</p>
            </div>
            {opt.estimatedImpact && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Impact: {opt.estimatedImpact}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN EXPLAIN VIEWER COMPONENT
// ============================================================

export interface ExplainViewerProps {
  plan: ExplainPlan;
  optimizations?: QueryOptimization[];
  className?: string;
}

export function ExplainViewer({
  plan,
  optimizations = [],
  className,
}: ExplainViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            EXPLAIN Plan
            <Badge variant="outline" className="text-[10px] font-mono">
              {plan.driver}
            </Badge>
          </CardTitle>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <Button
              variant={viewMode === 'tree' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setViewMode('tree')}
              aria-label="Tree view"
              aria-pressed={viewMode === 'tree'}
            >
              <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
              Tree
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <TableIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Table
            </Button>
          </div>
        </div>

        {/* Plan summary metrics */}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>
            Total cost: <span className="font-mono font-medium text-foreground">{formatCost(plan.totalCost)}</span>
          </span>
          <span>
            Rows: <span className="font-mono font-medium text-foreground">{formatRows(plan.totalRows)}</span>
          </span>
          {plan.executionTimeMs !== undefined && (
            <span>
              Execution: <span className="font-mono font-medium text-foreground">{formatTime(plan.executionTimeMs)}</span>
            </span>
          )}
          {plan.planningTimeMs !== undefined && (
            <span>
              Planning: <span className="font-mono font-medium text-foreground">{formatTime(plan.planningTimeMs)}</span>
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {/* Plan visualization */}
        {plan.nodes.length > 0 ? (
          <div className="rounded-lg border">
            {viewMode === 'tree' ? (
              <ScrollArea className="max-h-[400px] p-2">
                {plan.nodes.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    planTotalCost={plan.totalCost}
                    optimizations={optimizations}
                  />
                ))}
              </ScrollArea>
            ) : (
              <PlanTableView nodes={plan.nodes} planTotalCost={plan.totalCost} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No plan nodes available.
          </div>
        )}

        {/* Optimization suggestions */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            Optimization Suggestions
            {optimizations.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                {optimizations.length}
              </Badge>
            )}
          </h3>
          <OptimizationPanel optimizations={optimizations} />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// EXPLAIN BUTTON (for Query Builder integration)
// ============================================================

export interface ExplainButtonProps {
  connectionId: string;
  sql: string;
  disabled?: boolean;
  onExplainResult?: (plan: ExplainPlan, optimizations: QueryOptimization[]) => void;
}

export function ExplainButton({
  connectionId,
  sql,
  disabled = false,
  onExplainResult,
}: ExplainButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ExplainPlan | null>(null);
  const [optimizations, setOptimizations] = useState<QueryOptimization[]>([]);
  const [showViewer, setShowViewer] = useState(false);

  const handleExplain = useCallback(async () => {
    const trimmedSql = sql.trim();
    if (!trimmedSql || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, sql: trimmedSql }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ?? `Request failed (${response.status})`
        );
      }

      const data = await response.json() as {
        plan: ExplainPlan;
        optimizations: QueryOptimization[];
      };

      setPlan(data.plan);
      setOptimizations(data.optimizations);
      setShowViewer(true);
      onExplainResult?.(data.plan, data.optimizations);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate EXPLAIN plan';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, sql, isLoading, onExplainResult]);

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={handleExplain}
        disabled={disabled || !sql.trim() || isLoading}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        {isLoading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {isLoading ? 'Analyzing…' : 'Explain'}
      </Button>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {showViewer && plan && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 z-10 h-6 text-[10px]"
            onClick={() => setShowViewer(false)}
          >
            Close
          </Button>
          <ExplainViewer plan={plan} optimizations={optimizations} />
        </div>
      )}
    </div>
  );
}
