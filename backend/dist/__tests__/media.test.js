"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const media_1 = __importDefault(require("../routes/media"));
const prisma_mock_1 = require("./prisma.mock");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/api/media', media_1.default);
describe('Media Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('GET /api/media', () => {
        it('should fetch media items from the database', async () => {
            prisma_mock_1.prismaMock.mediaCache.findMany.mockResolvedValue([
                { id: '1', type: 'movie', title: 'Test Movie', tmdbId: 123, sizeOnDisk: BigInt(5000000000) }
            ]);
            const res = await (0, supertest_1.default)(app).get('/api/media');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].title).toBe('Test Movie');
            // Ensure BigInt was serialized properly in the express route to Number
            expect(res.body[0].sizeOnDisk).toBe(5000000000);
        });
        it('should filter by status and source query parameters', async () => {
            prisma_mock_1.prismaMock.mediaCache.findMany.mockResolvedValue([]);
            const res = await (0, supertest_1.default)(app).get('/api/media?status=waiting&source=Radarr');
            expect(res.status).toBe(200);
            expect(prisma_mock_1.prismaMock.mediaCache.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { keepStatus: 'waiting', source: 'Radarr' }
            }));
        });
    });
    describe('GET /api/media/stats', () => {
        it('should calculate and return media stats', async () => {
            prisma_mock_1.prismaMock.mediaCache.count.mockImplementation(async ({ where }) => {
                if (where.source === 'Radarr')
                    return 10;
                if (where.source === 'Sonarr')
                    return 5;
                return 0;
            });
            prisma_mock_1.prismaMock.mediaCache.aggregate.mockImplementation(async ({ where }) => {
                if (where.source === 'Radarr')
                    return { _sum: { sizeOnDisk: BigInt(2000) } };
                if (where.source === 'Sonarr')
                    return { _sum: { sizeOnDisk: BigInt(1000) } };
                return { _sum: { sizeOnDisk: BigInt(0) } };
            });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValue(null);
            prisma_mock_1.prismaMock.mediaCache.findMany.mockResolvedValue([]);
            const res = await (0, supertest_1.default)(app).get('/api/media/stats');
            expect(res.status).toBe(200);
            expect(res.body.totalMovies).toBe(10);
            expect(res.body.totalShows).toBe(5);
            expect(res.body.storageBytes).toBe(3000);
            expect(res.body.moviesBytes).toBe(2000);
            expect(res.body.showsBytes).toBe(1000);
        });
    });
});
