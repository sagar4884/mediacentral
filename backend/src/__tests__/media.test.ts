import request from 'supertest';
import express from 'express';
import mediaRouter from '../routes/media';
import { prismaMock } from './prisma.mock';

const app = express();
app.use(express.json());
app.use('/api/media', mediaRouter);

describe('Media Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/media', () => {
    it('should fetch media items from the database', async () => {
      prismaMock.mediaCache.findMany.mockResolvedValue([
        { id: '1', type: 'movie', title: 'Test Movie', tmdbId: 123, sizeOnDisk: BigInt(5000000000) } as any
      ]);

      const res = await request(app).get('/api/media');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Test Movie');
      // Ensure BigInt was serialized properly in the express route to Number
      expect(res.body[0].sizeOnDisk).toBe(5000000000);
    });

    it('should filter by status and source query parameters', async () => {
      prismaMock.mediaCache.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/media?status=waiting&source=Radarr');

      expect(res.status).toBe(200);
      expect(prismaMock.mediaCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { keepStatus: 'waiting', source: 'Radarr' }
        })
      );
    });
  });

  describe('GET /api/media/stats', () => {
    it('should calculate and return media stats', async () => {
      prismaMock.mediaCache.count.mockImplementation(async ({ where }: any) => {
        if (where.source === 'Radarr') return 10;
        if (where.source === 'Sonarr') return 5;
        return 0;
      });

      prismaMock.mediaCache.aggregate.mockImplementation(async ({ where }: any) => {
        if (where.source === 'Radarr') return { _sum: { sizeOnDisk: BigInt(2000) } } as any;
        if (where.source === 'Sonarr') return { _sum: { sizeOnDisk: BigInt(1000) } } as any;
        return { _sum: { sizeOnDisk: BigInt(0) } } as any;
      });

      prismaMock.setting.findUnique.mockResolvedValue(null);
      prismaMock.mediaCache.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/media/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalMovies).toBe(10);
      expect(res.body.totalShows).toBe(5);
      expect(res.body.storageBytes).toBe(3000);
      expect(res.body.moviesBytes).toBe(2000);
      expect(res.body.showsBytes).toBe(1000);
    });
  });
});
