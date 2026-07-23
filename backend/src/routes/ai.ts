import { Router } from 'express';
import { aiService } from '../services/aiService';
import { taskQueue } from '../services/taskQueue';

const router = Router();

// Get AI rules for a source
router.get('/rules', async (req, res) => {
  try {
    const { source } = req.query;
    if (!source) return res.status(400).json({ error: 'Source is required' });
    const rules = await aiService.getRules(String(source));
    
    // Check for pending proposals
    const { prisma } = require('../index');
    const pendingRulesObj = await prisma.setting.findUnique({ where: { key: `${source}AIPendingRules` } });
    const pendingExpObj = await prisma.setting.findUnique({ where: { key: `${source}AIPendingExplanation` } });
    
    res.json({ 
      rules, 
      pendingRules: pendingRulesObj?.value || null,
      pendingExplanation: pendingExpObj?.value || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manually save AI rules for a source
router.post('/rules', async (req, res) => {
  try {
    const { source, rules } = req.body;
    if (!source || !rules) return res.status(400).json({ error: 'Source and rules are required' });
    await aiService.saveRules(source, rules);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Discard pending AI rules for a source
router.post('/rules/discard-pending', async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: 'Source is required' });
    const { prisma } = require('../index');
    await prisma.setting.deleteMany({
      where: { key: { in: [`${source}AIPendingRules`, `${source}AIPendingExplanation`] } }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger AI curation for a source
router.post('/curate', async (req, res) => {
  try {
    const { source, selectedIds } = req.body;
    if (!source) return res.status(400).json({ error: 'Source is required' });
    
    taskQueue.enqueue(`AI Curate ${source}`, async (id, progress, checkCancelled) => {
      await aiService.curateMedia(source, progress, checkCancelled, selectedIds);
    }, true);
    
    res.json({ success: true, message: 'AI curation started in background' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger AI learning for a source
router.post('/learn', async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: 'Source is required' });
    
    taskQueue.enqueue(`Learn AI Rules ${source}`, async (id, progress) => {
      progress(0);
      await aiService.updateRules(source);
      progress(100);
    }, false);
    
    res.json({ success: true, message: 'AI learning started in background' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
