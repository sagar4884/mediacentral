import { Router } from 'express';
import { taskQueue } from '../services/taskQueue';

const router = Router();

// Get the current active task and the rest of the queue
router.get('/', (req, res) => {
  try {
    const active = taskQueue.getActiveTask();
    const all = taskQueue.getTasks();
    res.json({ active, queue: all });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/cancel', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Task ID is required' });
    taskQueue.cancelTask(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

export default router;
