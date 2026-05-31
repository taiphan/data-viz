'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Activity,
  Database,
  Users,
  Upload,
  Download,
  RefreshCw,
  XCircle,
  Server,
  HardDrive,
  Cpu,
  Clock,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ProxyStatus {
  status: string;
  version: string;
  uptime: {
    ms: number;
    seconds: number;
    formatted: string;
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    rssMb: number;
    heapUsedMb: number;
  };
  cpu: {
    user: number;
    system: number;
    userMs: number;
    systemMs: number;
  };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpuCount: number;
    totalMemoryMb: number;
    freeMemoryMb: number;
  };
  timestamp: string;
}

interface ConnectionPool {
  connectionId: string;
  driver: string;
  activeConnections: number;
  createdAt: string;
  lastUsedAt: string;
  idleMs: number;
}

interface ConnectionsResponse {
  totalPools: number;
  connections: ConnectionPool[];
  timestamp: string;
}

interface SessionSnapshot {
  sessionId: string;
  userId: string;
  connectionCount: number;
  queriesPerMinute: number;
  totalQueries: number;
  dataTransferredBytes: number;
  durationMs: number;
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string;
}

interface SessionMetrics {
  activeSessions: number;
  totalSessions: number;
  totalQueries: number;
  totalDataTransferredBytes: number;
  sessions: SessionSnapshot[];
  timestamp: string;
}

interface QueueInfo {
  name: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueuesResponse {
  queues: QueueInfo[];
  timestamp: string;
}

interface DeploymentRecord {
  id: string;
  action: 'export' | 'import';
  workbookId: string;
  workbookName: string;
  metadata: {
    author: string;
    description: string;
    timestamp: string;
    exportId: string;
  };
  version: string;
  createdAt: string;
}

// ============================================================
// API HELPERS
// ============================================================

const ADMIN_API_BASE = '/api/admin';

async function fetchAdmin<T>(path: string, options?: RequestInit): Promise<T> {
  const adminToken = typeof window !== 'undefined'
    ? sessionStorage.getItem('admin-token') || ''
    : '';

  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ============================================================
// DASHBOARD TAB
// ============================================================

interface DashboardTabProps {
  status: ProxyStatus | null;
  connections: ConnectionsResponse | null;
  queues: QueuesResponse | null;
  loading: boolean;
  error: string | null;
}

function DashboardTab({ status, connections, queues, loading, error }: DashboardTabProps) {
  if (error) {
    return (
      <div className="p-4 text-center text-destructive text-sm">
        <p>{error}</p>
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Loading dashboard...
      </div>
    );
  }

  const memoryUsedPercent = status
    ? Math.round((status.memory.heapUsed / status.memory.heapTotal) * 100)
    : 0;

  const totalPoolConnections = connections
    ? connections.connections.reduce((sum, c) => sum + c.activeConnections, 0)
    : 0;

  const maxPoolConnections = 10; // per-user max from requirements

  const totalQueueJobs = queues
    ? queues.queues.reduce((sum, q) => sum + q.active + q.waiting + q.delayed, 0)
    : 0;

  const failedQueueJobs = queues
    ? queues.queues.reduce((sum, q) => sum + q.failed, 0)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {/* Proxy Health Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" aria-hidden="true" />
            Proxy Health
          </CardTitle>
          <CardDescription>Service status and uptime</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={status?.status === 'ok' ? 'default' : 'destructive'}>
                {status?.status || 'unknown'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-medium">{status?.version || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uptime</span>
              <span className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {status?.uptime.formatted || '-'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Node.js</span>
              <span className="text-sm font-medium">{status?.system.nodeVersion || '-'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memory & CPU Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" aria-hidden="true" />
            Resources
          </CardTitle>
          <CardDescription>Memory and CPU usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Heap Memory</span>
                <span className="text-sm font-medium">
                  {status?.memory.heapUsedMb || 0} / {status ? Math.round(status.memory.heapTotal / 1024 / 1024) : 0} MB
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={memoryUsedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Heap memory usage"
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    memoryUsedPercent > 80 ? 'bg-destructive' :
                    memoryUsedPercent > 60 ? 'bg-yellow-500' : 'bg-primary'
                  }`}
                  style={{ width: `${memoryUsedPercent}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">RSS</span>
              <span className="text-sm font-medium">{status?.memory.rssMb || 0} MB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                <Cpu className="h-3 w-3 inline mr-1" aria-hidden="true" />
                CPU (user)
              </span>
              <span className="text-sm font-medium">{status?.cpu.userMs || 0} ms</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Pool Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" aria-hidden="true" />
            Connection Pools
          </CardTitle>
          <CardDescription>Active database connections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Active Pools</span>
                <span className="text-sm font-medium">
                  {connections?.totalPools || 0}
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={totalPoolConnections}
                aria-valuemin={0}
                aria-valuemax={maxPoolConnections}
                aria-label="Connection pool usage"
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    totalPoolConnections >= maxPoolConnections ? 'bg-destructive' :
                    totalPoolConnections >= maxPoolConnections * 0.7 ? 'bg-yellow-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min((totalPoolConnections / maxPoolConnections) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Connections</span>
              <span className="text-sm font-medium">{totalPoolConnections}</span>
            </div>
            {connections && connections.connections.length > 0 && (
              <div className="space-y-1">
                {connections.connections.slice(0, 3).map((pool) => (
                  <div key={pool.connectionId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[120px]">
                      {pool.driver}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {pool.activeConnections} active
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden="true" />
            Queue Status
          </CardTitle>
          <CardDescription>BullMQ job queues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {queues && queues.queues.length > 0 ? (
              queues.queues.map((queue) => (
                <div key={queue.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{queue.name}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="default" className="text-[10px]">
                      {queue.active} active
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {queue.waiting} waiting
                    </Badge>
                    {queue.failed > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {queue.failed} failed
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {queue.completed} done
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">No queues configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalQueueJobs === 0 ? 'Queues will appear when jobs are scheduled' : ''}
                </p>
              </div>
            )}
            {failedQueueJobs > 0 && (
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-sm text-muted-foreground">Total Failed</span>
                <Badge variant="destructive">{failedQueueJobs}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SESSIONS TAB
// ============================================================

interface SessionsTabProps {
  sessions: SessionMetrics | null;
  loading: boolean;
  onForceDisconnect: (sessionId: string) => void;
}

function SessionsTab({ sessions, loading, onForceDisconnect }: SessionsTabProps) {
  if (loading && !sessions) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Loading sessions...
      </div>
    );
  }

  if (!sessions || sessions.sessions.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No active sessions
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-2xl font-bold">{sessions.activeSessions}</div>
            <p className="text-xs text-muted-foreground">Active Sessions</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-2xl font-bold">{sessions.totalSessions}</div>
            <p className="text-xs text-muted-foreground">Total Sessions</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-2xl font-bold">{sessions.totalQueries}</div>
            <p className="text-xs text-muted-foreground">Total Queries</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-2xl font-bold">
              {formatBytes(sessions.totalDataTransferredBytes)}
            </div>
            <p className="text-xs text-muted-foreground">Data Transferred</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden="true" />
            Active Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Connections</TableHead>
                <TableHead>Queries/min</TableHead>
                <TableHead>Data Transferred</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.sessions.map((session) => (
                <TableRow key={session.sessionId}>
                  <TableCell className="font-medium">
                    <span className="truncate max-w-[120px] inline-block" title={session.userId}>
                      {session.userId}
                    </span>
                  </TableCell>
                  <TableCell>{session.connectionCount}</TableCell>
                  <TableCell>{session.queriesPerMinute}</TableCell>
                  <TableCell>{formatBytes(session.dataTransferredBytes)}</TableCell>
                  <TableCell>{formatDuration(session.durationMs)}</TableCell>
                  <TableCell>
                    <Badge variant={session.isActive ? 'default' : 'secondary'}>
                      {session.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {session.isActive && (
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => onForceDisconnect(session.sessionId)}
                        aria-label={`Force disconnect session for ${session.userId}`}
                      >
                        <XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                        Disconnect
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// DEPLOYMENTS TAB
// ============================================================

interface DeploymentsTabProps {
  history: DeploymentRecord[];
  loading: boolean;
  onExport: () => void;
  onImport: () => void;
}

function DeploymentsTab({ history, loading, onExport, onImport }: DeploymentsTabProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Export Workbook
        </Button>
        <Button variant="outline" onClick={onImport}>
          <Upload className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Import Workbook
        </Button>
      </div>

      {/* Deployment History */}
      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
          <CardDescription>Recent export and import operations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading history...
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deployments yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Workbook</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Badge variant={record.action === 'export' ? 'secondary' : 'default'}>
                        {record.action === 'export' ? (
                          <Download className="h-3 w-3 mr-1" aria-hidden="true" />
                        ) : (
                          <Upload className="h-3 w-3 mr-1" aria-hidden="true" />
                        )}
                        {record.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{record.workbookName}</TableCell>
                    <TableCell>{record.metadata.author}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.version}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(record.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ADMIN PANEL (MAIN COMPONENT)
// ============================================================

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [connections, setConnections] = useState<ConnectionsResponse | null>(null);
  const [sessions, setSessions] = useState<SessionMetrics | null>(null);
  const [queues, setQueues] = useState<QueuesResponse | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<DeploymentRecord[]>([]);

  // --------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statusRes, connectionsRes, queuesRes] = await Promise.all([
        fetchAdmin<ProxyStatus>('/status'),
        fetchAdmin<ConnectionsResponse>('/connections'),
        fetchAdmin<QueuesResponse>('/queues'),
      ]);

      setStatus(statusRes);
      setConnections(connectionsRes);
      setQueues(queuesRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessionsData = useCallback(async () => {
    setLoading(true);
    try {
      const sessionsRes = await fetchAdmin<SessionMetrics>('/sessions');
      setSessions(sessionsRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sessions';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeploymentHistory = useCallback(async () => {
    // Deployment history is stored in-memory on the proxy.
    // We fetch it from the query-history endpoint or a dedicated endpoint.
    // For now, we maintain local state from export/import operations.
    setLoading(false);
  }, []);

  // --------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------

  const handleForceDisconnect = useCallback(async (sessionId: string) => {
    try {
      await fetchAdmin(`/sessions/${sessionId}/disconnect`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'admin-panel-disconnect' }),
      });
      // Refresh sessions after disconnect
      await fetchSessionsData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect session';
      setError(message);
    }
  }, [fetchSessionsData]);

  const handleExport = useCallback(() => {
    // Trigger workbook export flow
    // In a full implementation, this would open a dialog to select a workbook
    // and call POST /api/deployments/export
    const event = new CustomEvent('admin:export-workbook');
    window.dispatchEvent(event);
  }, []);

  const handleImport = useCallback(() => {
    // Trigger workbook import flow
    // In a full implementation, this would open a file picker for JSON bundle
    // and call POST /api/deployments/import
    const event = new CustomEvent('admin:import-workbook');
    window.dispatchEvent(event);
  }, []);

  const handleRefresh = useCallback(() => {
    switch (activeTab) {
      case 'dashboard':
        fetchDashboardData();
        break;
      case 'sessions':
        fetchSessionsData();
        break;
      case 'deployments':
        fetchDeploymentHistory();
        break;
    }
  }, [activeTab, fetchDashboardData, fetchSessionsData, fetchDeploymentHistory]);

  // --------------------------------------------------------
  // EFFECTS
  // --------------------------------------------------------

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessionsData();
    }
  }, [activeTab, fetchSessionsData]);

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------

  return (
    <div
      className="flex flex-col h-full bg-background"
      role="region"
      aria-label="Admin panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Admin Panel</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refresh data"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="dashboard"
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as string)}
        className="flex-1 flex flex-col"
      >
        <div className="border-b px-4">
          <TabsList variant="line">
            <TabsTrigger value="dashboard">
              <Activity className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <Users className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="deployments">
              <Upload className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Deployments
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="dashboard">
            <DashboardTab
              status={status}
              connections={connections}
              queues={queues}
              loading={loading}
              error={error}
            />
          </TabsContent>

          <TabsContent value="sessions">
            <SessionsTab
              sessions={sessions}
              loading={loading}
              onForceDisconnect={handleForceDisconnect}
            />
          </TabsContent>

          <TabsContent value="deployments">
            <DeploymentsTab
              history={deploymentHistory}
              loading={loading}
              onExport={handleExport}
              onImport={handleImport}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
