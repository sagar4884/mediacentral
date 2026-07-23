import { plexService } from '../services/plexService';
import { prismaMock } from './prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PlexService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pushToPlex', () => {
    it('should quietly fail and not call plex api if token missing', async () => {
      prismaMock.setting.findUnique.mockResolvedValue(null);
      prismaMock.plexUser.findMany.mockResolvedValue([]);
      await plexService.pushToPlex();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should fetch and update Plex users', async () => {
      prismaMock.setting.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.key === 'PlexToken') return { value: 'token' } as any;
        if (where.key === 'PlexURL') return { value: 'http://plex' } as any;
        if (where.key === 'RevokedRoleName') return { value: 'Revoked' } as any;
        return null;
      });

      prismaMock.plexUser.findMany.mockResolvedValue([
        { id: '1', username: 'testuser', roleId: 'role1', role: { groups: [] } } as any
      ]);

      // Mock Plex API response
      mockedAxios.get.mockImplementation(async (url: string) => {
        if (url.includes('users')) {
          return { data: '<MediaContainer><User id="1" username="testuser"><Server machineIdentifier="server-id" id="share-id"/></User></MediaContainer>' };
        } else if (url.includes('server-id')) {
          return { data: '<MediaContainer><Server><Section key="1" id="100"/></Server></MediaContainer>' };
        }
        return { data: { MediaContainer: { machineIdentifier: 'server-id' } } };
      });

      mockedAxios.put.mockResolvedValue({ status: 200 });

      const res = await plexService.pushToPlex();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://plex/', expect.any(Object));
      expect(mockedAxios.get).toHaveBeenCalledWith('https://plex.tv/api/users', expect.any(Object));
      
      expect(res.success).toBe(true);
      expect(res.results.length).toBe(1);
    });
  });
});
