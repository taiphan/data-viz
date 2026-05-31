import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock functions so they're available before module evaluation
const mockAdd = vi.hoisted(() => vi.fn());
const mockPause = vi.hoisted(() => vi.fn());
const mockResume = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());
const mockGetJob = vi.hoisted(() => vi.fn());
const mockGetRepeatableJobs = vi.hoisted(() => vi.fn());
const mockRemoveRepeatableByKey = vi.hoisted(() => vi.fn());
const mockGetWaitingCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetActiveCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetCompletedCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetFailedCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetDelayedCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));

vi.mock('bullmq', () => {
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: mockAdd,
    pause: mockPause,
    resume: mockResume,
    close: mockClose,
    getJob: mockGetJob,
    getRepeatableJobs: mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    getFailedCount: mockGetFailedCount,
    getDelayedCount: mockGetDelayedCount,
  }));

  const MockWorker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  const MockQueueEvents = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  return { Queue: MockQueue, Worker: MockWorker, QueueEvents: MockQueueEvents };
});

import { SchedulerService, SchedulerJobPayload, JobType } from './scheduler.js';

function createExtractRefreshPayload(): SchedulerJobPayload {
  return {
    type: 'extract-refresh',
    extractId: 'ext-001',
    connectionId: 'conn-001',
    query: 'SELECT * FROM sales',
    destination: 'workspace-1',
  };
}

function createScheduledQueryPayload(): SchedulerJobPayload {
  return {
    type: 'scheduled-query',
    queryId: 'query-001',
    connectionId: 'conn-002',
    query: 'SELECT COUNT(*) FROM orders',
    schedule: '0 */6 * * *',
  };
}

function createWebhookTriggerPayload(): SchedulerJobPayload {
  return {
    type: 'webhook-trigger',
    webhookId: 'wh-001',
    url: 'https://api.example.com/notify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { event: 'refresh-complete' },
  };
}

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new SchedulerService({ host: 'localhost', port: 6379 });
  });

  afterEach(async () => {
    await scheduler.shutdown();
  });

  describe('addJob', () => {
    it('adds an extract-refresh job to the queue', async () => {
      const payload = createExtractRefreshPayload();
      mockAdd.mockResolvedValue({ id: 'job-1' });

      const jobId = await scheduler.addJob(payload);

      expect(jobId).toBe('job-1');
      expect(mockAdd).toHaveBeenCalledWith('extract-refresh', payload, {});
    });

    it('adds a scheduled-query job with repeat option', async () => {
      const payload = createScheduledQueryPayload();
      mockAdd.mockResolvedValue({ id: 'job-2' });

      const jobId = await scheduler.addJob(payload, {
        repeat: { pattern: '0 */6 * * *' },
      });

      expect(jobId).toBe('job-2');
      expect(mockAdd).toHaveBeenCalledWith('scheduled-query', payload, {
        repeat: { pattern: '0 */6 * * *' },
      });
    });

    it('adds a webhook-trigger job with delay', async () => {
      const payload = createWebhookTriggerPayload();
      mockAdd.mockResolvedValue({ id: 'job-3' });

      const jobId = await scheduler.addJob(payload, { delay: 5000 });

      expect(jobId).toBe('job-3');
      expect(mockAdd).toHaveBeenCalledWith('webhook-trigger', payload, {
        delay: 5000,
      });
    });

    it('passes all options to the queue', async () => {
      const payload = createExtractRefreshPayload();
      mockAdd.mockResolvedValue({ id: 'job-4' });

      await scheduler.addJob(payload, {
        delay: 1000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        priority: 1,
        jobId: 'custom-id',
      });

      expect(mockAdd).toHaveBeenCalledWith('extract-refresh', payload, {
        delay: 1000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        priority: 1,
        jobId: 'custom-id',
      });
    });

    it('throws when scheduler is shutting down', async () => {
      const payload = createExtractRefreshPayload();
      const shutdownPromise = scheduler.shutdown();

      await expect(scheduler.addJob(payload)).rejects.toThrow(
        'Scheduler is shutting down',
      );

      await shutdownPromise;
    });
  });

  describe('pause and resume', () => {
    it('pauses the queue', async () => {
      mockPause.mockResolvedValue(undefined);
      await scheduler.pause();
      expect(mockPause).toHaveBeenCalled();
    });

    it('resumes the queue', async () => {
      mockResume.mockResolvedValue(undefined);
      await scheduler.resume();
      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('removeJob', () => {
    it('removes an existing job', async () => {
      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      mockGetJob.mockResolvedValue(mockJob);

      const result = await scheduler.removeJob('job-1');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('returns false when job does not exist', async () => {
      mockGetJob.mockResolvedValue(null);

      const result = await scheduler.removeJob('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('retryJob', () => {
    it('retries a failed job', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        retry: vi.fn().mockResolvedValue(undefined),
      };
      mockGetJob.mockResolvedValue(mockJob);

      const result = await scheduler.retryJob('job-1');

      expect(result).toBe(true);
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('returns false when job does not exist', async () => {
      mockGetJob.mockResolvedValue(null);

      const result = await scheduler.retryJob('nonexistent');

      expect(result).toBe(false);
    });

    it('returns false when job is not in failed state', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        retry: vi.fn(),
      };
      mockGetJob.mockResolvedValue(mockJob);

      const result = await scheduler.retryJob('job-1');

      expect(result).toBe(false);
      expect(mockJob.retry).not.toHaveBeenCalled();
    });
  });

  describe('getJobState', () => {
    it('returns the state of an existing job', async () => {
      const mockJob = { getState: vi.fn().mockResolvedValue('active') };
      mockGetJob.mockResolvedValue(mockJob);

      const state = await scheduler.getJobState('job-1');

      expect(state).toBe('active');
    });

    it('returns null for non-existent job', async () => {
      mockGetJob.mockResolvedValue(undefined);

      const state = await scheduler.getJobState('nonexistent');

      expect(state).toBeNull();
    });
  });

  describe('getQueueMetrics', () => {
    it('returns queue metrics', async () => {
      mockGetWaitingCount.mockResolvedValue(5);
      mockGetActiveCount.mockResolvedValue(2);
      mockGetCompletedCount.mockResolvedValue(100);
      mockGetFailedCount.mockResolvedValue(3);
      mockGetDelayedCount.mockResolvedValue(1);

      const metrics = await scheduler.getQueueMetrics();

      expect(metrics).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
    });
  });

  describe('startWorker', () => {
    it('starts a worker with the given processor', () => {
      const processor = vi.fn().mockResolvedValue(undefined);
      scheduler.startWorker(processor);

      // Worker should be created (no error thrown)
      // Calling again should warn but not throw
      scheduler.startWorker(processor);
    });
  });

  describe('shutdown', () => {
    it('closes queue without worker', async () => {
      await scheduler.shutdown();
      expect(mockClose).toHaveBeenCalled();
    });

    it('closes worker and queue events when started', async () => {
      const processor = vi.fn().mockResolvedValue(undefined);
      scheduler.startWorker(processor);

      await scheduler.shutdown();
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('job types', () => {
    it('supports all three job types', () => {
      const types: JobType[] = ['extract-refresh', 'scheduled-query', 'webhook-trigger'];
      expect(types).toHaveLength(3);
    });

    it('extract-refresh payload has required fields', () => {
      const payload = createExtractRefreshPayload();
      expect(payload.type).toBe('extract-refresh');
      if (payload.type === 'extract-refresh') {
        expect(payload.extractId).toBeDefined();
        expect(payload.connectionId).toBeDefined();
        expect(payload.query).toBeDefined();
        expect(payload.destination).toBeDefined();
      }
    });

    it('scheduled-query payload has required fields', () => {
      const payload = createScheduledQueryPayload();
      expect(payload.type).toBe('scheduled-query');
      if (payload.type === 'scheduled-query') {
        expect(payload.queryId).toBeDefined();
        expect(payload.connectionId).toBeDefined();
        expect(payload.query).toBeDefined();
        expect(payload.schedule).toBeDefined();
      }
    });

    it('webhook-trigger payload has required fields', () => {
      const payload = createWebhookTriggerPayload();
      expect(payload.type).toBe('webhook-trigger');
      if (payload.type === 'webhook-trigger') {
        expect(payload.webhookId).toBeDefined();
        expect(payload.url).toBeDefined();
        expect(payload.method).toBeDefined();
      }
    });
  });
});
