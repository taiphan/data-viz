import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('scheduler');

// --- Job Type Definitions ---

export type JobType = 'extract-refresh' | 'scheduled-query' | 'webhook-trigger';

export interface ExtractRefreshPayload {
  type: 'extract-refresh';
  extractId: string;
  connectionId: string;
  query: string;
  destination: string;
}

export interface ScheduledQueryPayload {
  type: 'scheduled-query';
  queryId: string;
  connectionId: string;
  query: string;
  schedule: string; // cron expression
}

export interface WebhookTriggerPayload {
  type: 'webhook-trigger';
  webhookId: string;
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}

export type SchedulerJobPayload =
  | ExtractRefreshPayload
  | ScheduledQueryPayload
  | WebhookTriggerPayload;

export interface AddJobOptions {
  delay?: number;
  repeat?: { pattern: string }; // cron pattern
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  priority?: number;
  jobId?: string;
}

// --- Redis Connection ---

function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  const parsed = new URL(url);

  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    maxRetriesPerRequest: null,
  };
}

// --- Scheduler Service ---

const QUEUE_NAME = 'data-viz-scheduler';

export class SchedulerService {
  private queue: Queue<SchedulerJobPayload>;
  private worker: Worker<SchedulerJobPayload> | null = null;
  private queueEvents: QueueEvents | null = null;
  private connection: ConnectionOptions;
  private shutdownInProgress = false;

  constructor(connection?: ConnectionOptions) {
    this.connection = connection ?? getRedisConnection();

    this.queue = new Queue<SchedulerJobPayload>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    logger.info('Scheduler queue initialized');
  }

  /**
   * Starts the worker that processes jobs from the queue.
   * Accepts a processor function to handle job execution.
   */
  startWorker(
    processor: (job: Job<SchedulerJobPayload>) => Promise<void>,
  ): void {
    if (this.worker) {
      logger.warn('Worker already running');
      return;
    }

    this.worker = new Worker<SchedulerJobPayload>(
      QUEUE_NAME,
      processor,
      { connection: this.connection, concurrency: 5 },
    );

    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id, type: job.data.type }, 'Job completed');
    });

    this.worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, type: job?.data.type, error: err.message },
        'Job failed',
      );
    });

    this.worker.on('error', (err) => {
      logger.error({ error: err.message }, 'Worker error');
    });

    this.queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: this.connection,
    });

    logger.info('Scheduler worker started');
  }

  /**
   * Adds a job to the queue.
   */
  async addJob(
    payload: SchedulerJobPayload,
    options?: AddJobOptions,
  ): Promise<string> {
    if (this.shutdownInProgress) {
      throw new Error('Scheduler is shutting down');
    }

    const jobName = payload.type;
    const jobOptions: Record<string, unknown> = {};

    if (options?.delay) {
      jobOptions.delay = options.delay;
    }
    if (options?.repeat) {
      jobOptions.repeat = options.repeat;
    }
    if (options?.attempts) {
      jobOptions.attempts = options.attempts;
    }
    if (options?.backoff) {
      jobOptions.backoff = options.backoff;
    }
    if (options?.priority) {
      jobOptions.priority = options.priority;
    }
    if (options?.jobId) {
      jobOptions.jobId = options.jobId;
    }

    const job = await this.queue.add(jobName, payload, jobOptions);

    logger.info({ jobId: job.id, type: payload.type }, 'Job added');
    return job.id!;
  }

  /**
   * Pauses the queue — no new jobs will be processed until resumed.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resumes a paused queue.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * Removes a specific job by its ID.
   */
  async removeJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      logger.warn({ jobId }, 'Job not found for removal');
      return false;
    }

    await job.remove();
    logger.info({ jobId }, 'Job removed');
    return true;
  }

  /**
   * Retries a failed job by its ID.
   */
  async retryJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      logger.warn({ jobId }, 'Job not found for retry');
      return false;
    }

    const state = await job.getState();
    if (state !== 'failed') {
      logger.warn({ jobId, state }, 'Job is not in failed state, cannot retry');
      return false;
    }

    await job.retry();
    logger.info({ jobId }, 'Job retried');
    return true;
  }

  /**
   * Gets the current state of a job.
   */
  async getJobState(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }
    return job.getState();
  }

  /**
   * Gets a job by its ID.
   */
  async getJob(jobId: string): Promise<Job<SchedulerJobPayload> | undefined> {
    return this.queue.getJob(jobId);
  }

  /**
   * Removes all repeatable jobs matching a given pattern.
   */
  async removeRepeatableByKey(key: string): Promise<boolean> {
    return this.queue.removeRepeatableByKey(key);
  }

  /**
   * Lists all repeatable jobs.
   */
  async getRepeatableJobs() {
    return this.queue.getRepeatableJobs();
  }

  /**
   * Returns queue health metrics.
   */
  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Gracefully shuts down the scheduler, closing worker and queue.
   */
  async shutdown(): Promise<void> {
    this.shutdownInProgress = true;
    logger.info('Shutting down scheduler');

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
    }

    await this.queue.close();
    this.shutdownInProgress = false;

    logger.info('Scheduler shutdown complete');
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();

