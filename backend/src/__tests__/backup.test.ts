import request from 'supertest';
import express from 'express';
import backupRouter from '../routes/backup';
import { prismaMock } from './prisma.mock';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/backup', backupRouter);

describe('Backup Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/backup/export', () => {
    it('should export all data when no query params provided', async () => {
      prismaMock.setting.findMany.mockResolvedValue([{ key: 'theme', value: 'dark' }]);
      prismaMock.mediaCache.findMany.mockResolvedValue([]);
      prismaMock.userAction.findMany.mockResolvedValue([]);
      prismaMock.plexGroup.findMany.mockResolvedValue([]);
      prismaMock.plexLibrary.findMany.mockResolvedValue([]);
      prismaMock.plexRole.findMany.mockResolvedValue([]);
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      prismaMock.plexViolation.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/backup/export');

      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0');
      expect(res.body.settings).toEqual([{ key: 'theme', value: 'dark' }]);
      expect(res.body.mediaCache).toBeDefined();
      expect(res.body.plexUsers).toBeDefined();
    });

    it('should correctly serialize BigInt values to strings', async () => {
      // Mock BigInt data
      prismaMock.setting.findMany.mockResolvedValue([]);
      prismaMock.mediaCache.findMany.mockResolvedValue([
        { id: '1', title: 'Test Movie', tmdbId: 123, sizeOnDisk: BigInt(5000000000) } as any
      ]);
      prismaMock.userAction.findMany.mockResolvedValue([]);
      prismaMock.plexGroup.findMany.mockResolvedValue([]);
      prismaMock.plexLibrary.findMany.mockResolvedValue([]);
      prismaMock.plexRole.findMany.mockResolvedValue([]);
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      prismaMock.plexViolation.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/backup/export');
      expect(res.status).toBe(200);
      expect(res.body.mediaCache[0].sizeOnDisk).toBe("5000000000"); // BigInt was serialized to string
    });
  });

  describe('POST /api/backup/import', () => {
    it('should return 400 for invalid backup format', async () => {
      const res = await request(app)
        .post('/api/backup/import')
        .send({ invalid: 'data' }); // Missing version

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid backup file format');
    });

    it('should execute upserts in a transaction and return success', async () => {
      const backupPayload = {
        version: '1.0',
        settings: [{ key: 'theme', value: 'dark' }],
        mediaCache: [{ id: '1', title: 'Test Movie', sizeOnDisk: "5000000000" }]
      };

      // Mock $transaction to immediately invoke the callback
      prismaMock.$transaction.mockImplementation(async (callback) => {
        // We pass the prismaMock itself as the transaction client (tx)
        return await (callback as any)(prismaMock);
      });

      prismaMock.setting.upsert.mockResolvedValue({ key: 'theme', value: 'dark' });
      prismaMock.mediaCache.upsert.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/backup/import')
        .send(backupPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.setting.upsert).toHaveBeenCalledWith({
        where: { key: 'theme' },
        update: { value: 'dark' },
        create: { key: 'theme', value: 'dark' }
      });
      // Ensure BigInt parsing works on import
      expect(prismaMock.mediaCache.upsert).toHaveBeenCalledWith({
        where: { id: '1' },
        update: expect.objectContaining({ id: '1', sizeOnDisk: BigInt(5000000000) }),
        create: expect.objectContaining({ id: '1', sizeOnDisk: BigInt(5000000000) })
      });
    });

    it('should correctly handle plexGroups and plexRoles relational nested data', async () => {
      const backupPayload = {
        version: '1.0',
        plexGroups: [{ name: 'Family', libraries: [{ id: 'movies-1' }] }],
        plexRoles: [{ name: 'Admin', groups: [{ id: 'Family' }] }]
      };

      prismaMock.$transaction.mockImplementation(async (cb) => await (cb as any)(prismaMock));

      const res = await request(app)
        .post('/api/backup/import')
        .send(backupPayload);

      expect(res.status).toBe(200);
      
      expect(prismaMock.plexGroup.upsert).toHaveBeenCalledWith({
        where: { name: 'Family' },
        update: { name: 'Family', libraries: { set: [{ id: 'movies-1' }] } },
        create: { name: 'Family', libraries: { connect: [{ id: 'movies-1' }] } }
      });

      expect(prismaMock.plexRole.upsert).toHaveBeenCalledWith({
        where: { name: 'Admin' },
        update: { name: 'Admin', groups: { set: [{ id: 'Family' }] } },
        create: { name: 'Admin', groups: { connect: [{ id: 'Family' }] } }
      });
    });

    it('should return 500 if transaction fails', async () => {
      const backupPayload = {
        version: '1.0',
        settings: [{ key: 'theme', value: 'dark' }]
      };

      prismaMock.$transaction.mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/backup/import')
        .send(backupPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to import backup. Ensure file is formatted correctly.');
    });
  });
});
