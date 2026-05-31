import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import deploymentsRouter, {
  deploymentHistory,
  BUNDLE_VERSION,
} from './deployments.js';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { vi } from 'vitest';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Simulate requestId middleware
  app.use((req, _res, next) => {
    (req as express.Request & { requestId: string }).requestId = 'test-request-id';
    next();
  });

  app.use('/api/deployments', deploymentsRouter);
  return app;
}

function createValidWorkbook() {
  return {
    id: 'wb-001',
    name: 'Test Workbook',
    dataSources: [
      {
        id: 'ds-001',
        name: 'Sales Data',
        fields: [
          { name: 'region', type: 'string', role: 'dimension' },
          { name: 'revenue', type: 'number', role: 'measure' },
        ],
        rows: [
          { region: 'North', revenue: 1000 },
          { region: 'South', revenue: 2000 },
        ],
        rowCount: 2,
        importedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
    charts: [
      {
        id: 'chart-001',
        title: 'Revenue by Region',
        chartType: 'bar',
        dataSourceId: 'ds-001',
        encodings: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        },
      },
    ],
    flows: [
      {
        id: 'flow-001',
        name: 'ETL Pipeline',
        steps: [{ type: 'filter', config: { field: 'region', value: 'North' } }],
      },
    ],
  };
}

function createValidMetadata() {
  return {
    author: 'test-user@example.com',
    description: 'Test export for deployment',
  };
}

describe('Deployments Routes', () => {
  beforeEach(() => {
    // Clear deployment history between tests
    deploymentHistory.length = 0;
  });

  describe('POST /api/deployments/export', () => {
    it('should export a workbook as a versioned JSON bundle', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: createValidWorkbook(),
          metadata: createValidMetadata(),
        });

      expect(res.status).toBe(200);
      expect(res.body.bundle).toBeDefined();
      expect(res.body.bundle.version).toBe(BUNDLE_VERSION);
      expect(res.body.bundle.exportedAt).toBeDefined();
      expect(res.body.bundle.metadata.author).toBe('test-user@example.com');
      expect(res.body.bundle.metadata.description).toBe('Test export for deployment');
      expect(res.body.bundle.metadata.exportId).toBeDefined();
      expect(res.body.bundle.metadata.timestamp).toBeDefined();
      expect(res.body.bundle.workbook.id).toBe('wb-001');
      expect(res.body.bundle.workbook.name).toBe('Test Workbook');
      expect(res.body.bundle.workbook.dataSources).toHaveLength(1);
      expect(res.body.bundle.workbook.charts).toHaveLength(1);
      expect(res.body.bundle.workbook.flows).toHaveLength(1);
    });

    it('should record the export in deployment history', async () => {
      const app = createApp();
      await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: createValidWorkbook(),
          metadata: createValidMetadata(),
        });

      expect(deploymentHistory).toHaveLength(1);
      expect(deploymentHistory[0].action).toBe('export');
      expect(deploymentHistory[0].workbookId).toBe('wb-001');
      expect(deploymentHistory[0].workbookName).toBe('Test Workbook');
    });

    it('should return 400 when workbook is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          metadata: createValidMetadata(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when metadata author is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: createValidWorkbook(),
          metadata: { description: 'No author' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when workbook id is empty', async () => {
      const app = createApp();
      const workbook = createValidWorkbook();
      workbook.id = '';

      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook,
          metadata: createValidMetadata(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle workbook with empty arrays', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: {
            id: 'wb-empty',
            name: 'Empty Workbook',
            dataSources: [],
            charts: [],
            flows: [],
          },
          metadata: createValidMetadata(),
        });

      expect(res.status).toBe(200);
      expect(res.body.bundle.workbook.dataSources).toHaveLength(0);
      expect(res.body.bundle.workbook.charts).toHaveLength(0);
      expect(res.body.bundle.workbook.flows).toHaveLength(0);
    });

    it('should use provided timestamp in metadata when given', async () => {
      const app = createApp();
      const customTimestamp = '2024-06-01T12:00:00.000Z';
      const res = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: createValidWorkbook(),
          metadata: {
            ...createValidMetadata(),
            timestamp: customTimestamp,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.bundle.metadata.timestamp).toBe(customTimestamp);
    });
  });

  describe('POST /api/deployments/import', () => {
    it('should import a valid workbook bundle', async () => {
      const app = createApp();
      const bundle = {
        version: '1.0.0',
        exportedAt: '2024-01-15T10:00:00.000Z',
        metadata: {
          author: 'test-user@example.com',
          description: 'Test import',
          timestamp: '2024-01-15T10:00:00.000Z',
          exportId: 'export-123',
        },
        workbook: createValidWorkbook(),
      };

      const res = await request(app)
        .post('/api/deployments/import')
        .send(bundle);

      expect(res.status).toBe(200);
      expect(res.body.workbook).toBeDefined();
      expect(res.body.workbook.id).toBe('wb-001');
      expect(res.body.workbook.name).toBe('Test Workbook');
      expect(res.body.deployment).toBeDefined();
      expect(res.body.deployment.action).toBe('import');
      expect(res.body.importedAt).toBeDefined();
    });

    it('should record the import in deployment history', async () => {
      const app = createApp();
      const bundle = {
        version: '1.0.0',
        exportedAt: '2024-01-15T10:00:00.000Z',
        metadata: {
          author: 'test-user@example.com',
          description: 'Test import',
          timestamp: '2024-01-15T10:00:00.000Z',
          exportId: 'export-456',
        },
        workbook: createValidWorkbook(),
      };

      await request(app)
        .post('/api/deployments/import')
        .send(bundle);

      expect(deploymentHistory).toHaveLength(1);
      expect(deploymentHistory[0].action).toBe('import');
      expect(deploymentHistory[0].workbookId).toBe('wb-001');
      expect(deploymentHistory[0].metadata.exportId).toBe('export-456');
    });

    it('should return 400 when version is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/import')
        .send({
          exportedAt: '2024-01-15T10:00:00.000Z',
          metadata: {
            author: 'test-user@example.com',
            timestamp: '2024-01-15T10:00:00.000Z',
            exportId: 'export-789',
          },
          workbook: createValidWorkbook(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when metadata is invalid', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/import')
        .send({
          version: '1.0.0',
          exportedAt: '2024-01-15T10:00:00.000Z',
          metadata: {
            description: 'Missing author and exportId',
          },
          workbook: createValidWorkbook(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when workbook has invalid data source fields', async () => {
      const app = createApp();
      const workbook = createValidWorkbook();
      workbook.dataSources[0].fields = [
        { name: '', type: 'string', role: 'dimension' } as any,
      ];

      const res = await request(app)
        .post('/api/deployments/import')
        .send({
          version: '1.0.0',
          exportedAt: '2024-01-15T10:00:00.000Z',
          metadata: {
            author: 'test-user@example.com',
            timestamp: '2024-01-15T10:00:00.000Z',
            exportId: 'export-bad',
          },
          workbook,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when body is empty', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/deployments/import')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Export/Import round-trip', () => {
    it('should produce an importable bundle from export', async () => {
      const app = createApp();

      // Export
      const exportRes = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: createValidWorkbook(),
          metadata: createValidMetadata(),
        });

      expect(exportRes.status).toBe(200);
      const bundle = exportRes.body.bundle;

      // Import the exported bundle
      const importRes = await request(app)
        .post('/api/deployments/import')
        .send(bundle);

      expect(importRes.status).toBe(200);
      expect(importRes.body.workbook.id).toBe('wb-001');
      expect(importRes.body.workbook.name).toBe('Test Workbook');
      expect(importRes.body.workbook.dataSources).toHaveLength(1);
      expect(importRes.body.workbook.charts).toHaveLength(1);
      expect(importRes.body.workbook.flows).toHaveLength(1);
    });

    it('should preserve data integrity through round-trip', async () => {
      const app = createApp();
      const originalWorkbook = createValidWorkbook();

      // Export
      const exportRes = await request(app)
        .post('/api/deployments/export')
        .send({
          workbook: originalWorkbook,
          metadata: createValidMetadata(),
        });

      const bundle = exportRes.body.bundle;

      // Import
      const importRes = await request(app)
        .post('/api/deployments/import')
        .send(bundle);

      const importedWorkbook = importRes.body.workbook;

      // Verify data integrity
      expect(importedWorkbook.dataSources[0].rows).toEqual(
        originalWorkbook.dataSources[0].rows
      );
      expect(importedWorkbook.dataSources[0].fields).toEqual(
        originalWorkbook.dataSources[0].fields
      );
      expect(importedWorkbook.charts[0].encodings).toEqual(
        originalWorkbook.charts[0].encodings
      );
    });
  });
});
