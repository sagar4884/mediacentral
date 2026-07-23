"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const syncService_1 = require("../services/syncService");
const prisma_mock_1 = require("./prisma.mock");
const axios_1 = __importDefault(require("axios"));
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('SyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('manualSync', () => {
        it('should sync Radarr and Sonarr', async () => {
            // Mock Settings
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'RadarrURL')
                    return { value: 'http://radarr' };
                if (where.key === 'RadarrKey')
                    return { value: 'key' };
                if (where.key === 'SonarrURL')
                    return { value: 'http://sonarr' };
                if (where.key === 'SonarrKey')
                    return { value: 'key' };
                return null;
            });
            // Mock Radarr API
            mockedAxios.get.mockImplementation(async (url) => {
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
                }
                else if (url.includes('sonarr')) {
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
            await syncService_1.syncService.manualSync();
            expect(mockedAxios.get).toHaveBeenCalledWith('http://radarr/api/v3/movie', expect.any(Object));
            expect(mockedAxios.get).toHaveBeenCalledWith('http://sonarr/api/v3/series', expect.any(Object));
            expect(prisma_mock_1.prismaMock.mediaCache.upsert).toHaveBeenCalled();
        });
        it('should throw errors when API calls fail', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'RadarrURL')
                    return { value: 'http://radarr' };
                if (where.key === 'RadarrKey')
                    return { value: 'key' };
                return null;
            });
            mockedAxios.get.mockRejectedValue(new Error('Network Error'));
            await expect(syncService_1.syncService.manualSync()).rejects.toThrow('Network Error');
        });
    });
});
