"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const actionService_1 = require("../services/actionService");
const prisma_mock_1 = require("./prisma.mock");
const axios_1 = __importDefault(require("axios"));
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('ActionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('executeInstantDelete', () => {
        it('should throw an error if item is not found', async () => {
            prisma_mock_1.prismaMock.mediaCache.findUnique.mockResolvedValue(null);
            await expect(actionService_1.actionService.executeInstantDelete('invalid')).rejects.toThrow('Item not found');
        });
        it('should delete from Radarr if source is Radarr', async () => {
            prisma_mock_1.prismaMock.mediaCache.findUnique.mockResolvedValue({
                id: '1',
                sourceId: '100',
                source: 'Radarr',
            });
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'RadarrURL')
                    return { value: 'http://radarr' };
                if (where.key === 'RadarrKey')
                    return { value: 'key' };
                return null;
            });
            mockedAxios.delete.mockResolvedValue({ status: 200 });
            await actionService_1.actionService.executeInstantDelete('1');
            expect(mockedAxios.delete).toHaveBeenCalledWith('http://radarr/api/v3/movie/100', expect.objectContaining({
                headers: { 'X-Api-Key': 'key' },
                params: { deleteFiles: true, addImportExclusion: true }
            }));
            // Verify db updates
            expect(prisma_mock_1.prismaMock.mediaCache.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: expect.objectContaining({ keepStatus: 'archive', markedForDeletionAt: null })
            });
        });
        it('should archive without calling API if Radarr config is missing', async () => {
            prisma_mock_1.prismaMock.mediaCache.findUnique.mockResolvedValue({
                id: '1',
                sourceId: '100',
                source: 'Radarr',
            });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValue(null);
            await actionService_1.actionService.executeInstantDelete('1');
            expect(mockedAxios.delete).not.toHaveBeenCalled();
            expect(prisma_mock_1.prismaMock.mediaCache.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: expect.objectContaining({ keepStatus: 'archive' })
            });
        });
        it('should handle Sonarr deletion correctly', async () => {
            prisma_mock_1.prismaMock.mediaCache.findUnique.mockResolvedValue({
                id: '2',
                sourceId: '200',
                source: 'Sonarr',
            });
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'SonarrURL')
                    return { value: 'http://sonarr' };
                if (where.key === 'SonarrKey')
                    return { value: 'key' };
                return null;
            });
            mockedAxios.delete.mockResolvedValue({ status: 200 });
            await actionService_1.actionService.executeInstantDelete('2');
            expect(mockedAxios.delete).toHaveBeenCalledWith('http://sonarr/api/v3/series/200', expect.objectContaining({
                headers: { 'X-Api-Key': 'key' },
                params: { deleteFiles: true, addImportListExclusion: true }
            }));
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
            prisma_mock_1.prismaMock.mediaCache.findMany.mockResolvedValue(items);
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'DryRunMode')
                    return { value: 'false' };
                if (where.key === 'DeletionGracePeriod')
                    return { value: '30' };
                if (where.key === 'RadarrURL')
                    return { value: 'http://radarr' };
                if (where.key === 'RadarrKey')
                    return { value: 'key' };
                return null;
            });
            prisma_mock_1.prismaMock.mediaCache.findUnique.mockResolvedValue(items[0]);
            mockedAxios.delete.mockResolvedValue({ status: 200 });
            await actionService_1.actionService.processDeletions();
            // Should only try to delete Radarr id 1
            expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
            expect(mockedAxios.delete).toHaveBeenCalledWith('http://radarr/api/v3/movie/1', expect.any(Object));
        });
    });
});
