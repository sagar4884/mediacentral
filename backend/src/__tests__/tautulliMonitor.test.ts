import { tautulliMonitor } from '../services/tautulliMonitor';
import { prismaMock } from './prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TautulliMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tautulliMonitor.activeStreams.clear();
  });

  describe('checkStreams', () => {
    it('should quietly return if Tautulli config is missing', async () => {
      prismaMock.setting.findUnique.mockResolvedValue(null);
      
      await tautulliMonitor.checkStreams();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should fetch active streams and update activeStreams set', async () => {
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'TautulliURL') return { value: 'http://tautulli' } as any;
        if (where.key === 'TautulliKey') return { value: 'key' } as any;
        return null;
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          response: {
            data: {
              sessions: [
                { title: 'Test Movie' },
                { title: 'Test Show - S01E01' }
              ]
            }
          }
        }
      });

      await tautulliMonitor.checkStreams();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://tautulli/api/v2', {
        params: { apikey: 'key', cmd: 'get_activity' }
      });

      expect(tautulliMonitor.activeStreams.has('Test Movie')).toBe(true);
      expect(tautulliMonitor.activeStreams.has('Test Show - S01E01')).toBe(true);
    });

    it('should clear active streams if there are no active sessions', async () => {
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'TautulliURL') return { value: 'http://tautulli' } as any;
        if (where.key === 'TautulliKey') return { value: 'key' } as any;
        return null;
      });

      // Initially has a stream
      tautulliMonitor.activeStreams.add('Old Stream');

      mockedAxios.get.mockResolvedValue({
        data: {
          response: {
            data: {
              sessions: []
            }
          }
        }
      });

      await tautulliMonitor.checkStreams();
      
      expect(tautulliMonitor.activeStreams.size).toBe(0);
    });

    it('should catch and log errors without throwing', async () => {
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'TautulliURL') return { value: 'http://tautulli' } as any;
        if (where.key === 'TautulliKey') return { value: 'key' } as any;
        return null;
      });

      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      // Should not throw
      await expect(tautulliMonitor.checkStreams()).resolves.toBeUndefined();
    });
  });
});
