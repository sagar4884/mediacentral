import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUser = await prisma.setting.findUnique({ where: { key: 'AdminUsername' } });
    
    // If no AdminUsername is set, the system is essentially unprotected (waiting for setup)
    // We allow access so the frontend setup can proceed.
    if (!adminUser || !adminUser.value) {
      return next();
    }

    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const jwtSecret = await prisma.setting.findUnique({ where: { key: 'JwtSecret' } });
    if (!jwtSecret || !jwtSecret.value) {
      return res.status(401).json({ error: 'Unauthorized: Server misconfiguration' });
    }

    try {
      jwt.verify(token, jwtSecret.value);
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
