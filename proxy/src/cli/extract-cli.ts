#!/usr/bin/env node
/**
 * Extract CLI — Manage data extract schedules via the proxy API.
 *
 * Commands:
 *   list              List all extracts
 *   run <id>          Trigger an immediate extract run
 *   schedule <id>     Set or update a cron schedule for an extract
 *   status <id>       Get current status and run history
 *   cancel <id>       Delete an extract and cancel scheduled jobs
 *
 * Usage:
 *   npx tsx src/cli/extract-cli.ts list
 *   npx tsx src/cli/extract-cli.ts run <extract-id>
 *   npx tsx src/cli/extract-cli.ts schedule <extract-id> --cron "0 * * * *"
 *   npx tsx src/cli/extract-cli.ts status <extract-id>
 *   npx tsx src/cli/extract-cli.ts cancel <extract-id>
 */

import { Command } from 'commander';

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULT_BASE_URL = 'http://localhost:4000';
const API_PATH = '/api/extracts';

function getBaseUrl(): string {
  return process.env.PROXY_BASE_URL || DEFAULT_BASE_URL;
}

function getAuthToken(): string {
  const token = process.env.PROXY_AUTH_TOKEN || '';
  if (!token) {
    console.error(
      'Warning: PROXY_AUTH_TOKEN is not set. Requests may fail with 401.',
    );
  }
  return token;
}

// ============================================================
// HTTP CLIENT
// ============================================================

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${API_PATH}${path}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = (await response.json()) as T;

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// ============================================================
// OUTPUT HELPERS
// ============================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function printError(response: ApiResponse): void {
  const err = (response.data as { error?: { message?: string } })?.error;
  console.error(
    `Error (${response.status}): ${err?.message || 'Unknown error'}`,
  );
}

// ============================================================
// COMMANDS
// ============================================================

interface ExtractListItem {
  id: string;
  name: string;
  status: string;
  schedule: { cron: string; enabled: boolean } | null;
  lastRunAt: string | null;
  createdAt: string;
}

interface ExtractListResponse {
  items: ExtractListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

async function listExtracts(options: { page?: string; limit?: string }): Promise<void> {
  const page = options.page || '1';
  const limit = options.limit || '20';

  const response = await apiRequest<ExtractListResponse>(
    'GET',
    `?page=${page}&limit=${limit}`,
  );

  if (!response.ok) {
    printError(response);
    process.exitCode = 1;
    return;
  }

  const { items, pagination } = response.data;

  if (items.length === 0) {
    console.log('No extracts found.');
    return;
  }

  console.log(
    `Extracts (page ${pagination.page}/${pagination.totalPages}, total: ${pagination.total}):`,
  );
  console.log('');
  console.log(
    '  ID                                    Name                 Status      Schedule         Last Run',
  );
  console.log(
    '  ' + '─'.repeat(110),
  );

  for (const item of items) {
    const schedule = item.schedule?.enabled
      ? item.schedule.cron
      : 'none';
    const lastRun = formatDate(item.lastRunAt);
    const name = item.name.length > 18
      ? item.name.slice(0, 17) + '…'
      : item.name.padEnd(18);

    console.log(
      `  ${item.id}  ${name}  ${item.status.padEnd(10)}  ${schedule.padEnd(15)}  ${lastRun}`,
    );
  }

  console.log('');
}

interface RunResponse {
  id: string;
  runId: string;
  jobId: string;
  status: string;
  startedAt: string;
  message: string;
}

async function runExtract(id: string): Promise<void> {
  const response = await apiRequest<RunResponse>('POST', `/${id}/test`);

  if (!response.ok) {
    printError(response);
    process.exitCode = 1;
    return;
  }

  const { runId, status, startedAt, message } = response.data;
  console.log(`Extract run queued successfully.`);
  console.log(`  Run ID:    ${runId}`);
  console.log(`  Status:    ${status}`);
  console.log(`  Started:   ${formatDate(startedAt)}`);
  console.log(`  Message:   ${message}`);
}

interface ScheduleResponse {
  id: string;
  schedule: { cron: string; enabled: boolean; timezone?: string };
  jobId?: string;
  updatedAt: string;
}

async function scheduleExtract(
  id: string,
  options: { cron: string; timezone?: string; disable?: boolean },
): Promise<void> {
  const body = {
    cron: options.cron,
    enabled: !options.disable,
    timezone: options.timezone,
  };

  const response = await apiRequest<ScheduleResponse>(
    'PUT',
    `/${id}/schedule`,
    body,
  );

  if (!response.ok) {
    printError(response);
    process.exitCode = 1;
    return;
  }

  const { schedule, updatedAt } = response.data;
  console.log(`Schedule updated for extract ${id}.`);
  console.log(`  Cron:      ${schedule.cron}`);
  console.log(`  Enabled:   ${schedule.enabled}`);
  if (schedule.timezone) {
    console.log(`  Timezone:  ${schedule.timezone}`);
  }
  console.log(`  Updated:   ${formatDate(updatedAt)}`);
}

interface StatusResponse {
  id: string;
  name: string;
  status: string;
  schedule: { cron: string; enabled: boolean; timezone?: string } | null;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
  lastRunRowCount: number | null;
  nextRunAt: string | null;
  history: {
    id: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    status: string;
    rowCount?: number;
    error?: string;
  }[];
}

async function statusExtract(id: string): Promise<void> {
  const response = await apiRequest<StatusResponse>('GET', `/${id}/status`);

  if (!response.ok) {
    printError(response);
    process.exitCode = 1;
    return;
  }

  const data = response.data;
  console.log(`Extract: ${data.name} (${data.id})`);
  console.log(`  Status:         ${data.status}`);
  console.log(`  Schedule:       ${data.schedule?.enabled ? data.schedule.cron : 'none'}`);
  console.log(`  Last Run:       ${formatDate(data.lastRunAt)}`);
  console.log(`  Last Duration:  ${data.lastRunDurationMs != null ? `${data.lastRunDurationMs}ms` : '—'}`);
  console.log(`  Last Row Count: ${data.lastRunRowCount ?? '—'}`);
  console.log(`  Next Run:       ${formatDate(data.nextRunAt)}`);

  if (data.lastRunError) {
    console.log(`  Last Error:     ${data.lastRunError}`);
  }

  if (data.history.length > 0) {
    console.log('');
    console.log('  Recent History:');
    console.log('    Status      Started                   Duration    Rows');
    console.log('    ' + '─'.repeat(70));

    for (const run of data.history.slice(0, 10)) {
      const duration = run.durationMs != null ? `${run.durationMs}ms` : '—';
      const rows = run.rowCount != null ? String(run.rowCount) : '—';
      console.log(
        `    ${run.status.padEnd(10)}  ${formatDate(run.startedAt).padEnd(24)}  ${duration.padEnd(10)}  ${rows}`,
      );
    }
  }
}

interface CancelResponse {
  success: boolean;
  id: string;
}

async function cancelExtract(id: string, options: { force?: boolean }): Promise<void> {
  if (!options.force) {
    console.log(`Deleting extract ${id} and cancelling all scheduled jobs.`);
    console.log('Use --force to skip this confirmation in scripts.');
  }

  const response = await apiRequest<CancelResponse>('DELETE', `/${id}`);

  if (!response.ok) {
    printError(response);
    process.exitCode = 1;
    return;
  }

  console.log(`Extract ${id} deleted successfully.`);
}

// ============================================================
// CLI PROGRAM
// ============================================================

const program = new Command();

program
  .name('extract-cli')
  .description('Manage data extract schedules via the proxy API')
  .version('1.0.0');

program
  .command('list')
  .description('List all extracts with pagination')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Items per page', '20')
  .action(async (options) => {
    try {
      await listExtracts(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to list extracts: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('run')
  .description('Trigger an immediate extract run')
  .argument('<id>', 'Extract ID (UUID)')
  .action(async (id: string) => {
    try {
      await runExtract(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to run extract: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('schedule')
  .description('Set or update a cron schedule for an extract')
  .argument('<id>', 'Extract ID (UUID)')
  .requiredOption('-c, --cron <expression>', 'Cron expression (5 or 6 fields)')
  .option('-t, --timezone <tz>', 'Timezone for schedule (e.g., America/New_York)')
  .option('-d, --disable', 'Disable the schedule instead of enabling')
  .action(async (id: string, options) => {
    try {
      await scheduleExtract(id, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to update schedule: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('status')
  .description('Get current status and run history for an extract')
  .argument('<id>', 'Extract ID (UUID)')
  .action(async (id: string) => {
    try {
      await statusExtract(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to get extract status: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('cancel')
  .description('Delete an extract and cancel all scheduled jobs')
  .argument('<id>', 'Extract ID (UUID)')
  .option('-f, --force', 'Skip confirmation message')
  .action(async (id: string, options) => {
    try {
      await cancelExtract(id, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to cancel extract: ${message}`);
      process.exitCode = 1;
    }
  });

program.parse();
