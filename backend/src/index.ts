import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import compression from 'compression';

const app = express();
app.use(compression());

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' });
export const prisma = new PrismaClient({ adapter });

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for large backup imports
app.use(cookieParser());

import settingsRouter from './routes/settings';
import tasksRouter from './routes/tasks';
import mediaRouter from './routes/media';
import plexRouter from './routes/plex';
import aiRouter from './routes/ai';
import realtimeRouter from './routes/realtime';
import authRouter from './routes/auth';
import backupRouter from './routes/backup';
import rollingRouter from './routes/rolling';
import webhooksRouter from './routes/webhooks';
import { authMiddleware } from './middleware/auth';

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/webhooks', webhooksRouter); // Webhooks rely on their own API key
app.use('/api/auth', authRouter); // Auth handles its own login/verify

// Protected API Routes
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/media', authMiddleware, mediaRouter);
app.use('/api/plex', authMiddleware, plexRouter);
app.use('/api/rolling', authMiddleware, rollingRouter);
app.use('/api/backup', authMiddleware, backupRouter);
app.use('/api/ai', authMiddleware, aiRouter);
app.use('/api/realtime', authMiddleware, realtimeRouter);

// Import services to start cron jobs
import { syncService } from './services/syncService';
import { tautulliMonitor } from './services/tautulliMonitor';
import { actionService } from './services/actionService';

const PORT = process.env.PORT || 4000;

app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  // Start background jobs
  syncService.startCron();
  tautulliMonitor.startCron();
  actionService.startCron();
});

// Global Error Handler to prevent HTML/Text 500 responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Global Error:", err);
  res.status(500).json({ error: 'Internal Server Error' });
});
