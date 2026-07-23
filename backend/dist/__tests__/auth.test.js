"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = __importDefault(require("../routes/auth"));
const prisma_mock_1 = require("./prisma.mock");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use('/api/auth', auth_1.default);
// Set mock environment variables
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.ADMIN_USERNAME = 'admin';
describe('Auth Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('GET /api/auth/verify', () => {
        it('should return 200 with authenticated: false if no token provided', async () => {
            // Mock that setup is completed
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            const res = await (0, supertest_1.default)(app).get('/api/auth/verify');
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(false);
        });
        it('should return 200 with authenticated: false if token is invalid', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });
            const res = await (0, supertest_1.default)(app)
                .get('/api/auth/verify')
                .set('Cookie', 'token=invalid-token');
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(false);
        });
        it('should return 200 with authenticated: true if token is valid', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'test-secret' });
            const token = jsonwebtoken_1.default.sign({ username: 'admin' }, 'test-secret');
            const res = await (0, supertest_1.default)(app)
                .get('/api/auth/verify')
                .set('Cookie', `token=${token}`);
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(true);
        });
    });
    describe('POST /api/auth/login', () => {
        it('should return 400 if setup is required', async () => {
            // Mock that setup is required
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce(null);
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'password' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Setup required');
        });
        it('should return 401 on invalid credentials', async () => {
            // Setup is done
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminPasswordHash', value: 'salt:hash' });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'wrong', password: 'wrong' });
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Invalid credentials');
        });
        it('should return 200 and set cookie on successful login', async () => {
            // Mock setup complete
            const salt = crypto_1.default.randomBytes(16).toString('hex');
            const testHash = crypto_1.default.scryptSync('test-password', salt, 64).toString('hex');
            const passwordHash = `${salt}:${testHash}`;
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminPasswordHash', value: passwordHash });
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'test-password' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies[0]).toMatch(/token=/);
        });
    });
    describe('POST /api/auth/setup', () => {
        it('should return 403 if setup already done', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: 'password' });
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Setup already completed');
        });
        it('should return 400 on missing fields', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce(null);
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/setup')
                .send({ username: 'admin' }); // Missing password
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Username and password required');
        });
        it('should return 200 and set cookie on successful setup', async () => {
            prisma_mock_1.prismaMock.setting.findUnique.mockResolvedValueOnce(null);
            // Mock the upsert
            prisma_mock_1.prismaMock.setting.upsert.mockResolvedValue({ key: 'SetupComplete', value: 'true' });
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/setup')
                .send({ username: 'newadmin', password: 'strongpassword' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.headers['set-cookie']).toBeDefined();
        });
    });
    describe('POST /api/auth/logout', () => {
        it('should clear the token cookie', async () => {
            const res = await (0, supertest_1.default)(app).post('/api/auth/logout');
            expect(res.status).toBe(200);
            expect(res.headers['set-cookie'][0]).toMatch(/token=;/);
        });
    });
});
