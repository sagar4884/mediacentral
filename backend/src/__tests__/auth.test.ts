import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth';
import { prismaMock } from './prisma.mock';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

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
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });

      const res = await request(app).get('/api/auth/verify');
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });

    it('should return 200 with authenticated: false if token is invalid', async () => {
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', 'token=invalid-token');
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });

    it('should return 200 with authenticated: true if token is valid', async () => {
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'test-secret' });
      
      const token = jwt.sign({ username: 'admin' }, 'test-secret');
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', `token=${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if setup is required', async () => {
      // Mock that setup is required
      prismaMock.setting.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Setup required');
    });

    it('should return 401 on invalid credentials', async () => {
      // Setup is done
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminPasswordHash', value: 'salt:hash' });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 200 and set cookie on successful login', async () => {
      // Mock setup complete
      const salt = crypto.randomBytes(16).toString('hex');
      const testHash = crypto.scryptSync('test-password', salt, 64).toString('hex');
      const passwordHash = `${salt}:${testHash}`;

      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminPasswordHash', value: passwordHash });
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'JwtSecret', value: 'secret' });

      const res = await request(app)
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
      prismaMock.setting.findUnique.mockResolvedValueOnce({ key: 'AdminUsername', value: 'admin' });

      const res = await request(app)
        .post('/api/auth/setup')
        .send({ username: 'admin', password: 'password' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Setup already completed');
    });

    it('should return 400 on missing fields', async () => {
      prismaMock.setting.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/setup')
        .send({ username: 'admin' }); // Missing password

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password required');
    });

    it('should return 200 and set cookie on successful setup', async () => {
      prismaMock.setting.findUnique.mockResolvedValueOnce(null);
      // Mock the upsert
      prismaMock.setting.upsert.mockResolvedValue({ key: 'SetupComplete', value: 'true' });

      const res = await request(app)
        .post('/api/auth/setup')
        .send({ username: 'newadmin', password: 'strongpassword' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the token cookie', async () => {
      const res = await request(app).post('/api/auth/logout');
      
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie'][0]).toMatch(/token=;/);
    });
  });
});
