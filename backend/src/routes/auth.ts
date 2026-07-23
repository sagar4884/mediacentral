import { Router } from 'express';
import { prisma } from '../index';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// Check authentication status and if setup is required
router.get('/verify', async (req, res) => {
  try {
    const adminUser = await prisma.setting.findUnique({ where: { key: 'AdminUsername' } });
    
    // If no AdminUsername is set in the DB, setup is required.
    if (!adminUser || !adminUser.value) {
      return res.json({ authenticated: false, requiresSetup: true });
    }

    const token = req.cookies?.token;
    if (!token) {
      return res.json({ authenticated: false, requiresSetup: false });
    }

    const jwtSecret = await prisma.setting.findUnique({ where: { key: 'JwtSecret' } });
    if (!jwtSecret || !jwtSecret.value) {
      return res.json({ authenticated: false, requiresSetup: false });
    }

    try {
      jwt.verify(token, jwtSecret.value);
      return res.json({ authenticated: true, requiresSetup: false });
    } catch (e) {
      return res.json({ authenticated: false, requiresSetup: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Setup initial credentials
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const existingAdmin = await prisma.setting.findUnique({ where: { key: 'AdminUsername' } });
    if (existingAdmin && existingAdmin.value) {
      return res.status(403).json({ error: 'Setup already completed' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const passwordHash = `${salt}:${hash}`;
    const newJwtSecret = generateSecret();

    await prisma.setting.upsert({ where: { key: 'AdminUsername' }, update: { value: username }, create: { key: 'AdminUsername', value: username } });
    await prisma.setting.upsert({ where: { key: 'AdminPasswordHash' }, update: { value: passwordHash }, create: { key: 'AdminPasswordHash', value: passwordHash } });
    await prisma.setting.upsert({ where: { key: 'JwtSecret' }, update: { value: newJwtSecret }, create: { key: 'JwtSecret', value: newJwtSecret } });

    const token = jwt.sign({ username }, newJwtSecret, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    
    res.json({ success: true, message: 'Setup complete', token });
  } catch (error) {
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Update credentials (for the settings page)
router.post('/update', async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body;
    
    // Authenticate user via token first
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const jwtSecret = await prisma.setting.findUnique({ where: { key: 'JwtSecret' } });
    if (!jwtSecret || !jwtSecret.value) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      jwt.verify(token, jwtSecret.value);
    } catch(e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminHash = await prisma.setting.findUnique({ where: { key: 'AdminPasswordHash' } });
    
    if (adminHash && adminHash.value) {
      // Must provide current password to change anything
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      
      const [salt, hash] = adminHash.value.split(':');
      const testHash = hashPassword(currentPassword, salt);
      if (testHash !== hash) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }
    } else {
      // If no admin user is currently set (migrating from an open installation), 
      // we allow setting it directly from settings page
      const newSecret = generateSecret();
      await prisma.setting.upsert({ where: { key: 'JwtSecret' }, update: { value: newSecret }, create: { key: 'JwtSecret', value: newSecret } });
    }

    if (newUsername) {
      await prisma.setting.upsert({ where: { key: 'AdminUsername' }, update: { value: newUsername }, create: { key: 'AdminUsername', value: newUsername } });
    }

    if (newPassword) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(newPassword, salt);
      const passwordHash = `${salt}:${hash}`;
      await prisma.setting.upsert({ where: { key: 'AdminPasswordHash' }, update: { value: passwordHash }, create: { key: 'AdminPasswordHash', value: passwordHash } });
    }

    res.json({ success: true, message: 'Credentials updated' });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const adminUser = await prisma.setting.findUnique({ where: { key: 'AdminUsername' } });
    const adminHash = await prisma.setting.findUnique({ where: { key: 'AdminPasswordHash' } });
    const jwtSecret = await prisma.setting.findUnique({ where: { key: 'JwtSecret' } });

    if (!adminUser || !adminHash || !jwtSecret) {
      return res.status(400).json({ error: 'Setup required' });
    }

    if (username !== adminUser.value) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const [salt, hash] = adminHash.value.split(':');
    const testHash = hashPassword(password, salt);

    if (testHash !== hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username }, jwtSecret.value, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

export default router;
