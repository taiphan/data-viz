'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import {
  usePerformanceMetricsStore,
  type RenderMetric,
} from '@/lib/performance/render-tracker';
import {
  getDashboardTracker,
  type DashboardLoadMetrics,
} from '@/lib/performance/dashboard-tracker';
import {
  generateRecommendations,
  type Recommendation,
  type QueryMetrics,
} from '@/lib/performance/recommendations';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

// ============================================================
// TYPES
// ============================================================

type SortField = 'duration' | 'timestamp' | 'query';
type SortDirection = 'asc' | 'desc';

interface SlowQuery {
  id: string;
  sql: string;
  executionTimeMs: number;
  rowsReturned: number;
  timestamp: string;
  driver: string;
}

interface HeavyDashboard {
  dashboardId: string;
  totalLoadTime: number;
  chartCount: number;
  timestamp: string;
}

interface RenderDistributionBucket {
  range: string;
  count: number;
}

interface QueryTimeHistogramBucket {
  range: string;
  count: number;
}

export interface PerformanceDashboardProps {
  queryMetrics?: SlowQuery[];
  className?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const RENDER_TIME_BUCKETS = [
  { label: '0-100ms', min: 0, max: 100 },
  { label: '100-500ms', min: 100, max: 500 },
  { label: '500ms-1s', min: 500, max: 1000 },
  { label: '1-2s', min: 1000, max: 2000 },
  { label: '2-5s', min: 2000, max: 5000 },
  { label: '5s+', min: 5000, max: Infinity },
];

const QUERY_TIME_BUCKETS = [
  { label: '0-50ms', min: 0, max: 50 },
  { label: '50-200ms', min: 50, max: 200 },
  { label: '200-500ms', min: 200, max: 500 },
  { label: '500ms-1s', min: 500, max: 1000 },
  { label: '1-5s', min: 1000, max: 5000 },
  { label: '5s+', min: 5000, max: Infinity },
];

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

// ============================================================
// HELPERS
// ============================================================

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatTimestamp(ts: string | number): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateSql(sql: string, maxLength: number = 60): string {
  if (sql.length <= maxLength) return sql;
  return `${sql.slice(0, maxLength)}…`;
}

function buildRenderDistribution(metrics: RenderMetric[]): RenderDistributionBucket[] {
  return RENDER_TIME_BUCKETS.map((bucket) => ({
    range: bucket.label,
    count: metrics.filter(
      (m) => m.totalRenderDuration >= bucket.min && m.totalRenderDuration < bucket.max
    ).length,
  }));
}

function buildQueryTimeHistogram(queries: SlowQuery[]): QueryTimeHistogramBucket[] {
  return QUERY_TIME_BUCKETS.map((bucket) => ({
    range: bucket.label,
    count: queries.filter(
      (q) => q.executionTimeMs >= bucket.min && q.executionTimeMs < bucket.max
    ).length,
  }));
}

function buildHeavyDashboards(metrics: DashboardLoadMetrics[]): HeavyDashboard[] {
  return metrics
    .map((m) => ({
      dashboardId: m.dashboardId,
      totalLoadTime: m.totalLoadTime,
      chartCount: m.chartTimings.length,
      timestamp: m.timestamp,
    }))
    .sort((a, b) => b.totalLoadTime - a.totalLoadTime);
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function SlowQueriesTable({
  queries,
  sortField,
  sortDirection,
  onSort,
}: {
  queries: SlowQuery[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const sortedQueries = useMemo(() => {
    const sorted = [...queries];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'duration':
          comparison = a.executionTimeMs - b.executionTimeMs;
          break;
        case 'timestamp':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'query':
          comparison = a.sql.localeCompare(b.sql);
          break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });
    return sorted;
  }, [queries, sortField, sortDirection]);

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  if (queries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No query data available.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            className="cursor-pointer select-none"
            onClick={() => onSort('query')}
            aria-sort={sortField === 'query' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}
          >
            Query{getSortIndicator('query')}
          </TableHead>
          <TableHead
            className="cursor-pointer select-none"
            onClick={() => onSort('duration')}
            aria-sort={sortField === 'duration' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}
          >
            Duration{getSortIndicator('duration')}
          </TableHead>
          <TableHead>Rows</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead
            className="cursor-pointer select-none"
            onClick={() => onSort('timestamp')}
            aria-sort={sortField === 'timestamp' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}
          >
            Time{getSortIndicator('timestamp')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedQueries.map((query) => (
          <TableRow key={query.id}>
            <TableCell
              className="max-w-[200px] truncate font-mono text-xs"
              title={query.sql}
            >
              {truncateSql(query.sql)}
            </TableCell>
            <TableCell className="font-mono">
              {formatDuration(query.executionTimeMs)}
            </TableCell>
            <TableCell>{query.rowsReturned.toLocaleString()}</TableCell>
            <TableCell>
              <Badge variant="outline">{query.driver}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatTimestamp(query.timestamp)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HeavyDashboardsList({ dashboards }: { dashboards: HeavyDashboard[] }) {
  if (dashboards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No dashboard load data available.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dashboard</TableHead>
          <TableHead>Load Time</TableHead>
          <TableHead>Charts</TableHead>
          <TableHead>Last Loaded</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dashboards.map((dashboard) => (
          <TableRow key={`${dashboard.dashboardId}-${dashboard.timestamp}`}>
            <TableCell className="font-medium">
              {dashboard.dashboardId}
            </TableCell>
            <TableCell className="font-mono">
              {formatDuration(dashboard.totalLoadTime)}
            </TableCell>
            <TableCell>{dashboard.chartCount}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatTimestamp(dashboard.timestamp)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DistributionChart({
  data,
  title,
  color,
}: {
  data: { range: string; count: number }[];
  title: string;
  color: string;
}) {
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-sm text-muted-foreground">No data to display</p>
      </div>
    );
  }

  return (
    <div className="h-[200px]" aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecommendationsList({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No performance issues detected. All systems running smoothly.
      </p>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Performance recommendations">
      {recommendations.map((rec) => (
        <li
          key={rec.id}
          className="rounded-lg border p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[rec.severity] ?? 'outline'}>
                  {rec.severity}
                </Badge>
                <span className="text-sm font-medium">{rec.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {rec.description}
              </p>
            </div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs font-medium text-foreground">
              Suggested action:
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {rec.action}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

/**
 * Admin Performance Dashboard
 *
 * Displays performance monitoring data including:
 * - Slow queries table (sortable by duration)
 * - Heavy dashboards list
 * - Render time distribution chart
 * - Query time histogram
 * - Active recommendations with actionable suggestions
 */
export function PerformanceDashboard({
  queryMetrics = [],
  className,
}: PerformanceDashboardProps) {
  const [sortField, setSortField] = useState<SortField>('duration');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const renderMetrics = usePerformanceMetricsStore((state) => state.metrics);
  const dashboardMetrics = useMemo(
    () => getDashboardTracker().getMetricsHistory(),
    []
  );

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('desc');
      return field;
    });
  }, []);

  const renderDistribution = useMemo(
    () => buildRenderDistribution(renderMetrics),
    [renderMetrics]
  );

  const queryTimeHistogram = useMemo(
    () => buildQueryTimeHistogram(queryMetrics),
    [queryMetrics]
  );

  const heavyDashboards = useMemo(
    () => buildHeavyDashboards(dashboardMetrics),
    [dashboardMetrics]
  );

  const recommendations = useMemo(() => {
    const recQueryMetrics: QueryMetrics[] = queryMetrics.map((q) => ({
      queryId: q.id,
      rowsScanned: q.rowsReturned,
      executionTimeMs: q.executionTimeMs,
    }));

    return generateRecommendations({
      renderMetrics,
      dashboardMetrics,
      queryMetrics: recQueryMetrics,
    });
  }, [renderMetrics, dashboardMetrics, queryMetrics]);

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor render times, query performance, and dashboard load metrics.
          </p>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Render Time Distribution</CardTitle>
              <CardDescription>
                Distribution of chart render durations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DistributionChart
                data={renderDistribution}
                title="Render time distribution"
                color="hsl(var(--primary))"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Query Time Histogram</CardTitle>
              <CardDescription>
                Distribution of query execution times
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DistributionChart
                data={queryTimeHistogram}
                title="Query time histogram"
                color="hsl(var(--secondary))"
              />
            </CardContent>
          </Card>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="queries">
          <TabsList>
            <TabsTrigger value="queries">
              Slow Queries
              {queryMetrics.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {queryMetrics.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dashboards">
              Heavy Dashboards
              {heavyDashboards.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {heavyDashboards.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recommendations">
              Recommendations
              {recommendations.length > 0 && (
                <Badge
                  variant={recommendations.some((r) => r.severity === 'critical') ? 'destructive' : 'secondary'}
                  className="ml-1.5"
                >
                  {recommendations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queries">
            <Card>
              <CardHeader>
                <CardTitle>Slow Queries</CardTitle>
                <CardDescription>
                  Queries sorted by execution duration. Click column headers to sort.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SlowQueriesTable
                  queries={queryMetrics}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashboards">
            <Card>
              <CardHeader>
                <CardTitle>Heavy Dashboards</CardTitle>
                <CardDescription>
                  Dashboards with the longest load times, sorted by duration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HeavyDashboardsList dashboards={heavyDashboards} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations">
            <Card>
              <CardHeader>
                <CardTitle>Active Recommendations</CardTitle>
                <CardDescription>
                  Performance optimization suggestions based on current metrics.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecommendationsList recommendations={recommendations} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
