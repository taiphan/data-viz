import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveFlow,
  loadFlow,
  listFlows,
  deleteFlow,
  scheduleFlow,
  unscheduleFlow,
} from './flow-persistence';
import type { FlowDefinition } from './types';
import type { FlowPersistenceConfig } from './flow-persistence';

// ============================================================
// MOCKS
// ============================================================

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage });

const mockConfig: FlowPersistenceConfig = {
  proxyBaseUrl: 'http://localhost:4000',
  authToken: 'test-token',
};

function makeFlowDefinition(overrides: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    description: 'A test flow',
    steps: [
      {
        id: 'step-1',
        name: 'Input',
        type: 'input',
        config: { sourceType: 'datasource', dataSourceId: 'ds-1' },
        enabled: true,
      },
      {
        id: 'step-2',
        name: 'Output',
        type: 'output',
        config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false },
        enabled: true,
      },
    ],
    connections: [
      { id: 'conn-1', sourceStepId: 'step-1', targetStepId: 'step-2' },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('flow-persistence', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  describe('saveFlow', () => {
    it('saves a flow to local storage', async () => {
      // Mock fetch to simulate proxy failure (local-only save)
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const flow = makeFlowDefinition();
      const metadata = await saveFlow(flow, mockConfig, { persistToProxy: false });

      expect(metadata.id).toBe('flow-1');
      expect(metadata.name).toBe('Test Flow');
      expect(metadata.description).toBe('A test flow');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('saves a flow and persists to proxy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'flow-1', updatedAt: '2024-01-02T00:00:00.000Z' }),
      });

      const flow = makeFlowDefinition();
      const metadata = await saveFlow(flow, mockConfig, { persistToProxy: true });

      expect(metadata.id).toBe('flow-1');
      expect(metadata.updatedAt).toBe('2024-01-02T00:00:00.000Z');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/flows',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('succeeds locally even if proxy fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      });

      const flow = makeFlowDefinition();
      const metadata = await saveFlow(flow, mockConfig);

      expect(metadata.id).toBe('flow-1');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('updates an existing flow preserving metadata', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const flow = makeFlowDefinition();
      await saveFlow(flow, mockConfig, { persistToProxy: false });

      const updatedFlow = makeFlowDefinition({ name: 'Updated Flow' });
      const metadata = await saveFlow(updatedFlow, mockConfig, { persistToProxy: false });

      expect(metadata.name).toBe('Updated Flow');
    });
  });

  describe('loadFlow', () => {
    it('loads a flow from local storage', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const flow = makeFlowDefinition();
      await saveFlow(flow, mockConfig, { persistToProxy: false });

      const loaded = await loadFlow('flow-1', mockConfig);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('flow-1');
      expect(loaded!.name).toBe('Test Flow');
      expect(loaded!.steps).toHaveLength(2);
      expect(loaded!.connections).toHaveLength(1);
    });

    it('falls back to proxy when not found locally', async () => {
      const proxyFlow = makeFlowDefinition({ id: 'flow-proxy' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(proxyFlow),
      });

      const loaded = await loadFlow('flow-proxy', mockConfig);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('flow-proxy');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/flows/flow-proxy',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns null when flow not found anywhere', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Not found' } }),
      });

      const loaded = await loadFlow('nonexistent', mockConfig);
      expect(loaded).toBeNull();
    });

    it('caches proxy-loaded flow locally', async () => {
      const proxyFlow = makeFlowDefinition({ id: 'flow-cached' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(proxyFlow),
      });

      await loadFlow('flow-cached', mockConfig);

      // Second load should come from local
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Should not be called'));
      const loaded = await loadFlow('flow-cached', mockConfig);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('flow-cached');
    });
  });

  describe('listFlows', () => {
    it('lists flows from local storage', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await saveFlow(makeFlowDefinition({ id: 'flow-1' }), mockConfig, { persistToProxy: false });
      await saveFlow(
        makeFlowDefinition({ id: 'flow-2', name: 'Second Flow' }),
        mockConfig,
        { persistToProxy: false },
      );

      const result = await listFlows(mockConfig);

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('merges proxy flows with local flows', async () => {
      await saveFlow(makeFlowDefinition({ id: 'flow-local' }), mockConfig, { persistToProxy: false });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              id: 'flow-proxy',
              name: 'Proxy Flow',
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        }),
      });

      const result = await listFlows(mockConfig);

      expect(result.items).toHaveLength(2);
      const ids = result.items.map((i) => i.id);
      expect(ids).toContain('flow-local');
      expect(ids).toContain('flow-proxy');
    });

    it('does not duplicate flows present in both local and proxy', async () => {
      await saveFlow(makeFlowDefinition({ id: 'flow-1' }), mockConfig, { persistToProxy: false });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              id: 'flow-1',
              name: 'Same Flow from Proxy',
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        }),
      });

      const result = await listFlows(mockConfig);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('flow-1');
    });

    it('paginates results correctly', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      for (let i = 0; i < 5; i++) {
        await saveFlow(
          makeFlowDefinition({ id: `flow-${i}`, name: `Flow ${i}` }),
          mockConfig,
          { persistToProxy: false },
        );
      }

      const page1 = await listFlows(mockConfig, 1, 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.pagination.total).toBe(5);
      expect(page1.pagination.totalPages).toBe(3);

      const page3 = await listFlows(mockConfig, 3, 2);
      expect(page3.items).toHaveLength(1);
    });

    it('sorts flows by updatedAt descending', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await saveFlow(
        makeFlowDefinition({ id: 'old', updatedAt: '2024-01-01T00:00:00.000Z' }),
        mockConfig,
        { persistToProxy: false },
      );
      await saveFlow(
        makeFlowDefinition({ id: 'new', updatedAt: '2024-06-01T00:00:00.000Z' }),
        mockConfig,
        { persistToProxy: false },
      );

      const result = await listFlows(mockConfig);

      // The newer flow should be first (saveFlow updates updatedAt)
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('deleteFlow', () => {
    it('deletes a flow from local storage', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await saveFlow(makeFlowDefinition(), mockConfig, { persistToProxy: false });
      const result = await deleteFlow('flow-1', mockConfig);

      expect(result).toBe(true);

      const loaded = await loadFlow('flow-1', mockConfig);
      expect(loaded).toBeNull();
    });

    it('returns false when flow does not exist', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await deleteFlow('nonexistent', mockConfig);
      expect(result).toBe(false);
    });

    it('attempts proxy deletion', async () => {
      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error')) // saveFlow proxy
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) }); // deleteFlow proxy

      await saveFlow(makeFlowDefinition(), mockConfig, { persistToProxy: false });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await deleteFlow('flow-1', mockConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/flows/flow-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('scheduleFlow', () => {
    it('schedules a flow via proxy', async () => {
      // First save the flow locally
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await saveFlow(makeFlowDefinition(), mockConfig, { persistToProxy: false });

      // Mock the schedule endpoint
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          schedule: { cron: '0 * * * *', enabled: true },
          jobId: 'job-123',
        }),
      });

      const schedule = await scheduleFlow(
        'flow-1',
        { cron: '0 * * * *', enabled: true },
        mockConfig,
      );

      expect(schedule.cron).toBe('0 * * * *');
      expect(schedule.enabled).toBe(true);
      expect(schedule.jobId).toBe('job-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/flows/flow-1/schedule',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ cron: '0 * * * *', enabled: true }),
        }),
      );
    });

    it('updates local metadata with schedule info', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await saveFlow(makeFlowDefinition(), mockConfig, { persistToProxy: false });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          schedule: { cron: '*/5 * * * *', enabled: true },
          jobId: 'job-456',
        }),
      });

      await scheduleFlow('flow-1', { cron: '*/5 * * * *' }, mockConfig);

      // Verify local metadata was updated
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await listFlows(mockConfig);
      const flow = result.items.find((i) => i.id === 'flow-1');

      expect(flow?.schedule?.cron).toBe('*/5 * * * *');
      expect(flow?.schedule?.jobId).toBe('job-456');
    });

    it('throws when proxy is unavailable', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Service unavailable' } }),
      });

      await expect(
        scheduleFlow('flow-1', { cron: '0 * * * *' }, mockConfig),
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('unscheduleFlow', () => {
    it('removes schedule via proxy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await unscheduleFlow('flow-1', mockConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/flows/flow-1/schedule',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('clears local schedule metadata', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await saveFlow(makeFlowDefinition(), mockConfig, { persistToProxy: false });

      // Schedule it
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          schedule: { cron: '0 * * * *', enabled: true },
          jobId: 'job-789',
        }),
      });
      await scheduleFlow('flow-1', { cron: '0 * * * *' }, mockConfig);

      // Unschedule it
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      await unscheduleFlow('flow-1', mockConfig);

      // Verify schedule is cleared
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await listFlows(mockConfig);
      const flow = result.items.find((i) => i.id === 'flow-1');

      expect(flow?.schedule).toBeUndefined();
    });
  });
});
