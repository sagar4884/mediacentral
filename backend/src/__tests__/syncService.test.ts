import { syncService } from '../services/syncService';
import { prismaMock } from './prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('manualSync', () => {
    it('should sync Radarr and Sonarr', async () => {
      // Mock Settings
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'RadarrURL') return { value: 'http://radarr' } as any;
        if (where.key === 'RadarrKey') return { value: 'key' } as any;
        if (where.key === 'SonarrURL') return { value: 'http://sonarr' } as any;
        if (where.key === 'SonarrKey') return { value: 'key' } as any;
        return null;
      });

      // Mock Radarr API
      mockedAxios.get.mockImplementation(async (url: string) => {
        if (url.includes('radarr')) {
          return {
            data: [
              {
                id: 1,
                title: 'Test Movie',
                tmdbId: 123,
                sizeOnDisk: 1000,
                hasFile: true,
                monitored: true,
                tags: []
              }
            ]
          };
        } else if (url.includes('sonarr')) {
          return {
            data: [
              {
                id: 2,
                title: 'Test Show',
                tvdbId: 456,
                statistics: { sizeOnDisk: 2000 },
                tags: []
              }
            ]
          };
        }
        return { data: [] };
      });

      await syncService.manualSync();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://radarr/api/v3/movie', expect.any(Object));
      expect(mockedAxios.get).toHaveBeenCalledWith('http://sonarr/api/v3/series', expect.any(Object));

      expect(prismaMock.mediaCache.upsert).toHaveBeenCalled();
    });

    it('should throw errors when API calls fail', async () => {
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'RadarrURL') return { value: 'http://radarr' } as any;
        if (where.key === 'RadarrKey') return { value: 'key' } as any;
        return null;
      });

      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(syncService.manualSync()).rejects.toThrow('Network Error');
    });
  });
});
