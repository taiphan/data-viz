import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes:deployments');
const router = Router();

// ============================================================
// ZOD SCHEMAS
// ============================================================

const dataFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'date', 'boolean']),
  role: z.enum(['dimension', 'measure']),
});

const dataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fields: z.array(dataFieldSchema),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().min(0),
  importedAt: z.string(),
  sourceInfo: z.record(z.unknown()).optional(),
});

const chartEncodingSchema = z.object({
  field: z.string().optional(),
  type: z.enum(['quantitative', 'nominal', 'ordinal', 'temporal']).optional(),
  aggregate: z.string().optional(),
}).passthrough();

const chartConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  chartType: z.string().min(1),
  dataSourceId: z.string().min(1),
  encodings: z.record(chartEncodingSchema).optional(),
}).passthrough();

const flowSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  steps: z.array(z.record(z.unknown())).optional(),
}).passthrough();

const deploymentMetadataSchema = z.object({
  author: z.string().min(1),
  description: z.string().optional().default(''),
  timestamp: z.string().optional(),
});

const exportRequestSchema = z.object({
  workbook: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    dataSources: z.array(dataSourceSchema).default([]),
    charts: z.array(chartConfigSchema).default([]),
    flows: z.array(flowSchema).default([]),
  }).passthrough(),
  metadata: deploymentMetadataSchema,
});

const importBundleSchema = z.object({
  version: z.string().min(1),
  exportedAt: z.string(),
  metadata: z.object({
    author: z.string().min(1),
    description: z.string().optional().default(''),
    timestamp: z.string(),
    exportId: z.string(),
  }),
  workbook: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    dataSources: z.array(dataSourceSchema).default([]),
    charts: z.array(chartConfigSchema).default([]),
    flows: z.array(flowSchema).default([]),
  }).passthrough(),
});

// ============================================================
// TYPES
// ============================================================

export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ImportBundle = z.infer<typeof importBundleSchema>;

export interface DeploymentRecord {
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

// In-memory deployment history (production would use a database)
const deploymentHistory: DeploymentRecord[] = [];

// Current bundle version
const BUNDLE_VERSION = '1.0.0';

// ============================================================
// POST /api/deployments/export
// ============================================================

router.post('/export', (req: Request, res: Response) => {
  const parseResult = exportRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    logger.warn(
      { requestId: req.requestId, errors: parseResult.error.flatten() },
      'Invalid export request'
    );
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid export request body.',
        details: parseResult.error.flatten().fieldErrors,
      },
      requestId: req.requestId,
    });
    return;
  }

  const { workbook, metadata } = parseResult.data;
  const exportId = uuidv4();
  const exportedAt = new Date().toISOString();

  const bundle: ImportBundle = {
    version: BUNDLE_VERSION,
    exportedAt,
    metadata: {
      author: metadata.author,
      description: metadata.description ?? '',
      timestamp: metadata.timestamp || exportedAt,
      exportId,
    },
    workbook,
  };

  const record: DeploymentRecord = {
    id: uuidv4(),
    action: 'export',
    workbookId: workbook.id,
    workbookName: workbook.name,
    metadata: {
      author: bundle.metadata.author,
      description: bundle.metadata.description ?? '',
      timestamp: bundle.metadata.timestamp,
      exportId: bundle.metadata.exportId,
    },
    version: BUNDLE_VERSION,
    createdAt: exportedAt,
  };

  deploymentHistory.push(record);

  logger.info(
    { requestId: req.requestId, exportId, workbookId: workbook.id },
    'Workbook exported successfully'
  );

  res.status(200).json({
    bundle,
    deployment: record,
    requestId: req.requestId,
  });
});

// ============================================================
// POST /api/deployments/import
// ============================================================

router.post('/import', (req: Request, res: Response) => {
  const parseResult = importBundleSchema.safeParse(req.body);

  if (!parseResult.success) {
    logger.warn(
      { requestId: req.requestId, errors: parseResult.error.flatten() },
      'Invalid import bundle'
    );
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid import bundle schema.',
        details: parseResult.error.flatten().fieldErrors,
      },
      requestId: req.requestId,
    });
    return;
  }

  const bundle = parseResult.data;
  const importedAt = new Date().toISOString();

  const record: DeploymentRecord = {
    id: uuidv4(),
    action: 'import',
    workbookId: bundle.workbook.id,
    workbookName: bundle.workbook.name,
    metadata: bundle.metadata,
    version: bundle.version,
    createdAt: importedAt,
  };

  deploymentHistory.push(record);

  logger.info(
    {
      requestId: req.requestId,
      workbookId: bundle.workbook.id,
      exportId: bundle.metadata.exportId,
    },
    'Workbook imported successfully'
  );

  res.status(200).json({
    workbook: bundle.workbook,
    deployment: record,
    importedAt,
    requestId: req.requestId,
  });
});

// ============================================================
// EXPORTS (for testing)
// ============================================================

export {
  exportRequestSchema,
  importBundleSchema,
  deploymentHistory,
  BUNDLE_VERSION,
};

export default router;
