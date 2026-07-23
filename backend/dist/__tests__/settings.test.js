"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const settings_1 = __importDefault(require("../routes/settings"));
const prisma_mock_1 = require("./prisma.mock");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/api/settings', settings_1.default);
describe('Settings Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('GET /api/settings', () => {
        it('should fetch all settings and return them as a key-value object', async () => {
            prisma_mock_1.prismaMock.setting.findMany.mockResolvedValue([
                { key: 'UnraidURL', value: 'http://test' },
                { key: 'StorageProvider', value: 'Radarr' }
            ]);
            const res = await (0, supertest_1.default)(app).get('/api/settings');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                UnraidURL: 'http://test',
                StorageProvider: 'Radarr'
            });
        });
        it('should return 500 if DB fails', async () => {
            prisma_mock_1.prismaMock.setting.findMany.mockRejectedValue(new Error('DB Error'));
            const res = await (0, supertest_1.default)(app).get('/api/settings');
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
            prisma_mock_1.prismaMock.setting.upsert.mockResolvedValue({});
            const res = await (0, supertest_1.default)(app)
                .post('/api/settings')
                .send(payload);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(prisma_mock_1.prismaMock.setting.upsert).toHaveBeenCalledTimes(2);
            expect(prisma_mock_1.prismaMock.setting.upsert).toHaveBeenCalledWith({
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
            prisma_mock_1.prismaMock.setting.upsert.mockResolvedValue({});
            const res = await (0, supertest_1.default)(app)
                .post('/api/settings')
                .send(payload);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(prisma_mock_1.prismaMock.setting.upsert).toHaveBeenCalledTimes(1);
            expect(prisma_mock_1.prismaMock.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: 'null' } }));
        });
        it('should return 500 if upsert fails', async () => {
            prisma_mock_1.prismaMock.setting.upsert.mockRejectedValue(new Error('DB Error'));
            const res = await (0, supertest_1.default)(app)
                .post('/api/settings')
                .send({ Key: 'Value' });
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to update settings');
        });
    });
});
