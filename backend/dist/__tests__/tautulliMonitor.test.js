"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tautulliMonitor_1 = require("../services/tautulliMonitor");
const prisma_mock_1 = require("./prisma.mock");
const axios_1 = __importDefault(require("axios"));
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('TautulliMonitor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        tautulliMonitor_1.tautulliMonitor.activeStreams.clear();
    });
    describe('checkStreams', () => {
        it('should quietly return if Tautulli config is missing', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValue(null);
            await tautulliMonitor_1.tautulliMonitor.checkStreams();
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });
        it('should fetch active streams and update activeStreams set', async () => {
            prisma_mock_1.prismaMock.plexUser.findMany.mockResolvedValue([]);
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'TautulliURL')
                    return { value: 'http://tautulli' };
                if (where.key === 'TautulliKey')
                    return { value: 'key' };
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
            await tautulliMonitor_1.tautulliMonitor.checkStreams();
            expect(mockedAxios.get).toHaveBeenCalledWith('http://tautulli/api/v2', {
                params: { apikey: 'key', cmd: 'get_activity' }
            });
            expect(tautulliMonitor_1.tautulliMonitor.activeStreams.has('Test Movie')).toBe(true);
            expect(tautulliMonitor_1.tautulliMonitor.activeStreams.has('Test Show - S01E01')).toBe(true);
        });
        it('should clear active streams if there are no active sessions', async () => {
            prisma_mock_1.prismaMock.plexUser.findMany.mockResolvedValue([]);
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'TautulliURL')
                    return { value: 'http://tautulli' };
                if (where.key === 'TautulliKey')
                    return { value: 'key' };
                return null;
            });
            // Initially has a stream
            tautulliMonitor_1.tautulliMonitor.activeStreams.add('Old Stream');
            mockedAxios.get.mockResolvedValue({
                data: {
                    response: {
                        data: {
                            sessions: []
                        }
                    }
                }
            });
            await tautulliMonitor_1.tautulliMonitor.checkStreams();
            expect(tautulliMonitor_1.tautulliMonitor.activeStreams.size).toBe(0);
        });
        it('should catch and log errors without throwing', async () => {
            prisma_mock_1.prismaMock.plexUser.findMany.mockResolvedValue([]);
            prisma_mock_1.prismaMock.setting.findUnique.mockImplementation(async ({ where }) => {
                if (where.key === 'TautulliURL')
                    return { value: 'http://tautulli' };
                if (where.key === 'TautulliKey')
                    return { value: 'key' };
                return null;
            });
            mockedAxios.get.mockRejectedValue(new Error('Network Error'));
            // Should not throw
            await expect(tautulliMonitor_1.tautulliMonitor.checkStreams()).resolves.toBeUndefined();
        });
    });
});
