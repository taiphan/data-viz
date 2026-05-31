import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import extractsRouter, { extractStore } from './extracts.js';

// Mock scheduler service
vi.mock('../services/scheduler.js', () => ({
  schedulerService: {
    addJob: vi.fn().mockResolvedValue('mock-job-id'),
    removeJob: vi.fn().mockResolvedValue(true),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(true),
  },
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createApp() {
  const app = express();
  app.use(express.json());

  // Simulate requestId middleware
  app.use((req, _res, next) => {
    (req as express.Request & { requestId: string }).requestId = 'test-request-id';
    next();
  });

  app.use('/api/extracts', extractsRouter);
  return app;
}

const validExtractBody = {
  name: 'Daily Sales Report',
  connectionId: '550e8400-e29b-41d4-a716-446655440000',
  query: 'SELECT * FROM sales WHERE date = CURRENT_DATE',
  destination: 's3://reports/daily-sales.csv',
  description: 'Extracts daily sales data',
};

describe('Extracts Routes', () => {
  beforeEach(() => {
    extractStore.clear();
  });

  describe('POST /api/extracts', () => {
    it('should create an extract definition', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(validExtractBody.name);
      expect(res.body.connectionId).toBe(validExtractBody.connectionId);
      expect(res.body.query).toBe(validExtractBody.query);
      expect(res.body.destination).toBe(validExtractBody.destination);
      expect(res.body.status).toBe('idle');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
    });

    it('should return 400 for missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/extracts')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('should return 400 for invalid connectionId format', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/extracts')
        .send({ ...validExtractBody, connectionId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty name', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/extracts')
        .send({ ...validExtractBody, name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/extracts/:id/schedule', () => {
    it('should set a cron schedule on an extract', async () => {
      const app = createApp();

      // Create extract first
      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .put(`/api/extracts/${extractId}/schedule`)
        .send({ cron: '0 9 * * *', enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.schedule.cron).toBe('0 9 * * *');
      expect(res.body.schedule.enabled).toBe(true);
      expect(res.body).toHaveProperty('jobId');
    });

    it('should return 400 for invalid cron expression', async () => {
      const app = createApp();

      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .put(`/api/extracts/${extractId}/schedule`)
        .send({ cron: 'invalid-cron' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent extract', async () => {
      const app = createApp();
      const res = await request(app)
        .put('/api/extracts/550e8400-e29b-41d4-a716-446655440000/schedule')
        .send({ cron: '0 9 * * *' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid extract ID format', async () => {
      const app = createApp();
      const res = await request(app)
        .put('/api/extracts/not-a-uuid/schedule')
        .send({ cron: '0 9 * * *' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should disable schedule when enabled is false', async () => {
      const app = createApp();

      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .put(`/api/extracts/${extractId}/schedule`)
        .send({ cron: '0 9 * * *', enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.schedule.enabled).toBe(false);
    });
  });

  describe('POST /api/extracts/:id/test', () => {
    it('should queue an immediate extract run', async () => {
      const app = createApp();

      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .post(`/api/extracts/${extractId}/test`);

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('runId');
      expect(res.body).toHaveProperty('jobId');
      expect(res.body.status).toBe('running');
      expect(res.body).toHaveProperty('startedAt');
    });

    it('should return 404 for non-existent extract', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/extracts/550e8400-e29b-41d4-a716-446655440000/test');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/extracts/:id/status', () => {
    it('should return extract status and history', async () => {
      const app = createApp();

      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .get(`/api/extracts/${extractId}/status`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(extractId);
      expect(res.body.status).toBe('idle');
      expect(res.body.history).toEqual([]);
      expect(res.body.lastRunAt).toBeNull();
      expect(res.body.nextRunAt).toBeNull();
    });

    it('should return 404 for non-existent extract', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/extracts/550e8400-e29b-41d4-a716-446655440000/status');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/extracts', () => {
    it('should return empty list when no extracts exist', async () => {
      const app = createApp();
      const res = await request(app).get('/api/extracts');

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should return paginated list of extracts', async () => {
      const app = createApp();

      // Create multiple extracts
      await request(app).post('/api/extracts').send(validExtractBody);
      await request(app).post('/api/extracts').send({
        ...validExtractBody,
        name: 'Weekly Report',
      });

      const res = await request(app).get('/api/extracts?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should respect pagination limits', async () => {
      const app = createApp();

      // Create 3 extracts
      await request(app).post('/api/extracts').send(validExtractBody);
      await request(app).post('/api/extracts').send({
        ...validExtractBody,
        name: 'Report 2',
      });
      await request(app).post('/api/extracts').send({
        ...validExtractBody,
        name: 'Report 3',
      });

      const res = await request(app).get('/api/extracts?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('should return 400 for invalid pagination params', async () => {
      const app = createApp();
      const res = await request(app).get('/api/extracts?page=0');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/extracts/:id', () => {
    it('should delete an extract and cancel scheduled jobs', async () => {
      const app = createApp();

      const createRes = await request(app)
        .post('/api/extracts')
        .send(validExtractBody);

      const extractId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/extracts/${extractId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(extractId);

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/extracts/${extractId}/status`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent extract', async () => {
      const app = createApp();
      const res = await request(app)
        .delete('/api/extracts/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid extract ID format', async () => {
      const app = createApp();
      const res = await request(app)
        .delete('/api/extracts/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
