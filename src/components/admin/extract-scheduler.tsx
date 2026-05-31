'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  Trash2,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ExtractSchedule {
  cron: string;
  enabled: boolean;
  timezone?: string;
}

interface ExtractRunRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  rowCount?: number;
  error?: string;
}

interface ExtractJob {
  id: string;
  name: string;
  connectionId: string;
  destination: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  schedule: ExtractSchedule | null;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunRowCount: number | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  history: ExtractRunRecord[];
  createdAt: string;
  updatedAt: string;
}

type JobFilter = 'all' | 'pending' | 'active' | 'completed' | 'failed';

// ============================================================
// CRON PRESETS
// ============================================================

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 6 AM', value: '0 6 * * *' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
] as const;

// ============================================================
// HELPERS
// ============================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function describeCron(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  if (preset) return preset.label;
  return cron;
}

// ============================================================
// API HELPERS
// ============================================================

const API_BASE = '/api/extracts';

async function fetchExtracts(): Promise<ExtractJob[]> {
  const res = await fetch(`${API_BASE}?limit=100`);
  if (!res.ok) throw new Error('Failed to fetch extracts');
  const data = await res.json();
  return data.items ?? [];
}

async function fetchExtractStatus(id: string): Promise<ExtractJob> {
  const res = await fetch(`${API_BASE}/${id}/status`);
  if (!res.ok) throw new Error('Failed to fetch extract status');
  return res.json();
}

async function updateSchedule(
  id: string,
  schedule: { cron: string; enabled: boolean; timezone?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedule),
  });
  if (!res.ok) throw new Error('Failed to update schedule');
}

async function triggerExtractRun(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/test`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger extract run');
}

async function deleteExtract(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete extract');
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status: ExtractJob['status'] }) {
  const config: Record<
    ExtractJob['status'],
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
  > = {
    idle: { variant: 'outline', icon: Clock },
    running: { variant: 'default', icon: Loader2 },
    completed: { variant: 'secondary', icon: CheckCircle2 },
    failed: { variant: 'destructive', icon: XCircle },
  };

  const { variant, icon: Icon } = config[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon
        className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {status}
    </Badge>
  );
}

// ============================================================
// CRON EXPRESSION BUILDER
// ============================================================

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

function CronExpressionBuilder({ value, onChange }: CronBuilderProps) {
  const isPreset = CRON_PRESETS.some((p) => p.value === value);
  const [mode, setMode] = useState<'preset' | 'custom'>(
    !isPreset && value ? 'custom' : 'preset',
  );
  const [customValue, setCustomValue] = useState(value);

  return (
    <div className="space-y-2" role="group" aria-label="Cron expression builder">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'preset' ? 'default' : 'outline'}
          className="h-7 text-xs cursor-pointer"
          onClick={() => setMode('preset')}
        >
          Presets
        </Button>
        <Button
          size="sm"
          variant={mode === 'custom' ? 'default' : 'outline'}
          className="h-7 text-xs cursor-pointer"
          onClick={() => setMode('custom')}
        >
          Custom
        </Button>
      </div>

      {mode === 'preset' ? (
        <div className="grid grid-cols-2 gap-1">
          {CRON_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              size="sm"
              variant={value === preset.value ? 'default' : 'outline'}
              className="h-7 text-xs justify-start cursor-pointer"
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="cron-custom" className="text-xs text-muted-foreground">
            Cron expression (min hour day month weekday)
          </Label>
          <div className="flex gap-2">
            <Input
              id="cron-custom"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="*/5 * * * *"
              className="h-7 text-xs font-mono"
            />
            <Button
              size="sm"
              className="h-7 text-xs cursor-pointer"
              onClick={() => onChange(customValue)}
              disabled={!customValue.trim()}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCHEDULE EDITOR DIALOG
// ============================================================

interface ScheduleEditorProps {
  job: ExtractJob;
  onSave: (id: string, cron: string, enabled: boolean) => Promise<void>;
  onClose: () => void;
}

function ScheduleEditor({ job, onSave, onClose }: ScheduleEditorProps) {
  const [cron, setCron] = useState(job.schedule?.cron ?? '0 * * * *');
  const [enabled, setEnabled] = useState(job.schedule?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(job.id, cron, enabled);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }, [job.id, cron, enabled, onSave, onClose]);

  return (
    <Card className="absolute inset-0 z-10 m-4">
      <CardHeader>
        <CardTitle className="text-sm">
          Schedule: {job.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CronExpressionBuilder value={cron} onChange={setCron} />

        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable schedule"
          />
          <Label className="text-xs">
            {enabled ? 'Schedule enabled' : 'Schedule paused'}
          </Label>
        </div>

        <div className="rounded border bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Expression:</span>{' '}
            <code className="font-mono">{cron}</code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">Description:</span>{' '}
            {describeCron(cron)}
          </p>
        </div>

        {error && (
          <p className="text-xs text-destructive" role="alert">{error}</p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={handleSave}
            disabled={saving || !cron.trim()}
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// RUN HISTORY TABLE
// ============================================================

interface RunHistoryProps {
  history: ExtractRunRecord[];
}

function RunHistory({ history }: RunHistoryProps) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No run history available
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Started</TableHead>
          <TableHead className="text-xs">Status</TableHead>
          <TableHead className="text-xs">Duration</TableHead>
          <TableHead className="text-xs">Rows</TableHead>
          <TableHead className="text-xs">Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="text-xs">
              {formatTimestamp(run.startedAt)}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  run.status === 'completed'
                    ? 'secondary'
                    : run.status === 'failed'
                      ? 'destructive'
                      : 'outline'
                }
                className="text-[10px]"
              >
                {run.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs font-mono">
              {run.durationMs != null ? formatDuration(run.durationMs) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono">
              {run.rowCount != null ? run.rowCount.toLocaleString() : '—'}
            </TableCell>
            <TableCell className="text-xs text-destructive max-w-[200px] truncate">
              {run.error ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================
// JOB ROW
// ============================================================

interface JobRowProps {
  job: ExtractJob;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onSchedule: (job: ExtractJob) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

function JobRow({
  job,
  isSelected,
  onSelect,
  onSchedule,
  onPause,
  onResume,
  onRetry,
  onDelete,
}: JobRowProps) {
  return (
    <TableRow
      className={isSelected ? 'bg-muted/50' : 'cursor-pointer'}
      onClick={() => onSelect(job.id)}
    >
      <TableCell>
        <div className="space-y-0.5">
          <p className="text-xs font-medium">{job.name}</p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
            {job.destination}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={job.status} />
      </TableCell>
      <TableCell className="text-xs">
        {job.schedule ? (
          <div className="space-y-0.5">
            <code className="text-[10px] font-mono bg-muted px-1 rounded">
              {job.schedule.cron}
            </code>
            <p className="text-[10px] text-muted-foreground">
              {job.schedule.enabled ? describeCron(job.schedule.cron) : 'Paused'}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">No schedule</span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {job.lastRunAt ? formatTimestamp(job.lastRunAt) : '—'}
      </TableCell>
      <TableCell className="text-xs font-mono">
        {job.lastRunDurationMs != null ? formatDuration(job.lastRunDurationMs) : '—'}
      </TableCell>
      <TableCell className="text-xs font-mono">
        {job.lastRunRowCount != null ? job.lastRunRowCount.toLocaleString() : '—'}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onSchedule(job)}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
            title="Edit schedule"
            aria-label={`Edit schedule for ${job.name}`}
          >
            <Calendar className="h-3.5 w-3.5" />
          </button>
          {job.schedule?.enabled ? (
            <button
              onClick={() => onPause(job.id)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              title="Pause schedule"
              aria-label={`Pause ${job.name}`}
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onResume(job.id)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              title="Resume schedule"
              aria-label={`Resume ${job.name}`}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {job.status === 'failed' && (
            <button
              onClick={() => onRetry(job.id)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              title="Retry failed job"
              aria-label={`Retry ${job.name}`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:text-destructive"
            title="Delete extract"
            aria-label={`Delete ${job.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================
// QUEUE SUMMARY CARDS
// ============================================================

interface QueueSummaryProps {
  jobs: ExtractJob[];
}

function QueueSummary({ jobs }: QueueSummaryProps) {
  const counts = {
    pending: jobs.filter((j) => j.status === 'idle' && j.schedule?.enabled).length,
    active: jobs.filter((j) => j.status === 'running').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  const cards = [
    { label: 'Pending', count: counts.pending, icon: Clock, color: 'text-muted-foreground' },
    { label: 'Active', count: counts.active, icon: Loader2, color: 'text-blue-500' },
    { label: 'Completed', count: counts.completed, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Failed', count: counts.failed, icon: XCircle, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(({ label, count, icon: Icon, color }) => (
        <Card key={label} size="sm">
          <CardContent className="flex items-center gap-2 py-2">
            <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
            <div>
              <p className="text-lg font-semibold leading-none">{count}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT: ExtractScheduler
// ============================================================

export function ExtractScheduler() {
  const [jobs, setJobs] = useState<ExtractJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobFilter>('all');
  const [editingJob, setEditingJob] = useState<ExtractJob | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<ExtractJob | null>(null);

  // Fetch all extracts
  const loadJobs = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchExtracts();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extracts');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load job detail with history
  const loadJobDetail = useCallback(async (id: string) => {
    try {
      const detail = await fetchExtractStatus(id);
      setJobDetail(detail);
    } catch {
      setJobDetail(null);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetail(selectedJobId);
    }
  }, [selectedJobId, loadJobDetail]);

  // Actions
  const handleSaveSchedule = useCallback(
    async (id: string, cron: string, enabled: boolean) => {
      await updateSchedule(id, { cron, enabled });
      await loadJobs();
    },
    [loadJobs],
  );

  const handlePause = useCallback(
    async (id: string) => {
      const job = jobs.find((j) => j.id === id);
      if (!job?.schedule) return;
      await updateSchedule(id, { cron: job.schedule.cron, enabled: false });
      await loadJobs();
    },
    [jobs, loadJobs],
  );

  const handleResume = useCallback(
    async (id: string) => {
      const job = jobs.find((j) => j.id === id);
      if (!job?.schedule) return;
      await updateSchedule(id, { cron: job.schedule.cron, enabled: true });
      await loadJobs();
    },
    [jobs, loadJobs],
  );

  const handleRetry = useCallback(
    async (id: string) => {
      await triggerExtractRun(id);
      await loadJobs();
    },
    [loadJobs],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteExtract(id);
      if (selectedJobId === id) {
        setSelectedJobId(null);
        setJobDetail(null);
      }
      await loadJobs();
    },
    [selectedJobId, loadJobs],
  );

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    switch (filter) {
      case 'pending':
        return job.status === 'idle' && job.schedule?.enabled;
      case 'active':
        return job.status === 'running';
      case 'completed':
        return job.status === 'completed';
      case 'failed':
        return job.status === 'failed';
      default:
        return true;
    }
  });

  // Loading state
  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-64"
        role="status"
        aria-label="Loading extract scheduler"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading scheduled jobs...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 cursor-pointer"
            onClick={loadJobs}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 p-4 h-full"
      role="region"
      aria-label="Extract Scheduler Admin"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Extract Scheduler</h1>
          <p className="text-xs text-muted-foreground">
            Manage scheduled data extract jobs
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 cursor-pointer"
          onClick={loadJobs}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Queue Summary */}
      <QueueSummary jobs={jobs} />

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Job List */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Schedule Editor Overlay */}
          {editingJob && (
            <ScheduleEditor
              job={editingJob}
              onSave={handleSaveSchedule}
              onClose={() => setEditingJob(null)}
            />
          )}

          {/* Filter Tabs */}
          <Tabs
            defaultValue="all"
            onValueChange={(val) => setFilter(val as JobFilter)}
          >
            <TabsList variant="line" className="mb-2">
              <TabsTrigger value="all">All ({jobs.length})</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({jobs.filter((j) => j.status === 'idle' && j.schedule?.enabled).length})
              </TabsTrigger>
              <TabsTrigger value="active">
                Active ({jobs.filter((j) => j.status === 'running').length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed ({jobs.filter((j) => j.status === 'completed').length})
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed ({jobs.filter((j) => j.status === 'failed').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filter}>
              <ScrollArea className="flex-1">
                {filteredJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      No {filter === 'all' ? '' : filter} jobs found
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Extract</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Schedule</TableHead>
                        <TableHead className="text-xs">Last Run</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                        <TableHead className="text-xs">Rows</TableHead>
                        <TableHead className="text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((job) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          isSelected={selectedJobId === job.id}
                          onSelect={setSelectedJobId}
                          onSchedule={setEditingJob}
                          onPause={handlePause}
                          onResume={handleResume}
                          onRetry={handleRetry}
                          onDelete={handleDelete}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Detail Panel */}
        <div className="w-80 flex-shrink-0 border-l pl-4">
          {selectedJobId && jobDetail ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">{jobDetail.name}</h2>
                <p className="text-[10px] text-muted-foreground">
                  Created {formatTimestamp(jobDetail.createdAt)}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </p>
                <StatusBadge status={jobDetail.status} />
              </div>

              {jobDetail.schedule && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Schedule
                  </p>
                  <p className="text-xs">
                    <code className="font-mono bg-muted px-1 rounded">
                      {jobDetail.schedule.cron}
                    </code>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {jobDetail.schedule.enabled ? describeCron(jobDetail.schedule.cron) : 'Paused'}
                  </p>
                </div>
              )}

              {jobDetail.nextRunAt && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Next Run
                  </p>
                  <p className="text-xs">{formatTimestamp(jobDetail.nextRunAt)}</p>
                </div>
              )}

              {jobDetail.lastRunError && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Last Error
                  </p>
                  <p className="text-xs text-destructive">{jobDetail.lastRunError}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Run History
                </p>
                <ScrollArea className="max-h-[300px]">
                  <RunHistory history={jobDetail.history} />
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">
                Select a job to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
