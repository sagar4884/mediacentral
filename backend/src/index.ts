import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const app = express();

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

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/settings', settingsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/media', mediaRouter);
app.use('/api/plex', plexRouter);
app.use('/api/ai', aiRouter);
app.use('/api/realtime', realtimeRouter);
app.use('/api/auth', authRouter);
app.use('/api/backup', backupRouter);
app.use('/api/rolling', rollingRouter);
app.use('/api/webhooks', webhooksRouter);

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
// trigger restart
// trigger restart 2
// trigger restart 3
// trigger restart 4
// trigger restart 5
// trigger restart 6
// trigger restart 7
// trigger restart 8
