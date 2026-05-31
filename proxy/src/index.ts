import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './lib/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { healthMonitor } from './services/health-monitor.js';
import authRouter from './routes/auth.js';
import connectionsRouter from './routes/connections.js';
import queryRouter from './routes/query.js';
import profilesRouter from './routes/profiles.js';
import adminRouter from './routes/admin.js';
import deploymentsRouter from './routes/deployments.js';
import webhooksRouter from './routes/webhooks.js';
import extractsRouter from './routes/extracts.js';
import flowsRouter from './routes/flows.js';

const logger = createLogger('server');

const app = express();

// --- Security middleware ---
app.use(helmet());

// --- CORS ---
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3013';
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Token'],
}));

// --- Body parsing ---
app.use(express.json({ limit: '10mb' }));

// --- Request ID middleware ---
app.use((req, _res, next) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.requestId = requestId;
  next();
});

// --- Request logging ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs: duration,
      requestId: req.requestId,
    }, `${req.method} ${req.url} ${res.statusCode}`);
  });
  next();
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Prometheus metrics endpoint ---
app.get('/metrics', async (_req, res) => {
  try {
    const metricsOutput = await healthMonitor.getPrometheusMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metricsOutput);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Failed to generate metrics');
    res.status(500).send('# Error generating metrics\n');
  }
});

// --- Auth routes (no authentication required) ---
app.use('/api/auth', authRouter);

// --- API routes (all require authentication) ---
app.use('/api/connections', authMiddleware, connectionsRouter);
app.use('/api/query', authMiddleware, queryRouter);
app.use('/api/profiles', authMiddleware, profilesRouter);
app.use('/api/admin', authMiddleware, adminRouter);
app.use('/api/deployments', authMiddleware, deploymentsRouter);

// --- Webhook routes (use HMAC signature auth, not session token) ---
app.use('/api/webhooks', webhooksRouter);
app.use('/api/extracts', authMiddleware, extractsRouter);
app.use('/api/flows', authMiddleware, flowsRouter);

// --- Global error handler ---
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  healthMonitor.recordError();

  logger.error({
    err: err.message,
    requestId: req.requestId,
  }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
    requestId: req.requestId,
  });
});

// --- Start server ---
const port = parseInt(process.env.PORT || '4002', 10);

app.listen(port, () => {
  logger.info({ port, env: process.env.NODE_ENV || 'development' }, `Connector Proxy listening on port ${port}`);
});

export default app;
