import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// GET /api/backup/export
// Query params to select what to export
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { settings, media, plex } = req.query;
    
    // Default to true if not specified
    const exportSettings = settings !== 'false';
    const exportMedia = media !== 'false';
    const exportPlex = plex !== 'false';

    const backupData: any = {
      version: '1.0',
      timestamp: new Date().toISOString()
    };

    if (exportSettings) {
      backupData.settings = await prisma.setting.findMany();
    }

    if (exportMedia) {
      backupData.mediaCache = await prisma.mediaCache.findMany();
      backupData.userActions = await prisma.userAction.findMany();
    }

    if (exportPlex) {
      backupData.plexGroups = await prisma.plexGroup.findMany({ include: { libraries: true } });
      backupData.plexLibraries = await prisma.plexLibrary.findMany();
      backupData.plexRoles = await prisma.plexRole.findMany({ include: { groups: true } });
      backupData.plexUsers = await prisma.plexUser.findMany();
      backupData.plexViolations = await prisma.plexViolation.findMany();
    }

    // Since BigInts cannot be directly stringified by JSON.stringify, 
    // we convert them to strings in the payload manually before returning.
    const serializeBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return obj.toString();
      if (Array.isArray(obj)) return obj.map(serializeBigInt);
      if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key of Object.keys(obj)) {
          newObj[key] = serializeBigInt(obj[key]);
        }
        return newObj;
      }
      return obj;
    };

    res.json(serializeBigInt(backupData));
  } catch (error: any) {
    console.error('Failed to export backup:', error);
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

// POST /api/backup/import
// Accepts JSON payload to upsert into DB
router.post('/import', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    if (!data || !data.version) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    // Use Prisma transaction to ensure partial imports don't corrupt state
    await prisma.$transaction(async (tx) => {
      // 1. Settings
      if (data.settings && Array.isArray(data.settings)) {
        for (const setting of data.settings) {
          await tx.setting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: { key: setting.key, value: setting.value }
          });
        }
      }

      // 2. Media Curation
      if (data.mediaCache && Array.isArray(data.mediaCache)) {
        for (const mc of data.mediaCache) {
          // BigInt restoration
          if (mc.sizeOnDisk) mc.sizeOnDisk = BigInt(mc.sizeOnDisk);
          await tx.mediaCache.upsert({
            where: { id: mc.id },
            update: mc,
            create: mc
          });
        }
      }

      if (data.userActions && Array.isArray(data.userActions)) {
        for (const ua of data.userActions) {
          await tx.userAction.upsert({
            where: { id: ua.id },
            update: ua,
            create: ua
          });
        }
      }

      // 3. Plex Data
      if (data.plexLibraries && Array.isArray(data.plexLibraries)) {
        for (const lib of data.plexLibraries) {
          await tx.plexLibrary.upsert({
            where: { id: lib.id },
            update: lib,
            create: lib
          });
        }
      }

      if (data.plexGroups && Array.isArray(data.plexGroups)) {
        for (const pg of data.plexGroups) {
          const libraryIds = pg.libraries ? pg.libraries.map((l: any) => ({ id: l.id })) : [];
          // Delete pg.libraries from payload to match create shape, handle relations via connect
          delete pg.libraries;
          
          await tx.plexGroup.upsert({
            where: { name: pg.name },
            update: { ...pg, libraries: { set: libraryIds } },
            create: { ...pg, libraries: { connect: libraryIds } }
          });
        }
      }

      if (data.plexRoles && Array.isArray(data.plexRoles)) {
        for (const pr of data.plexRoles) {
          const groupIds = pr.groups ? pr.groups.map((g: any) => ({ id: g.id })) : [];
          delete pr.groups;

          await tx.plexRole.upsert({
            where: { name: pr.name },
            update: { ...pr, groups: { set: groupIds } },
            create: { ...pr, groups: { connect: groupIds } }
          });
        }
      }

      if (data.plexUsers && Array.isArray(data.plexUsers)) {
        for (const pu of data.plexUsers) {
          await tx.plexUser.upsert({
            where: { id: pu.id },
            update: pu,
            create: pu
          });
        }
      }

      if (data.plexViolations && Array.isArray(data.plexViolations)) {
        for (const pv of data.plexViolations) {
          await tx.plexViolation.upsert({
            where: { id: pv.id },
            update: pv,
            create: pv
          });
        }
      }
    });

    res.json({ success: true, message: 'Backup successfully imported.' });
  } catch (error: any) {
    console.error('Failed to import backup:', error);
    res.status(500).json({ error: 'Failed to import backup. Ensure file is formatted correctly.' });
  }
});

export default router;
