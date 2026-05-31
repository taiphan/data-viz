import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import flowsRouter, { flowStore } from './flows.js';

// Mock the scheduler service
vi.mock('../services/scheduler.js', () => ({
  schedulerService: {
    addJob: vi.fn().mockResolvedValue('mock-job-id'),
    removeJob: vi.fn().mockResolvedValue(true),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(true),
  },
}));

// ============================================================
// TEST APP SETUP
// ============================================================

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.use('/api/flows', flowsRouter);
  return app;
}

// ============================================================
// HELPERS
// ============================================================

function makeFlowBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flow-test-1',
    name: 'Test Flow',
    description: 'A test flow definition',
    steps: [
      {
        id: 'step-1',
        name: 'Input Step',
        type: 'input',
        config: { sourceType: 'datasource', dataSourceId: 'ds-1' },
        enabled: true,
      },
      {
        id: 'step-2',
        name: 'Output Step',
        type: 'output',
        config: { outputName: 'result', outputType: 'datasource', overwriteExisting: false },
        enabled: true,
      },
    ],
    connections: [
      { id: 'conn-1', sourceStepId: 'step-1', targetStepId: 'step-2' },
    ],
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('flows routes', () => {
  let app: express.Express;

  beforeEach(() => {
    flowStore.clear();
    app = createTestApp();
  });

  describe('POST /api/flows', () => {
    it('creates a new flow and returns 201', async () => {
      const body = makeFlowBody();

      const res = await request(app)
        .post('/api/flows')
        .send(body)
        .expect(201);

      expect(res.body.id).toBe('flow-test-1');
      expect(res.body.name).toBe('Test Flow');
      expect(res.body.description).toBe('A test flow definition');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(flowStore.has('flow-test-1')).toBe(true);
    });

    it('generates an ID if not provided', async () => {
      const body = makeFlowBody();
      delete (body as Record<string, unknown>).id;

      const res = await request(app)
        .post('/api/flows')
        .send(body)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.id.length).toBeGreaterThan(0);
    });

    it('updates an existing flow and returns 200', async () => {
      const body = makeFlowBody();
      await request(app).post('/api/flows').send(body);

      const updatedBody = makeFlowBody({ name: 'Updated Flow' });
      const res = await request(app)
        .post('/api/flows')
        .send(updatedBody)
        .expect(200);

      expect(res.body.name).toBe('Updated Flow');
      expect(flowStore.get('flow-test-1')?.name).toBe('Updated Flow');
    });

    it('rejects invalid flow body with 400', async () => {
      const res = await request(app)
        .post('/api/flows')
        .send({ name: '' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects flow with no steps', async () => {
      const body = makeFlowBody({ steps: [] });

      const res = await request(app)
        .post('/api/flows')
        .send(body)
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/flows/:id', () => {
    it('returns a stored flow', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .get('/api/flows/flow-test-1')
        .expect(200);

      expect(res.body.id).toBe('flow-test-1');
      expect(res.body.name).toBe('Test Flow');
      expect(res.body.steps).toHaveLength(2);
      expect(res.body.connections).toHaveLength(1);
    });

    it('returns 404 for nonexistent flow', async () => {
      const res = await request(app)
        .get('/api/flows/nonexistent')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/flows', () => {
    it('lists all flows with pagination', async () => {
      await request(app).post('/api/flows').send(makeFlowBody({ id: 'flow-1', name: 'Flow 1' }));
      await request(app).post('/api/flows').send(makeFlowBody({ id: 'flow-2', name: 'Flow 2' }));
      await request(app).post('/api/flows').send(makeFlowBody({ id: 'flow-3', name: 'Flow 3' }));

      const res = await request(app)
        .get('/api/flows?page=1&limit=2')
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
    });

    it('returns empty list when no flows exist', async () => {
      const res = await request(app)
        .get('/api/flows')
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it('returns flows sorted by updatedAt descending', async () => {
      await request(app).post('/api/flows').send(makeFlowBody({ id: 'flow-old', name: 'Old' }));

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));

      await request(app).post('/api/flows').send(makeFlowBody({ id: 'flow-new', name: 'New' }));

      const res = await request(app)
        .get('/api/flows')
        .expect(200);

      expect(res.body.items[0].id).toBe('flow-new');
      expect(res.body.items[1].id).toBe('flow-old');
    });
  });

  describe('DELETE /api/flows/:id', () => {
    it('deletes an existing flow', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .delete('/api/flows/flow-test-1')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(flowStore.has('flow-test-1')).toBe(false);
    });

    it('returns 404 for nonexistent flow', async () => {
      const res = await request(app)
        .delete('/api/flows/nonexistent')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/flows/:id/schedule', () => {
    it('schedules a flow with a cron expression', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .put('/api/flows/flow-test-1/schedule')
        .send({ cron: '0 * * * *', enabled: true })
        .expect(200);

      expect(res.body.id).toBe('flow-test-1');
      expect(res.body.schedule.cron).toBe('0 * * * *');
      expect(res.body.schedule.enabled).toBe(true);
      expect(res.body.jobId).toBe('mock-job-id');
    });

    it('returns 404 for nonexistent flow', async () => {
      const res = await request(app)
        .put('/api/flows/nonexistent/schedule')
        .send({ cron: '0 * * * *', enabled: true })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects invalid cron expression', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .put('/api/flows/flow-test-1/schedule')
        .send({ cron: 'invalid-cron', enabled: true })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('disables schedule when enabled is false', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .put('/api/flows/flow-test-1/schedule')
        .send({ cron: '0 * * * *', enabled: false })
        .expect(200);

      expect(res.body.schedule.enabled).toBe(false);
      // jobId should be undefined when disabled
      expect(res.body.jobId).toBeUndefined();
    });

    it('supports timezone in schedule', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());

      const res = await request(app)
        .put('/api/flows/flow-test-1/schedule')
        .send({ cron: '0 9 * * *', enabled: true, timezone: 'America/New_York' })
        .expect(200);

      expect(res.body.schedule.timezone).toBe('America/New_York');
    });
  });

  describe('DELETE /api/flows/:id/schedule', () => {
    it('removes schedule from a flow', async () => {
      await request(app).post('/api/flows').send(makeFlowBody());
      await request(app)
        .put('/api/flows/flow-test-1/schedule')
        .send({ cron: '0 * * * *', enabled: true });

      const res = await request(app)
        .delete('/api/flows/flow-test-1/schedule')
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify schedule is removed
      const flow = flowStore.get('flow-test-1');
      expect(flow?.schedule).toBeUndefined();
    });

    it('returns 404 for nonexistent flow', async () => {
      const res = await request(app)
        .delete('/api/flows/nonexistent/schedule')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
