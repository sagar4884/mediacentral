import { actionService } from '../services/actionService';
import { prismaMock } from './prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ActionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeInstantDelete', () => {
    it('should throw an error if item is not found', async () => {
      prismaMock.mediaCache.findUnique.mockResolvedValue(null);
      await expect(actionService.executeInstantDelete('invalid')).rejects.toThrow('Item not found');
    });

    it('should delete from Radarr if source is Radarr', async () => {
      prismaMock.mediaCache.findUnique.mockResolvedValue({
        id: '1',
        sourceId: '100',
        source: 'Radarr',
      } as any);

      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'RadarrURL') return { value: 'http://radarr' } as any;
        if (where.key === 'RadarrKey') return { value: 'key' } as any;
        return null;
      });

      mockedAxios.delete.mockResolvedValue({ status: 200 });

      await actionService.executeInstantDelete('1');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'http://radarr/api/v3/movie/100',
        expect.objectContaining({ 
          headers: { 'X-Api-Key': 'key' },
          params: { deleteFiles: true, addImportExclusion: true }
        })
      );

      // Verify db updates
      expect(prismaMock.mediaCache.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: expect.objectContaining({ keepStatus: 'archive', markedForDeletionAt: null })
      });
    });

    it('should archive without calling API if Radarr config is missing', async () => {
      prismaMock.mediaCache.findUnique.mockResolvedValue({
        id: '1',
        sourceId: '100',
        source: 'Radarr',
      } as any);
      
      prismaMock.setting.findUnique.mockResolvedValue(null);

      await actionService.executeInstantDelete('1');
      expect(mockedAxios.delete).not.toHaveBeenCalled();
      expect(prismaMock.mediaCache.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: expect.objectContaining({ keepStatus: 'archive' })
      });
    });

    it('should handle Sonarr deletion correctly', async () => {
      prismaMock.mediaCache.findUnique.mockResolvedValue({
        id: '2',
        sourceId: '200',
        source: 'Sonarr',
      } as any);

      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'SonarrURL') return { value: 'http://sonarr' } as any;
        if (where.key === 'SonarrKey') return { value: 'key' } as any;
        return null;
      });

      mockedAxios.delete.mockResolvedValue({ status: 200 });

      await actionService.executeInstantDelete('2');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'http://sonarr/api/v3/series/200',
        expect.objectContaining({ 
          headers: { 'X-Api-Key': 'key' },
          params: { deleteFiles: true, addImportListExclusion: true }
        })
      );
    });
  });

  describe('processDeletions', () => {
    it('should process only media that are marked for deletion and past their wait window', async () => {
      // Create a date older than 30 days
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      // Create a date within the last 30 days
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const items = [
        { id: '1', keepStatus: 'marked_for_deletion', source: 'Radarr', sourceId: '1', markedForDeletionAt: thirtyOneDaysAgo },
        { id: '2', keepStatus: 'marked_for_deletion', source: 'Sonarr', sourceId: '2', markedForDeletionAt: tenDaysAgo } // Should not process
      ];

      prismaMock.mediaCache.findMany.mockResolvedValue(items as any);
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'DryRunMode') return { value: 'false' } as any;
        if (where.key === 'DeletionGracePeriod') return { value: '30' } as any;
        if (where.key === 'RadarrURL') return { value: 'http://radarr' } as any;
        if (where.key === 'RadarrKey') return { value: 'key' } as any;
        return null;
      });
      
      prismaMock.mediaCache.findUnique.mockResolvedValue(items[0] as any);

      mockedAxios.delete.mockResolvedValue({ status: 200 });

      await actionService.processDeletions();

      // Should only try to delete Radarr id 1
      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'http://radarr/api/v3/movie/1',
        expect.any(Object)
      );
    });
  });
});
