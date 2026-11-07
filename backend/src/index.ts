// backend/src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { valkeyClient } from './config/valkey';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';

import authRoutes from './routes/auth';
import taskRoutes from './routes/tasks';
import erpRoutes from './routes/erp';
import gmailRoutes from './routes/gmail';
import aiRoutes from './routes/ai';
import notificationRoutes from './routes/notifications';
import telegramRoutes from './routes/telegram';
import examRoutes from './routes/exams';
import preferenceRoutes from './routes/preferences';

import { startWorkers, startCronJobs } from './jobs/scheduler';
import { valkeyCache } from './config/valkey';

const app = express();

// ─── Security & Middleware ────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3000',
      'exp://localhost:8081', // Expo dev
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));
app.use(generalLimiter);

// ─── Health Check ────────────────────────
app.get('/health', async (req, res) => {
  const valkeyHealthy = await valkeyCache.isHealthy().catch(() => false);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    version: '1.0.0',
    valkey: valkeyHealthy ? 'connected' : 'disconnected',
  });
});

// ─── Routes ────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/preferences', preferenceRoutes);

// ─── Error handling ───────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Server start ────────────────────────
async function main() {
  try {
    await connectDatabase();
    try {
      startWorkers();
      startCronJobs();
    } catch (err) {
      logger.warn('Background workers could not start (Redis may be unavailable):', err);
    }
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 LifePilot AI Backend running on port ${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
      logger.info(`   Frontend URL: ${env.FRONTEND_URL}`);
    });

    // Port conflict handling
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use. Ensure no other instance is running.`);
        process.exit(1);
      }
      logger.error('Server error:', err);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutdown signal received, closing server...');
      server.close(() => {
        logger.info('HTTP server closed');
        disconnectDatabase().catch(e => logger.error('Error disconnecting DB:', e));
        valkeyClient.quit().catch(e => logger.error('Error quitting Valkey:', e));
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

export default app;
