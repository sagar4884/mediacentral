import request from 'supertest';
import express from 'express';
import settingsRouter from '../routes/settings';
import { prismaMock } from './prisma.mock';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRouter);

describe('Settings Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('should fetch all settings and return them as a key-value object', async () => {
      prismaMock.setting.findMany.mockResolvedValue([
        { key: 'UnraidURL', value: 'http://test' },
        { key: 'StorageProvider', value: 'Radarr' }
      ]);

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        UnraidURL: 'http://test',
        StorageProvider: 'Radarr'
      });
    });

    it('should return 500 if DB fails', async () => {
      prismaMock.setting.findMany.mockRejectedValue(new Error('DB Error'));

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch settings');
    });
  });

  describe('POST /api/settings', () => {
    it('should upsert all provided settings', async () => {
      const payload = {
        UnraidURL: 'http://newurl',
        StorageProvider: 'Unraid'
      };

      // Ensure upserts succeed
      prismaMock.setting.upsert.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/settings')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      expect(prismaMock.setting.upsert).toHaveBeenCalledTimes(2);
      expect(prismaMock.setting.upsert).toHaveBeenCalledWith({
        where: { key: 'UnraidURL' },
        update: { value: 'http://newurl' },
        create: { key: 'UnraidURL', value: 'http://newurl' }
      });
    });

    it('should convert null or undefined values to strings', async () => {
      const payload = {
        UnraidURL: null,
        StorageProvider: undefined
      };

      prismaMock.setting.upsert.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/settings')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      expect(prismaMock.setting.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.setting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { value: 'null' } })
      );
    });

    it('should return 500 if upsert fails', async () => {
      prismaMock.setting.upsert.mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/settings')
        .send({ Key: 'Value' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update settings');
    });
  });
});
