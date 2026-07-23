import express from 'express';
import { prisma } from '../index';
import { actionService } from '../services/actionService';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const shows = await prisma.rollingShow.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(shows);
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
    const { id, status, keepEpisodes } = req.body;
    const show = await prisma.rollingShow.update({
      where: { id },
      data: { status, keepEpisodes }
    });
    res.json(show);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dry-run', async (req, res) => {
  try {
    const results = await actionService.runRollingDryRun();
    res.json(results);
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
