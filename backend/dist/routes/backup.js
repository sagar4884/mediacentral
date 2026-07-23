"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
// GET /api/backup/export
// Query params to select what to export
router.get('/export', async (req, res) => {
    try {
        const { settings, media, plex } = req.query;
        // Default to true if not specified
        const exportSettings = settings !== 'false';
        const exportMedia = media !== 'false';
        const exportPlex = plex !== 'false';
        const backupData = {
            version: '1.0',
            timestamp: new Date().toISOString()
        };
        if (exportSettings) {
            backupData.settings = await index_1.prisma.setting.findMany();
        }
        if (exportMedia) {
            backupData.mediaCache = await index_1.prisma.mediaCache.findMany();
            backupData.userActions = await index_1.prisma.userAction.findMany();
        }
        if (exportPlex) {
            backupData.plexGroups = await index_1.prisma.plexGroup.findMany({ include: { libraries: true } });
            backupData.plexLibraries = await index_1.prisma.plexLibrary.findMany();
            backupData.plexRoles = await index_1.prisma.plexRole.findMany({ include: { groups: true } });
            backupData.plexUsers = await index_1.prisma.plexUser.findMany();
            backupData.plexViolations = await index_1.prisma.plexViolation.findMany();
        }
        // Since BigInts cannot be directly stringified by JSON.stringify, 
        // we convert them to strings in the payload manually before returning.
        const serializeBigInt = (obj) => {
            if (obj === null || obj === undefined)
                return obj;
            if (typeof obj === 'bigint')
                return obj.toString();
            if (Array.isArray(obj))
                return obj.map(serializeBigInt);
            if (typeof obj === 'object') {
                const newObj = {};
                for (const key of Object.keys(obj)) {
                    newObj[key] = serializeBigInt(obj[key]);
                }
                return newObj;
            }
            return obj;
        };
        res.json(serializeBigInt(backupData));
    }
    catch (error) {
        console.error('Failed to export backup:', error);
        res.status(500).json({ error: 'Failed to export backup' });
    }
});
// POST /api/backup/import
// Accepts JSON payload to upsert into DB
router.post('/import', async (req, res) => {
    try {
        const data = req.body;
        if (!data || !data.version) {
            return res.status(400).json({ error: 'Invalid backup file format' });
        }
        // Use Prisma transaction to ensure partial imports don't corrupt state
        await index_1.prisma.$transaction(async (tx) => {
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
                    if (mc.sizeOnDisk)
                        mc.sizeOnDisk = BigInt(mc.sizeOnDisk);
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
                    const libraryIds = pg.libraries ? pg.libraries.map((l) => ({ id: l.id })) : [];
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
                    const groupIds = pr.groups ? pr.groups.map((g) => ({ id: g.id })) : [];
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
    }
    catch (error) {
        console.error('Failed to import backup:', error);
        res.status(500).json({ error: 'Failed to import backup. Ensure file is formatted correctly.' });
    }
});
exports.default = router;
