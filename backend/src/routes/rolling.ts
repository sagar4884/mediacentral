import express from 'express';
import { prisma } from '../index';
import { actionService } from '../services/actionService';
import { syncService } from '../services/syncService';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const sonarrShows = await prisma.mediaCache.findMany({
      where: { source: 'Sonarr' },
      orderBy: { name: 'asc' }
    });
    
    const rollingOverrides = await prisma.rollingShow.findMany();
    const overrideMap = new Map(rollingOverrides.map(r => [r.sonarrId, r]));

    const results = sonarrShows.map(show => {
      const tags = JSON.parse(show.tags || '[]');
      const isRolling = tags.includes('ai-rolling-keep');
      const isNotRolling = tags.includes('not-rolling-keep');
      
      let status = 'none';
      if (isRolling) status = 'active';
      else if (isNotRolling) status = 'ignored';
      
      const override = overrideMap.get(Number(show.sourceId));
      if (!isRolling && !isNotRolling && override && override.status === 'pending') {
        status = 'pending';
      }

      return {
        ...show,
        sizeOnDisk: show.sizeOnDisk ? Number(show.sizeOnDisk) : 0,
        rollingId: override?.id || -1,
        sonarrId: Number(show.sourceId),
        status,
        keepEpisodes: override?.keepEpisodes || null,
        aiRecommended: override?.aiRecommended || false
      };
    }).filter(r => r.status !== 'none');

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    await syncService.syncSonarr();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scan-ai', async (req, res) => {
  try {
    await actionService.scanForRollingShows();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/update', async (req, res) => {
  try {
    const { sonarrId, status, keepEpisodes } = req.body;
    
    // Create override if it doesn't exist yet
    let override = await prisma.rollingShow.findUnique({ where: { sonarrId: Number(sonarrId) } });
    if (!override) {
      const media = await prisma.mediaCache.findUnique({ where: { source_sourceId: { source: 'Sonarr', sourceId: Number(sonarrId) } }});
      override = await prisma.rollingShow.create({
        data: {
          sonarrId: Number(sonarrId),
          name: media?.name || 'Unknown',
          status: 'none'
        }
      });
    }

    if (keepEpisodes !== undefined) {
      override = await prisma.rollingShow.update({
        where: { sonarrId: Number(sonarrId) },
        data: { keepEpisodes }
      });
    }

    if (status === 'active') {
      await actionService.updateSonarrTag(Number(sonarrId), 'ai-rolling-keep');
      // Update override status so pending is cleared
      await prisma.rollingShow.update({ where: { sonarrId: Number(sonarrId) }, data: { status: 'active' }});
    } else if (status === 'ignored') {
      await actionService.updateSonarrTag(Number(sonarrId), 'not-rolling-keep');
      // Update override status
      await prisma.rollingShow.update({ where: { sonarrId: Number(sonarrId) }, data: { status: 'ignored' }});
    }
    
    // Sync to refresh tags locally
    if (status === 'active' || status === 'ignored') {
      await syncService.syncSonarr();
    }

    res.json({ success: true, override });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { selections } = req.body; // Array of objects containing sonarrId and seasonNumber
    const results = await actionService.executeManualRolling(selections);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
