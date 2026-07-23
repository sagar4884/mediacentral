"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const plexService_1 = require("../services/plexService");
const prisma_mock_1 = require("./prisma.mock");
const axios_1 = __importDefault(require("axios"));
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('PlexService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('pushToPlex', () => {
        it('should quietly fail and not call plex api if token missing', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValue(null);
            prisma_mock_1.prismaMock.plexUser.findMany.mockResolvedValue([]);
            await plexService_1.plexService.pushToPlex();
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });
        it('should fetch and update Plex users', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'PlexToken')
                    return { value: 'token' };
                if (where.key === 'PlexURL')
                    return { value: 'http://plex' };
                if (where.key === 'RevokedRoleName')
                    return { value: 'Revoked' };
                return null;
            });
            prisma_mock_1.prismaMock.plexUser.findMany.mockResolvedValue([
                { id: '1', username: 'testuser', roleId: 'role1', role: { groups: [] } }
            ]);
            // Mock Plex API response
            mockedAxios.get.mockImplementation(async (url) => {
                if (url.includes('users')) {
                    return { data: '<MediaContainer><User id="1" username="testuser"><Server machineIdentifier="server-id" id="share-id"/></User></MediaContainer>' };
                }
                else if (url.includes('server-id')) {
                    return { data: '<MediaContainer><Server><Section key="1" id="100"/></Server></MediaContainer>' };
                }
                return { data: { MediaContainer: { machineIdentifier: 'server-id' } } };
            });
            mockedAxios.put.mockResolvedValue({ status: 200 });
            const res = await plexService_1.plexService.pushToPlex();
            expect(mockedAxios.get).toHaveBeenCalledWith('http://plex/', expect.any(Object));
            expect(mockedAxios.get).toHaveBeenCalledWith('https://plex.tv/api/users', expect.any(Object));
            expect(res.success).toBe(true);
            expect(res.results.length).toBe(1);
        });
    });
});
