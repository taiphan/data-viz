// ============================================================
// FLOW PERSISTENCE — Save, Load, List, Schedule flows
// ============================================================

import type { FlowDefinition } from './types';

// ============================================================
// TYPES
// ============================================================

export interface FlowMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  schedule?: FlowSchedule;
  lastRunAt?: string;
  lastRunStatus?: 'completed' | 'error';
}

export interface FlowSchedule {
  cron: string;
  enabled: boolean;
  timezone?: string;
  jobId?: string;
}

export interface FlowListItem {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  schedule?: FlowSchedule;
  lastRunAt?: string;
  lastRunStatus?: 'completed' | 'error';
}

export interface FlowListResponse {
  items: FlowListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SaveFlowOptions {
  /** If true, also persist to the proxy backend */
  persistToProxy?: boolean;
}

export interface ScheduleFlowOptions {
  cron: string;
  enabled?: boolean;
  timezone?: string;
}

export interface FlowPersistenceConfig {
  proxyBaseUrl: string;
  authToken?: string;
}

// ============================================================
// LOCAL STORAGE KEY
// ============================================================

const FLOWS_STORAGE_KEY = 'data-viz:flows';

// ============================================================
// LOCAL PERSISTENCE (Workbook/localStorage)
// ============================================================

function getLocalFlows(): Map<string, FlowDefinition & { metadata?: FlowMetadata }> {
  try {
    const raw = localStorage.getItem(FLOWS_STORAGE_KEY);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw) as Array<FlowDefinition & { metadata?: FlowMetadata }>;
    return new Map(parsed.map((f) => [f.id, f]));
  } catch {
    return new Map();
  }
}

function setLocalFlows(
  flows: Map<string, FlowDefinition & { metadata?: FlowMetadata }>,
): void {
  const arr = Array.from(flows.values());
  localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(arr));
}

// ============================================================
// PROXY API CLIENT
// ============================================================

async function proxyRequest<T>(
  config: FlowPersistenceConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.proxyBaseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: { message?: string } })?.error?.message
      || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// ============================================================
// SAVE FLOW
// ============================================================

/**
 * Saves a flow definition locally and optionally to the proxy backend.
 * Returns the saved flow's metadata.
 */
export async function saveFlow(
  flow: FlowDefinition,
  config: FlowPersistenceConfig,
  options: SaveFlowOptions = {},
): Promise<FlowMetadata> {
  const now = new Date().toISOString();
  const { persistToProxy = true } = options;

  // Ensure timestamps
  const flowToSave: FlowDefinition = {
    ...flow,
    updatedAt: now,
    createdAt: flow.createdAt || now,
  };

  // Save locally
  const localFlows = getLocalFlows();
  const existing = localFlows.get(flow.id);
  const metadata: FlowMetadata = {
    id: flowToSave.id,
    name: flowToSave.name,
    description: flowToSave.description,
    createdAt: flowToSave.createdAt,
    updatedAt: flowToSave.updatedAt,
    schedule: existing?.metadata?.schedule,
    lastRunAt: existing?.metadata?.lastRunAt,
    lastRunStatus: existing?.metadata?.lastRunStatus,
  };

  localFlows.set(flow.id, { ...flowToSave, metadata });
  setLocalFlows(localFlows);

  // Persist to proxy if requested
  if (persistToProxy) {
    try {
      const response = await proxyRequest<{ id: string; updatedAt: string }>(
        config,
        '/api/flows',
        {
          method: 'POST',
          body: JSON.stringify(flowToSave),
        },
      );

      metadata.updatedAt = response.updatedAt || now;
    } catch {
      // Local save succeeded; proxy save is best-effort
      // The flow is still persisted locally
    }
  }

  return metadata;
}

// ============================================================
// LOAD FLOW
// ============================================================

/**
 * Loads a flow definition by ID. Tries local storage first, then proxy.
 */
export async function loadFlow(
  flowId: string,
  config: FlowPersistenceConfig,
): Promise<FlowDefinition | null> {
  // Try local first
  const localFlows = getLocalFlows();
  const local = localFlows.get(flowId);

  if (local) {
    const { metadata: _metadata, ...flowDef } = local;
    return flowDef as FlowDefinition;
  }

  // Fall back to proxy
  try {
    const flow = await proxyRequest<FlowDefinition>(
      config,
      `/api/flows/${flowId}`,
      { method: 'GET' },
    );

    // Cache locally
    localFlows.set(flow.id, flow);
    setLocalFlows(localFlows);

    return flow;
  } catch {
    return null;
  }
}

// ============================================================
// LIST FLOWS
// ============================================================

/**
 * Lists all saved flows with metadata. Merges local and proxy results.
 */
export async function listFlows(
  config: FlowPersistenceConfig,
  page = 1,
  limit = 20,
): Promise<FlowListResponse> {
  const localFlows = getLocalFlows();
  let allItems: FlowListItem[] = [];

  // Gather local flows
  for (const [, entry] of localFlows) {
    allItems.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      schedule: entry.metadata?.schedule,
      lastRunAt: entry.metadata?.lastRunAt,
      lastRunStatus: entry.metadata?.lastRunStatus,
    });
  }

  // Try to fetch from proxy and merge
  try {
    const proxyResponse = await proxyRequest<FlowListResponse>(
      config,
      `/api/flows?page=1&limit=100`,
      { method: 'GET' },
    );

    // Merge proxy flows that aren't already local
    const localIds = new Set(allItems.map((i) => i.id));
    for (const item of proxyResponse.items) {
      if (!localIds.has(item.id)) {
        allItems.push(item);
      }
    }
  } catch {
    // Proxy unavailable — use local only
  }

  // Sort by updatedAt descending
  allItems.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const total = allItems.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const items = allItems.slice(offset, offset + limit);

  return {
    items,
    pagination: { page, limit, total, totalPages },
  };
}

// ============================================================
// DELETE FLOW
// ============================================================

/**
 * Deletes a flow from local storage and proxy.
 */
export async function deleteFlow(
  flowId: string,
  config: FlowPersistenceConfig,
): Promise<boolean> {
  const localFlows = getLocalFlows();
  const existed = localFlows.has(flowId);
  localFlows.delete(flowId);
  setLocalFlows(localFlows);

  try {
    await proxyRequest<{ success: boolean }>(
      config,
      `/api/flows/${flowId}`,
      { method: 'DELETE' },
    );
  } catch {
    // Best-effort proxy deletion
  }

  return existed;
}

// ============================================================
// SCHEDULE FLOW
// ============================================================

/**
 * Schedules a flow for periodic execution via the proxy scheduler.
 * Integrates with the BullMQ-based scheduler (task 15).
 */
export async function scheduleFlow(
  flowId: string,
  scheduleOptions: ScheduleFlowOptions,
  config: FlowPersistenceConfig,
): Promise<FlowSchedule> {
  const { cron, enabled = true, timezone } = scheduleOptions;

  const response = await proxyRequest<{
    schedule: FlowSchedule;
    jobId?: string;
  }>(
    config,
    `/api/flows/${flowId}/schedule`,
    {
      method: 'PUT',
      body: JSON.stringify({ cron, enabled, timezone }),
    },
  );

  const schedule: FlowSchedule = {
    cron,
    enabled,
    timezone,
    jobId: response.jobId,
  };

  // Update local metadata
  const localFlows = getLocalFlows();
  const local = localFlows.get(flowId);
  if (local) {
    local.metadata = {
      ...local.metadata,
      id: local.id,
      name: local.name,
      createdAt: local.createdAt,
      updatedAt: new Date().toISOString(),
      schedule,
    };
    localFlows.set(flowId, local);
    setLocalFlows(localFlows);
  }

  return schedule;
}

// ============================================================
// UNSCHEDULE FLOW
// ============================================================

/**
 * Removes the schedule from a flow.
 */
export async function unscheduleFlow(
  flowId: string,
  config: FlowPersistenceConfig,
): Promise<void> {
  await proxyRequest<{ success: boolean }>(
    config,
    `/api/flows/${flowId}/schedule`,
    {
      method: 'DELETE',
    },
  );

  // Update local metadata
  const localFlows = getLocalFlows();
  const local = localFlows.get(flowId);
  if (local && local.metadata) {
    local.metadata.schedule = undefined;
    localFlows.set(flowId, local);
    setLocalFlows(localFlows);
  }
}
